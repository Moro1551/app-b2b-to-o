import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { getAuthToken } from "./auth-context";

const envUrl =
  (process.env.EXPO_PUBLIC_BACKEND_URL as string | undefined) ??
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_BACKEND_URL;
const BACKEND = envUrl?.replace(/\/$/, "") ?? "";
const API_BASE = `${BACKEND}/api`;

// Turns a failed upload response into an Error carrying the backend's "detail" message.
async function uploadError(res: Response): Promise<Error> {
  const txt = await res.text();
  let detail: unknown = txt;
  try { detail = JSON.parse(txt).detail ?? txt; } catch {}
  return new Error(typeof detail === "string" && detail ? detail : `HTTP ${res.status}`);
}

/** Spanish message for an upload failure, ready for an alert. */
export function describeUploadError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (!msg || /network request failed|failed to fetch|aborted/i.test(msg)) {
    return "No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.";
  }
  return msg;
}

export function toRemoteUrl(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/api/")) return `${BACKEND}${pathOrUrl}`;
  // raw object storage path like "mis-negocios/uploads/.../x.jpg"
  if (pathOrUrl.includes("/uploads/")) return `${BACKEND}/api/files/${pathOrUrl}`;
  return pathOrUrl; // local file:// — leave as is
}

async function uploadLocal(uri: string, mime: string): Promise<string> {
  const token = getAuthToken();
  const form = new FormData();
  const name = `photo.${mime.split("/")[1] || "jpg"}`;
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    // @ts-ignore RN native shape
    form.append("file", { uri, name, type: mime });
  }
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }, // DO NOT set Content-Type
    body: form,
  });
  if (!res.ok) throw await uploadError(res);
  const j = await res.json();
  return j.url || j.path;
}

export async function uploadAnyFile(uri: string, mime: string, filename: string): Promise<{ url: string; absoluteUrl: string }> {
  const token = getAuthToken();
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, filename);
  } else {
    // @ts-ignore RN native shape
    form.append("file", { uri, name: filename, type: mime });
  }
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw await uploadError(res);
  const j = await res.json();
  const relative = j.url || `/api/files/${j.path}`;
  return { url: relative, absoluteUrl: toRemoteUrl(relative) };
}

export async function pickImage(fromCamera = false): Promise<string | null> {
  if (fromCamera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    return await uploadLocal(res.assets[0].uri, res.assets[0].mimeType || "image/jpeg");
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return await uploadLocal(res.assets[0].uri, res.assets[0].mimeType || "image/jpeg");
}
