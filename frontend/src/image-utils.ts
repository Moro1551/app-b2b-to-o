import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export async function pickImage(fromCamera = false): Promise<string | null> {
  if (fromCamera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    return await persistLocal(res.assets[0].uri);
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return await persistLocal(res.assets[0].uri);
}

async function persistLocal(src: string): Promise<string> {
  if (Platform.OS === "web") return src;
  try {
    const dir = `${FileSystem.documentDirectory}images/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const ext = src.split(".").pop()?.split("?")[0] || "jpg";
    const dest = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: src, to: dest });
    return dest;
  } catch (e) {
    console.warn("persistLocal failed", e);
    return src;
  }
}
