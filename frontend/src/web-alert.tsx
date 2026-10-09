import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { AlertButton } from "react-native";
import { colors, radius, spacing } from "@/src/theme";

// react-native-web's Alert.alert does nothing, so on the web delete confirmations and error messages
// silently vanished. The browser's own alert()/confirm() aren't an option either: embedded browsers
// may block them. On the web, Alert.alert shows this in-app dialog instead; phones keep the native one.

type Dialog = { title: string; message?: string; buttons: AlertButton[] };

let showDialog: ((d: Dialog) => void) | null = null;

if (Platform.OS === "web") {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    showDialog?.({ title, message, buttons: buttons?.length ? buttons : [{ text: "OK" }] });
  };
}

/** Mount once near the app root. Renders nothing on iOS and Android. */
export function WebAlertHost() {
  const [queue, setQueue] = useState<Dialog[]>([]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    showDialog = (d) => setQueue((q) => [...q, d]);
    return () => { showDialog = null; };
  }, []);

  const dialog = queue[0];
  if (!dialog) return null;

  const press = (b: AlertButton) => {
    setQueue((q) => q.slice(1));
    b.onPress?.();
  };
  const cancel = dialog.buttons.find((b) => b.style === "cancel");

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => press(cancel || dialog.buttons[0])}>
      <View style={styles.backdrop}>
        <View style={styles.card} role="alertdialog" aria-label={dialog.title}>
          <Text style={styles.title}>{dialog.title}</Text>
          {!!dialog.message && <Text style={styles.message}>{dialog.message}</Text>}
          <View style={styles.buttons}>
            {dialog.buttons.map((b, i) => {
              const destructive = b.style === "destructive";
              const isCancel = b.style === "cancel";
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  onPress={() => press(b)}
                  style={[styles.btn, isCancel ? styles.btnCancel : destructive ? styles.btnDanger : styles.btnPrimary]}
                  testID={`alert-btn-${i}`}
                >
                  <Text style={[styles.btnTxt, isCancel && { color: colors.onSurface }]}>{b.text || "OK"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0, 24, 63, 0.45)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  card: {
    width: "100%", maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  message: { fontSize: 14, lineHeight: 20, color: colors.muted },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.sm },
  btn: { paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.md, minWidth: 96, alignItems: "center" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnDanger: { backgroundColor: colors.error },
  btnCancel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  btnTxt: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
});
