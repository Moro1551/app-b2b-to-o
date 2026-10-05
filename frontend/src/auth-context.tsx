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
const API_BASE = `${envUrl?.replace(/\/$/, "")}/api`;

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

type User = { user_id: string; email: string; name?: string; picture?: string };
type Ctx = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const processedIds = useRef<Set<string>>(new Set());
  const latestLinkUrl = useRef<string | null>(null);
  const qc = useQueryClient();

  const exchangeSessionId = useCallback(async (sessionId: string) => {
    if (processedIds.current.has(sessionId)) return;
    processedIds.current.add(sessionId);
    try {
      const res = await fetch(`${API_BASE}/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      memToken = j.session_token;
      await saveToken(j.session_token);
      setUser(j.user);
    } catch (e) {
      console.warn("auth exchange failed", e);
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
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const u = await res.json();
        setUser(u);
      } else {
        memToken = null;
        await saveToken(null);
        setUser(null);
      }
    } catch {
      // Keep token; may be offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
    if (sid) await exchangeSessionId(sid);
  }, [exchangeSessionId]);

  const signOut = useCallback(async () => {
    try {
      if (memToken) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${memToken}` },
        });
      }
    } catch {}
    memToken = null;
    await saveToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
