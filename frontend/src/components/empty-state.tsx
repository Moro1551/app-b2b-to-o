import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, radius, spacing } from "@/src/theme";
import Ionicons from "@react-native-vector-icons/ionicons";

export function EmptyState({
  title, message, icon = "sparkles-outline", action, actionLabel, secondaryAction, secondaryLabel,
}: {
  title: string; message: string; icon?: any;
  action?: () => void; actionLabel?: string;
  /** Optional text link under the main button. */
  secondaryAction?: () => void; secondaryLabel?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={44} color={colors.brandPrimary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.msg}>{message}</Text>
      {action && (
        <Pressable style={styles.btn} onPress={action} testID="empty-cta">
          <Text style={styles.btnTxt}>{actionLabel ?? "Añadir"}</Text>
        </Pressable>
      )}
      {secondaryAction && !!secondaryLabel && (
        <Pressable onPress={secondaryAction} hitSlop={8} style={styles.link} testID="empty-secondary">
          <Text style={styles.linkTxt}>{secondaryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", padding: spacing.xl, marginTop: spacing.xxxl },
  iconWrap: {
    width: 88, height: 88, borderRadius: radius.lg,
    backgroundColor: colors.brandTertiary,
    justifyContent: "center", alignItems: "center",
    marginBottom: spacing.lg,
  },
  title: { fontSize: 18, fontWeight: "600", color: colors.onSurface, marginBottom: spacing.xs },
  msg: { fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: spacing.lg, paddingHorizontal: spacing.lg },
  btn: {
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: "600" },
  link: { marginTop: spacing.md, paddingVertical: spacing.xs },
  linkTxt: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: 14 },
});
