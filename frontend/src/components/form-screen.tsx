import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import type { ReactNode } from "react";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/src/theme";

export function FormScreen({
  title, onSave, saveLabel = "Guardar", onDelete, children,
}: {
  title: string;
  onSave: () => void;
  saveLabel?: string;
  onDelete?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="form-back">
          <Ionicons name="chevron-back" size={28} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 28 }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          {onDelete && (
            <Pressable style={styles.deleteBtn} onPress={onDelete} testID="form-delete">
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteTxt}>Eliminar</Text>
            </Pressable>
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(spacing.md, insets.bottom) }]}>
          <Pressable style={styles.saveBtn} onPress={onSave} testID="form-save">
            <Text style={styles.saveTxt}>{saveLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  label: { fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: spacing.xs, marginLeft: spacing.xs },
  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  saveBtn: {
    backgroundColor: colors.brandPrimary, paddingVertical: spacing.md,
    borderRadius: radius.pill, alignItems: "center",
  },
  saveTxt: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 16 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    paddingVertical: spacing.md, marginTop: spacing.xl,
  },
  deleteTxt: { color: colors.error, fontWeight: "600" },
});

export const formStyles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: 15, color: colors.onSurface, minHeight: 44,
  },
  textarea: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: 15, color: colors.onSurface, minHeight: 88, textAlignVertical: "top",
  },
});
