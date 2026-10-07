import { forwardRef, useCallback, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useBusiness } from "@/src/business-context";
import { toRemoteUrl } from "@/src/image-utils";

export const BusinessSwitcherSheet = forwardRef<BottomSheetModal>((_, ref) => {
  const { businesses, activeId, switchBusiness } = useBusiness();
  const router = useRouter();
  const snapPoints = useMemo(() => ["55%"], []);

  const renderBackdrop = useCallback(
    (p: any) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />,
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
    >
      <BottomSheetView style={styles.sheet}>
        <Text style={styles.title}>Cambiar de negocio</Text>
        <ScrollView style={{ maxHeight: 360 }}>
          {businesses.map((b) => {
            const active = b.id === activeId;
            return (
              <Pressable
                key={b.id}
                testID={`biz-row-${b.id}`}
                style={[styles.row, active && styles.rowActive]}
                onPress={async () => {
                  await switchBusiness(b.id);
                  (ref as any)?.current?.dismiss?.();
                }}
              >
                <View style={styles.avatar}>
                  {b.logo ? (
                    <Image source={{ uri: toRemoteUrl(b.logo) }} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarTxt}>{b.name.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{b.name}</Text>
                  {!!b.subtitle && <Text style={styles.rowSub} numberOfLines={1}>{b.subtitle}</Text>}
                </View>
                {active && (
                  <View style={styles.activeBadge}>
                    <Ionicons name="checkmark" size={11} color={colors.onBrand} />
                    <Text style={styles.activeTxt}>Activo</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          testID="biz-add-btn"
          style={styles.addBtn}
          onPress={() => {
            (ref as any)?.current?.dismiss?.();
            router.push("/business-form");
          }}
        >
          <Ionicons name="add" size={20} color={colors.onBrandSecondary} />
          <Text style={styles.addTxt}>Añadir negocio</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
BusinessSwitcherSheet.displayName = "BusinessSwitcherSheet";

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  rowActive: { borderColor: colors.brand, borderWidth: 1.5, backgroundColor: colors.brandTertiary },
  avatar: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44 },
  avatarTxt: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: 18 },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  activeBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: colors.brand, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  activeTxt: { fontSize: 11, fontWeight: "700", color: colors.onBrand },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    paddingVertical: spacing.md, marginTop: spacing.xs,
    borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong,
  },
  addTxt: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: 15 },
});
