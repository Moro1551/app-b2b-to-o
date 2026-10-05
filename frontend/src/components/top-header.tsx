import { useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { colors, radius, spacing } from "@/src/theme";
import { useBusiness } from "@/src/business-context";
import { toRemoteUrl } from "@/src/image-utils";
import { BusinessSwitcherSheet } from "./business-switcher";

export function TopHeader({ title }: { title?: string }) {
  const insets = useSafeAreaInsets();
  const { activeBusiness } = useBusiness();
  const sheetRef = useRef<BottomSheetModal>(null);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable
        testID="business-switcher-btn"
        style={styles.pill}
        onPress={() => sheetRef.current?.present()}
      >
        <View style={styles.avatar}>
          {activeBusiness?.logo ? (
            <Image source={{ uri: toRemoteUrl(activeBusiness.logo) }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarTxt}>{activeBusiness?.name?.charAt(0)?.toUpperCase() ?? "?"}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {activeBusiness?.name ?? "Sin negocio"}
          </Text>
          {!!activeBusiness?.subtitle && (
            <Text style={styles.sub} numberOfLines={1}>{activeBusiness.subtitle}</Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {title && <Text style={styles.pageTitle}>{title}</Text>}
      <BusinessSwitcherSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pill: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  avatarImg: { width: 36, height: 36 },
  avatarTxt: { color: colors.onBrandSecondary, fontWeight: "600" },
  name: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  pageTitle: {
    fontSize: 28, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md,
  },
});
