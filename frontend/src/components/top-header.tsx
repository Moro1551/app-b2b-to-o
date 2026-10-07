import { useCallback, useRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useFocusEffect, useRouter } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { colors, radius, spacing } from "@/src/theme";
import { useBusiness } from "@/src/business-context";
import { toRemoteUrl } from "@/src/image-utils";
import { BusinessSwitcherSheet } from "./business-switcher";

// Focused screens with a dark header. Navigating may fire the new focus before the old blur,
// so the status bar only goes back to dark once no such screen is focused.
let focusedDarkHeaders = 0;

/** Light status bar icons while the calling screen (which has a navy header) is focused. */
export function useLightStatusBar() {
  useFocusEffect(
    useCallback(() => {
      focusedDarkHeaders += 1;
      setStatusBarStyle("light");
      return () => {
        focusedDarkHeaders -= 1;
        if (focusedDarkHeaders === 0) setStatusBarStyle("dark");
      };
    }, []),
  );
}

export function TopHeader({ title, right }: { title?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { activeBusiness } = useBusiness();
  const sheetRef = useRef<BottomSheetModal>(null);
  useLightStatusBar();

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
        <Ionicons name="chevron-expand-outline" size={18} color={colors.onHeaderMuted} />
      </Pressable>
      {(title || right) && (
        <View style={styles.titleRow}>
          {title && <Text style={styles.pageTitle}>{title}</Text>}
          {right}
        </View>
      )}
      <BusinessSwitcherSheet ref={sheetRef} />
    </View>
  );
}

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Navy bar for screens pushed on top of the tabs: back button, centered title, optional action. */
export function SubHeader({ title, subtitle, action, backTestID = "header-back" }: {
  title: string;
  subtitle?: string;
  action?: { icon: IconName; label: string; onPress: () => void; testID?: string };
  backTestID?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  return (
    <View style={[styles.subBar, { paddingTop: insets.top + spacing.xs }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.subBtn} testID={backTestID} accessibilityLabel="Atrás">
        <Ionicons name="chevron-back" size={26} color={colors.onHeader} />
      </Pressable>
      <View style={styles.subTitles}>
        <Text style={styles.subTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subSubtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={10} style={styles.subBtn} testID={action.testID} accessibilityLabel={action.label}>
          <Ionicons name={action.icon} size={24} color={colors.onHeader} />
        </Pressable>
      ) : (
        <View style={styles.subBtn} />
      )}
    </View>
  );
}

/** Compact accent button for the header's `right` slot, e.g. "+ Nuevo". */
export function HeaderAction({ icon, label, onPress, testID }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={styles.action} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={18} color={colors.onBrand} />
      <Text style={styles.actionTxt}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.header,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  pill: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.headerControl,
    paddingLeft: spacing.sm, paddingRight: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  avatar: {
    width: 36, height: 36, borderRadius: radius.sm,
    backgroundColor: colors.brand,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  avatarImg: { width: 36, height: 36 },
  avatarTxt: { color: colors.onBrand, fontWeight: "700", fontSize: 16 },
  name: { fontSize: 15, fontWeight: "600", color: colors.onHeader },
  sub: { fontSize: 12, color: colors.onHeaderMuted, marginTop: 1 },
  titleRow: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    gap: spacing.md, marginTop: spacing.lg,
  },
  pageTitle: { fontSize: 30, fontWeight: "800", color: colors.onHeader, letterSpacing: -0.5 },
  subBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.sm, paddingBottom: spacing.sm,
    backgroundColor: colors.header,
  },
  subBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  subTitles: { flex: 1, alignItems: "center" },
  subTitle: { fontSize: 17, fontWeight: "700", color: colors.onHeader },
  subSubtitle: { fontSize: 12, color: colors.onHeaderMuted, marginTop: 1 },
  action: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingLeft: spacing.sm, paddingRight: spacing.md, paddingVertical: spacing.sm,
  },
  actionTxt: { color: colors.onBrand, fontSize: 14, fontWeight: "700" },
});
