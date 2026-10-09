import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { api } from "./api";
import { dayKey } from "./utils/dates";

/**
 * Downloads everything the user owns as a JSON file and hands it to the share sheet, so it can be
 * kept in Drive, WhatsApp or email. The free database plan keeps no backups of its own.
 */
export async function shareBackup(): Promise<void> {
  const data = await api.exportData();
  const name = `mis-negocios-respaldo-${dayKey(new Date())}.json`;
  const json = JSON.stringify(data, null, 2);

  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(json);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Este teléfono no permite compartir archivos.");
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Guardar respaldo" });
}
