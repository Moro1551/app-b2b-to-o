import { useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TopHeader } from "@/src/components/top-header";
import { useBusiness, formatMoney } from "@/src/business-context";
import { api } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function Dashboard() {
  const router = useRouter();
  const { activeId, activeBusiness } = useBusiness();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard", activeId],
    queryFn: () => api.dashboard(activeId!),
    enabled: !!activeId,
  });

  const onRefresh = useCallback(() => {
    refetch();
    qc.invalidateQueries({ queryKey: ["products", activeId] });
  }, [refetch, qc, activeId]);

  const currency = activeBusiness?.currency || "L";

  return (
    <View style={styles.wrap}>
      <TopHeader title="Inicio" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl + insets.bottom }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {isLoading && !data ? (
          <View style={{ padding: spacing.xxl, alignItems: "center" }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <>
            <View style={styles.heroCard} testID="dashboard-sales-card">
              <Text style={styles.heroLabel}>Ventas de hoy</Text>
              <Text style={styles.heroValue}>{formatMoney(data?.today_sales_total ?? 0, currency)}</Text>
              <Text style={styles.heroSub}>{data?.today_sales_count ?? 0} ventas · Capital: {formatMoney(data?.capital ?? 0, currency)}</Text>
            </View>

            <Text style={styles.sectionTitle}>Acciones rápidas</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
              <ActionChip icon="cart-outline" label="Nueva venta" onPress={() => router.push("/sale-new")} testID="action-new-sale" />
              <ActionChip icon="add-circle-outline" label="Nuevo producto" onPress={() => router.push("/product-form")} testID="action-new-product" />
              <ActionChip icon="trending-up-outline" label="Ingreso" onPress={() => router.push({ pathname: "/transaction-new", params: { type: "ingreso" } })} testID="action-new-income" />
              <ActionChip icon="trending-down-outline" label="Egreso" onPress={() => router.push({ pathname: "/transaction-new", params: { type: "egreso" } })} testID="action-new-expense" />
            </ScrollView>

            <View style={styles.statsRow}>
              <StatCard label="Productos" value={String(data?.products_total ?? 0)} icon="cube-outline" />
              <StatCard label="Clientes" value={String(data?.customers_total ?? 0)} icon="people-outline" />
            </View>
            <View style={styles.statsRow}>
              <StatCard label="Ingresos" value={formatMoney(data?.income ?? 0, currency)} icon="arrow-up-outline" tint={colors.success} />
              <StatCard label="Egresos" value={formatMoney(data?.expense ?? 0, currency)} icon="arrow-down-outline" tint={colors.error} />
            </View>

            <Text style={styles.sectionTitle}>Alertas de stock</Text>
            {data?.low_stock_count === 0 ? (
              <View style={styles.okCard}>
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                <Text style={styles.okTxt}>Todo bien, sin productos bajo mínimo</Text>
              </View>
            ) : (
              (data?.low_stock_items || []).map((p: any) => (
                <Pressable key={p.id} style={styles.alertRow} onPress={() => router.push({ pathname: "/product-form", params: { id: p.id } })} testID={`low-stock-${p.id}`}>
                  <View style={styles.dot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertName}>{p.name}</Text>
                    <Text style={styles.alertSub}>Stock: {p.stock} · Mín: {p.min_stock}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ActionChip({ icon, label, onPress, testID }: any) {
  return (
    <Pressable style={styles.chip} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={20} color={colors.brandPrimary} />
      <Text style={styles.chipTxt}>{label}</Text>
    </Pressable>
  );
}

function StatCard({ label, value, icon, tint }: any) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={20} color={tint || colors.brandPrimary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  heroCard: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.brandSecondary,
  },
  heroLabel: { fontSize: 13, color: colors.onBrandTertiary, fontWeight: "500" },
  heroValue: { fontSize: 34, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xs },
  heroSub: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.sm },
  chip: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, flexShrink: 0,
  },
  chipTxt: { color: colors.onSurface, fontWeight: "500" },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  stat: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs,
  },
  statValue: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  statLabel: { fontSize: 12, color: colors.muted },
  okCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md,
  },
  okTxt: { color: colors.onSurface, fontSize: 14 },
  alertRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.xs,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
  alertName: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  alertSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
