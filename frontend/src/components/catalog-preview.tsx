import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/src/theme";

// Web only. expo-print can only print the app's own screen on the web, and pop-up tabs may be
// blocked, so the catalog is shown in an iframe scaled to the screen, with a button to print it
// (the browser's print dialog also saves it as PDF).

const PAGE_W = 816;
const PAGE_H = 1056;

export function CatalogPreview({ html, onClose }: { html: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [width, setWidth] = useState(0);
  const pages = html ? (html.match(/class="page"/g) || []).length || 1 : 1;
  const scale = width ? Math.min(1, (width - spacing.lg * 2) / PAGE_W) : 0;

  return (
    <Modal visible={!!html} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.wrap, { paddingTop: insets.top }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn} testID="catalog-preview-close">
            <Ionicons name="close" size={22} color={colors.onHeader} />
          </Pressable>
          <Text style={styles.title}>Vista previa · {pages} {pages === 1 ? "página" : "páginas"}</Text>
          <Pressable onPress={() => frame.current?.contentWindow?.print()} style={styles.printBtn} testID="catalog-preview-print">
            <Ionicons name="print-outline" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.printTxt}>Imprimir</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: "center" }}>
          {!!html && scale > 0 && (
            <View style={{ width: PAGE_W * scale, height: PAGE_H * pages * scale, overflow: "hidden", position: "relative" }}>
              <iframe
                ref={frame}
                srcDoc={html}
                title="Catálogo"
                // Absolute so the flex parent can't shrink it before it's scaled down to fit.
                style={{
                  position: "absolute", top: 0, left: 0, width: PAGE_W, height: PAGE_H * pages,
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
