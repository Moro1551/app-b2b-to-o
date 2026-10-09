import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/src/theme";

// Web only. expo-print can only print the app's own screen on the web, and pop-up tabs may be
// blocked, so printable documents (catalog, receipt) are shown in an iframe scaled to the screen,
// with a button to print them (the browser's print dialog also saves them as PDF).

/** `pageWidth` is the document's width in CSS px (letter: 816, A5: 559). */
export function PrintPreview({ html, title, pageWidth, onClose }: {
  html: string | null; title: string; pageWidth: number; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(pageWidth * 1.3);
  const scale = width ? Math.min(1, (width - spacing.lg * 2) / pageWidth) : 0;

  return (
    <Modal visible={!!html} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.wrap, { paddingTop: insets.top }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn} testID="print-preview-close" accessibilityLabel="Cerrar">
            <Ionicons name="close" size={22} color={colors.onHeader} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Pressable onPress={() => frame.current?.contentWindow?.print()} style={styles.printBtn} testID="print-preview-print">
            <Ionicons name="print-outline" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.printTxt}>Imprimir</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: "center" }}>
          {!!html && scale > 0 && (
            <View style={{ width: pageWidth * scale, height: height * scale, overflow: "hidden", position: "relative" }}>
              <iframe
                ref={frame}
                srcDoc={html}
                title={title}
                onLoad={(e) => setHeight(e.currentTarget.contentDocument?.documentElement.scrollHeight || height)}
                // Absolute so the flex parent can't shrink it before it's scaled down to fit.
                style={{
                  position: "absolute", top: 0, left: 0, width: pageWidth, height,
                  border: 0, background: "#fff", transform: `scale(${scale})`, transformOrigin: "top left",
                }}
              />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceTertiary },
  bar: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.brandPrimary,
  },
  iconBtn: { padding: 2 },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.onHeader },
  printBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.md, backgroundColor: colors.brand,
  },
  printTxt: { fontSize: 13, fontWeight: "700", color: colors.onBrandPrimary },
});
