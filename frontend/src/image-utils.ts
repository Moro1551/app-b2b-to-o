import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { getAuthToken } from "./auth-context";
import { responseError } from "./api";

const envUrl =
  (process.env.EXPO_PUBLIC_BACKEND_URL as string | undefined) ??
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_BACKEND_URL;
const BACKEND = envUrl?.replace(/\/$/, "") ?? "";
const API_BASE = `${BACKEND}/api`;

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
  if (!res.ok) throw await responseError(res);
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
  if (!res.ok) throw await responseError(res);
  const j = await res.json();
  const relative = j.url || `/api/files/${j.path}`;
  return { url: relative, absoluteUrl: toRemoteUrl(relative) };
}

// Photos are stored in the database (free tier: 512 MB), so shrink them before uploading:
// longest side 1280 px, JPEG at 70% is roughly 150–300 KB instead of several MB.
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.7;

async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<{ uri: string; mime: string }> {
  try {
    const ctx = ImageManipulator.manipulate(asset.uri);
    const { width = 0, height = 0 } = asset;
    if (width > MAX_SIDE || height > MAX_SIDE) {
      ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    const image = await ctx.renderAsync();
    const out = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    return { uri: out.uri, mime: "image/jpeg" };
  } catch (e) {
    console.warn("shrink failed, uploading original", e);
    return { uri: asset.uri, mime: asset.mimeType || "image/jpeg" };
  }
}

export async function pickImage(fromCamera = false): Promise<string | null> {
  let res: ImagePicker.ImagePickerResult;
  if (fromCamera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new Error("La app no tiene permiso para usar la cámara. Actívalo en Ajustes > Apps > Mis Negocios > Permisos.");
    }
    res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, allowsEditing: false });
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new Error("La app no tiene permiso para ver tus fotos. Actívalo en Ajustes > Apps > Mis Negocios > Permisos.");
    }
    res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, allowsEditing: false });
  }
  if (res.canceled || !res.assets?.[0]) return null;
  const { uri, mime } = await shrink(res.assets[0]);
  return await uploadLocal(uri, mime);
}
