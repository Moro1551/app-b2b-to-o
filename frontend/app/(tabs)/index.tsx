import { useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { TopHeader } from "@/src/components/top-header";
import { useBusiness, formatMoney } from "@/src/business-context";
import { toRemoteUrl } from "@/src/image-utils";
import { api } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

// The dashboard returns up to 10 low-stock products; the home screen previews a few.
const ALERTS_SHOWN = 3;

function todayLabel() {
  const s = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
  const salesCount = data?.today_sales_count ?? 0;
  const salesTotal = data?.today_sales_total ?? 0;
  const lowCount = data?.low_stock_count ?? 0;
  const alerts: any[] = (data?.low_stock_items || []).slice(0, ALERTS_SHOWN);

  return (
    <View style={styles.wrap}>
      <TopHeader title="Inicio" right={<Text style={styles.date}>{todayLabel()}</Text>} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.onHeader}
            colors={[colors.brandPrimary]}
          />
        }
      >
        {/* Keeps the navy color behind the hero when pulling down on iOS. */}
        <View style={styles.overscroll} />
        <View style={styles.hero} testID="dashboard-sales-card">
          <Text style={styles.heroLabel}>Ventas de hoy</Text>
          {isLoading && !data ? (
            <ActivityIndicator color={colors.onHeader} style={{ alignSelf: "flex-start", marginVertical: spacing.lg }} />
          ) : (
            <>
              <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(salesTotal, currency)}
              </Text>
              <View style={styles.heroMeta}>
                <HeroStat label="Ventas" value={String(salesCount)} />
                <HeroStat label="Ticket promedio" value={salesCount ? formatMoney(salesTotal / salesCount, currency) : "—"} />
                <HeroStat label="Capital" value={formatMoney(data?.capital ?? 0, currency)} />
              </View>
            </>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.actions}>
            <ActionTile icon="cart-outline" label="Venta" onPress={() => router.push("/sale-new")} testID="action-new-sale" />
            <ActionTile icon="cube-outline" label="Producto" onPress={() => router.push("/product-form")} testID="action-new-product" />
            <ActionTile icon="trending-up-outline" label="Ingreso" onPress={() => router.push({ pathname: "/transaction-new", params: { type: "ingreso" } })} testID="action-new-income" />
            <ActionTile icon="trending-down-outline" label="Egreso" onPress={() => router.push({ pathname: "/transaction-new", params: { type: "egreso" } })} testID="action-new-expense" />
          </View>

          {data && (
            <>
              <View style={styles.statsRow}>
                <KpiCard label="Ingresos" value={formatMoney(data.income ?? 0, currency)} icon="arrow-down-outline" tint={colors.success} soft={colors.successTertiary} />
                <KpiCard label="Egresos" value={formatMoney(data.expense ?? 0, currency)} icon="arrow-up-outline" tint={colors.error} soft={colors.errorTertiary} />
              </View>

              <View>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Alertas de stock</Text>
                  {lowCount > 0 && (
                    <Pressable
                      hitSlop={10}
                      onPress={() => router.push({ pathname: "/inventory", params: { filter: "bajo" } })}
                      testID="low-stock-see-all"
                    >
                      <Text style={styles.link}>{lowCount === 1 ? "Ver en inventario" : `Ver las ${lowCount}`}</Text>
                    </Pressable>
                  )}
                </View>
                {lowCount === 0 ? (
                  <View style={styles.okCard}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                    <Text style={styles.okTxt}>Todo bien, sin productos bajo mínimo</Text>
                  </View>
                ) : (
                  alerts.map((p, i) => (
                    <AlertRow
                      key={p.id}
                      product={p}
                      last={i === alerts.length - 1}
                      onPress={() => router.push({ pathname: "/product-form", params: { id: p.id } })}
                    />
                  ))
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text style={styles.heroStatValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ActionTile({ icon, label, onPress, testID }: any) {
  return (
    <Pressable style={styles.action} onPress={onPress} testID={testID}>
      <View style={styles.actionBox}>
        <Ionicons name={icon} size={22} color={colors.onBrandSecondary} />
      </View>
      <Text style={styles.actionTxt}>{label}</Text>
    </Pressable>
  );
}

function KpiCard({ label, value, icon, tint, soft }: any) {
  return (
    <View style={styles.kpi}>
      <View style={styles.kpiHead}>
        <View style={[styles.kpiIcon, { backgroundColor: soft }]}>
          <Ionicons name={icon} size={15} color={tint} />
        </View>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.kpiNote}>Acumulado</Text>
    </View>
  );
}

function AlertRow({ product, last, onPress }: { product: any; last: boolean; onPress: () => void }) {
  const photo = product.photos?.[0];
  return (
    <Pressable style={[styles.alertRow, !last && styles.alertDivider]} onPress={onPress} testID={`low-stock-${product.id}`}>
      {photo ? (
        <Image source={{ uri: toRemoteUrl(photo) }} style={styles.alertThumb} contentFit="cover" />
      ) : (
        <View style={[styles.alertThumb, styles.alertThumbEmpty]}>
          <Ionicons name="image-outline" size={18} color={colors.muted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.alertName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.alertSub}>Quedan {product.stock ?? 0} · mínimo {product.min_stock ?? 0}</Text>
      </View>
      <Text style={styles.link}>Reabastecer</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  date: { fontSize: 13, color: colors.onHeaderMuted, marginBottom: 4 },
  overscroll: { position: "absolute", top: -600, left: 0, right: 0, height: 600, backgroundColor: colors.header },
  hero: {
    backgroundColor: colors.header,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xl,
  },
  heroLabel: { fontSize: 13, color: colors.onHeaderMuted },
  heroValue: { fontSize: 36, fontWeight: "800", color: colors.onHeader, letterSpacing: -0.5, marginTop: spacing.xs },
  heroMeta: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  heroStatLabel: { fontSize: 11, color: colors.onHeaderMuted },
  heroStatValue: { fontSize: 14, fontWeight: "700", color: colors.onHeader, marginTop: 2 },
  body: { padding: spacing.lg, gap: spacing.lg },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1, alignItems: "center", gap: spacing.sm },
  actionBox: {
    width: 56, height: 56, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    justifyContent: "center", alignItems: "center",
  },
  actionTxt: { fontSize: 12, fontWeight: "600", color: colors.onSurface },
  statsRow: { flexDirection: "row", gap: spacing.md },
  kpi: {
    flex: 1, gap: spacing.sm, padding: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  kpiHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  kpiIcon: { width: 28, height: 28, borderRadius: radius.sm, justifyContent: "center", alignItems: "center" },
  kpiLabel: { fontSize: 13, color: colors.muted },
  kpiValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  kpiNote: { fontSize: 12, color: colors.muted },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  link: { fontSize: 13, fontWeight: "700", color: colors.onBrandSecondary },
  okCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, borderRadius: radius.lg,
  },
  okTxt: { color: colors.onSurface, fontSize: 14 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  alertDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  alertThumb: { width: 44, height: 44, borderRadius: radius.md },
  alertThumbEmpty: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" },
  alertName: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  alertSub: { fontSize: 13, color: colors.error, marginTop: 2 },
});
