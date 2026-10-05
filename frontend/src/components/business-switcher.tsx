import { forwardRef, useCallback, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useBusiness } from "@/src/business-context";

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
        <Text style={styles.title}>Mis Negocios</Text>
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
                    <Image source={{ uri: b.logo }} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarTxt}>{b.name.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{b.name}</Text>
                  {!!b.subtitle && <Text style={styles.rowSub}>{b.subtitle}</Text>}
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
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
          <Ionicons name="add-circle-outline" size={22} color={colors.brandPrimary} />
          <Text style={styles.addTxt}>Añadir negocio</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
BusinessSwitcherSheet.displayName = "BusinessSwitcherSheet";

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  title: { fontSize: 20, fontWeight: "600", color: colors.onSurface, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  rowActive: { backgroundColor: colors.brandTertiary },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44 },
  avatarTxt: { color: colors.onBrandSecondary, fontWeight: "600", fontSize: 18 },
  rowName: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.md, marginTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  addTxt: { color: colors.brandPrimary, fontWeight: "600", fontSize: 15 },
});
