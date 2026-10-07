import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "mn_session_token";
import Constants from "expo-constants";
const envUrl =
  (process.env.EXPO_PUBLIC_BACKEND_URL as string | undefined) ??
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_BACKEND_URL;
const API_BASE = envUrl ? `${envUrl.replace(/\/$/, "")}/api` : null;

// The free hosting plan sleeps when idle and needs up to ~1 min to wake up.
const AUTH_TIMEOUT_MS = 90_000;

const MSG_NO_CONFIG = "La app no tiene configurada la dirección del servidor.";
const MSG_NETWORK = "No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.";
const MSG_SESSION = "No se pudo validar tu inicio de sesión con Google. Inténtalo de nuevo.";
const msgServer = (status: number) => `El servidor respondió con un error (HTTP ${status}). Inténtalo en unos minutos.`;

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!API_BASE) throw new Error(MSG_NO_CONFIG);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AUTH_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function describeError(e: unknown): string {
  if (e instanceof HttpError) return e.status === 401 ? MSG_SESSION : msgServer(e.status);
  if (e instanceof Error && e.message === MSG_NO_CONFIG) return MSG_NO_CONFIG;
  return MSG_NETWORK;
}

async function saveToken(t: string | null) {
  if (Platform.OS === "web") {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } else {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}
async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

let memToken: string | null = null;
export function getAuthToken() { return memToken; }

// api.ts calls this when the backend rejects the stored token (HTTP 401).
let unauthorizedHandler: (() => void) | null = null;
export function notifyUnauthorized() { unauthorizedHandler?.(); }

type User = { user_id: string; email: string; name?: string; picture?: string };
type Ctx = {
  user: User | null;
  loading: boolean;
  /** True while talking to the backend after Google sign-in or when retrying. */
  busy: boolean;
  /** Last sign-in problem, in Spanish, ready to show to the user. */
  error: string | null;
  /** A saved session exists but the server could not be reached to confirm it. */
  canRetry: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
};
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const processedIds = useRef<Set<string>>(new Set());
  const latestLinkUrl = useRef<string | null>(null);
  const qc = useQueryClient();

  const exchangeSessionId = useCallback(async (sessionId: string) => {
    if (processedIds.current.has(sessionId)) return;
    processedIds.current.add(sessionId);
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) throw new HttpError(res.status);
      const j = await res.json();
      memToken = j.session_token;
      await saveToken(j.session_token);
      setCanRetry(false);
      setUser(j.user);
    } catch (e) {
      console.warn("auth exchange failed", e);
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const extractSessionId = (url: string | null): string | null => {
    if (!url) return null;
    const m = url.match(/[?#&]session_id=([^&#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  };

  const checkExisting = useCallback(async () => {
    const t = await loadToken();
    if (!t) { setLoading(false); return; }
    memToken = t;
    try {
      const res = await authFetch("/auth/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const u = await res.json();
        setError(null);
        setCanRetry(false);
        setUser(u);
      } else if (res.status === 401) {
        memToken = null;
        await saveToken(null);
        setUser(null);
      } else {
        // Server trouble: keep the token so the user can retry without signing in again.
        setError(msgServer(res.status));
        setCanRetry(true);
      }
    } catch (e) {
      // Offline or server asleep: keep the token and offer a retry.
      setError(describeError(e));
      setCanRetry(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (memToken) {
        await authFetch("/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${memToken}` },
        });
      }
    } catch {}
    memToken = null;
    await saveToken(null);
    setUser(null);
    setCanRetry(false);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    unauthorizedHandler = () => {
      memToken = null;
      saveToken(null);
      setUser(null);
      setError("Tu sesión expiró. Inicia sesión de nuevo.");
      qc.clear();
    };
    return () => { unauthorizedHandler = null; };
  }, [qc]);

  useEffect(() => {
    // Wake the backend up early: on the free plan it may be asleep, and this
    // overlaps the wake-up with the time the user spends on the Google screen.
    if (API_BASE) fetch(`${API_BASE}/health`).catch(() => {});

    // Web URL handling
    if (Platform.OS === "web") {
      const url = window.location.href;
      const sid = extractSessionId(url);
      if (sid) {
        exchangeSessionId(sid).then(() => {
          try {
            const u = new URL(window.location.href);
            u.hash = "";
            u.searchParams.delete("session_id");
            window.history.replaceState(window.history.state, "", u.toString());
          } catch {}
          setLoading(false);
        });
        return;
      }
      checkExisting();
      return;
    }

    // Mobile: register listener BEFORE anything
    const sub = Linking.addEventListener("url", ({ url }) => {
      latestLinkUrl.current = url;
      const sid = extractSessionId(url);
      if (sid) exchangeSessionId(sid);
    });
    (async () => {
      const initial = await Linking.getInitialURL();
      const sid = extractSessionId(initial);
      if (sid) {
        await exchangeSessionId(sid);
      }
      await checkExisting();
    })();
    return () => { sub.remove(); };
  }, [exchangeSessionId, checkExisting]);

  const signIn = useCallback(async () => {
    setError(null);
    if (!API_BASE) { setError(MSG_NO_CONFIG); return; }
    const redirectUrl = Platform.OS === "web"
      ? window.location.origin + "/"
      : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let url: string | null = null;
    if (result.type === "success" && (result as any).url) url = (result as any).url;
    if (!url) url = latestLinkUrl.current;
    if (!url) url = await Linking.getInitialURL();
    const sid = extractSessionId(url);
    // No session id means the user closed the Google screen: not an error.
    if (sid) await exchangeSessionId(sid);
  }, [exchangeSessionId]);

  const retry = useCallback(async () => {
    setBusy(true);
    setError(null);
    try { await checkExisting(); } finally { setBusy(false); }
  }, [checkExisting]);

  return (
    <AuthCtx.Provider value={{ user, loading, busy, error, canRetry, signIn, signOut, retry }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
