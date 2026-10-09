import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, SectionList, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { SubHeader } from "@/src/components/top-header";
import { Segmented } from "@/src/components/form-screen";
import { EmptyState } from "@/src/components/empty-state";
import { dayKey, dayLabel, timeLabel } from "@/src/utils/dates";
import { colors, radius, spacing } from "@/src/theme";

type Filter = "todas" | "pendientes";

const dueOf = (s: any) => Math.max(0, (s.total || 0) - (s.paid || 0));
// Ignore rounding leftovers when comparing money amounts.
const isPending = (s: any) => dueOf(s) > 0.005;

export default function Sales() {
  const router = useRouter();
  const qc = useQueryClient();
  const { activeId, activeBusiness } = useBusiness();
  const [filter, setFilter] = useState<Filter>("todas");

  const { data: sales = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["sales", activeId],
    queryFn: () => api.listSales(activeId!),
    enabled: !!activeId,
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteSale(activeId!, id),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: any) => Alert.alert("No se pudo eliminar la venta", e?.message || "Inténtalo de nuevo."),
  });

  const currency = activeBusiness?.currency || "L";
  const totals = useMemo(() => {
    let sold = 0, due = 0, pendingCount = 0;
    for (const s of sales) {
      sold += s.total || 0;
      due += dueOf(s);
      if (isPending(s)) pendingCount += 1;
    }
    return { sold, collected: sold - due, due, pendingCount };
  }, [sales]);

  // The API returns newest first; group consecutive sales by local calendar day.
  const sections = useMemo(() => {
    const list = filter === "pendientes" ? sales.filter(isPending) : sales;
    const out: { key: string; title: string; total: number; data: any[] }[] = [];
    for (const s of list) {
      const d = new Date(s.created_at);
      const key = dayKey(d);
      let sec = out[out.length - 1];
      if (!sec || sec.key !== key) {
        sec = { key, title: dayLabel(d), total: 0, data: [] };
        out.push(sec);
      }
      sec.total += s.total || 0;
      sec.data.push(s);
    }
    return out;
  }, [sales, filter]);

  // Deleting undoes the sale on the server, so say exactly what will change.
  const confirmDelete = (sale: any) => {
    const units = (sale.items || []).reduce((n: number, i: any) => n + (i.quantity || 0), 0);
    const effects = [`${units} ${units === 1 ? "unidad vuelve" : "unidades vuelven"} al inventario`];
    if ((sale.paid || 0) > 0) effects.push(`se quita de Movimientos lo cobrado (${formatMoney(sale.paid, currency)})`);
    Alert.alert("Eliminar venta", `Se deshará la venta: ${effects.join(" y ")}.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => delMut.mutate(sale.id) },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <SubHeader
        title="Ventas"
        subtitle={activeBusiness?.name}
        action={{ icon: "add", label: "Nueva venta", onPress: () => router.push("/sale-new"), testID: "sales-add" }}
      />

      {isLoading ? (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : sales.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="Aún no hay ventas"
          message="Registra tu primera venta para verla aquí."
          actionLabel="Registrar venta"
          action={() => router.push("/sale-new")}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListHeaderComponent={
            <View style={styles.top}>
              <View style={styles.totals}>
                <Total label="Vendido" value={formatMoney(totals.sold, currency)} />
                <Total label="Cobrado" value={formatMoney(totals.collected, currency)} tint={colors.success} />
                <Total label="Pendiente" value={formatMoney(totals.due, currency)} tint={totals.due > 0.005 ? colors.warning : colors.onSurface} />
              </View>
              <Segmented
                options={[["todas", "Todas"], ["pendientes", `Pendientes · ${totals.pendingCount}`]]}
                value={filter}
                onChange={setFilter}
                testIDPrefix="sales-filter"
              />
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No hay ventas pendientes de cobro.</Text>}
          renderSectionHeader={({ section }) => (
            <View style={styles.dayHead}>
              <Text style={styles.dayTitle}>{section.title}</Text>
              <Text style={styles.dayTotal}>{formatMoney(section.total, currency)}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <SaleCard
              sale={item}
              currency={currency}
              onPress={() => router.push({ pathname: "/sale-pay", params: { id: item.id } })}
              onLongPress={() => confirmDelete(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </View>
  );
}

function Total({ label, value, tint = colors.onSurface }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function SaleCard({ sale, currency, onPress, onLongPress }: {
  sale: any;
  currency: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const due = dueOf(sale);
  const pending = isPending(sale);
  const items = (sale.items || []).map((i: any) => `${i.quantity}× ${i.name}`).join(", ");
  return (
    <Pressable style={styles.card} onPress={onPress} onLongPress={onLongPress} testID={`sale-${sale.id}`}>
      <View style={styles.cardTop}>
        <Text style={styles.customer} numberOfLines={1}>{sale.customer_name || "Sin cliente"}</Text>
        <Text style={styles.amount}>{formatMoney(sale.total || 0, currency)}</Text>
      </View>
      {!!items && <Text style={styles.items} numberOfLines={2}>{items}</Text>}
      <View style={styles.cardBottom}>
        <Text style={styles.time}>{timeLabel(new Date(sale.created_at))}</Text>
        <View style={[styles.badge, { backgroundColor: pending ? colors.warningTertiary : colors.successTertiary }]}>
          <View style={[styles.badgeDot, { backgroundColor: pending ? colors.warning : colors.success }]} />
          <Text style={[styles.badgeTxt, { color: pending ? colors.warning : colors.success }]}>
            {pending ? `Debe ${formatMoney(due, currency)}` : "Pagado"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  top: { gap: spacing.md, marginBottom: spacing.xs },
  totals: { flexDirection: "row", gap: spacing.sm },
  total: {
    flex: 1, gap: 4, padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  totalLabel: { fontSize: 12, color: colors.muted },
  totalValue: { fontSize: 16, fontWeight: "800" },
  empty: { textAlign: "center", color: colors.muted, fontSize: 14, paddingVertical: spacing.xxl },
  dayHead: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
    paddingTop: spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: 2,
  },
  dayTitle: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  dayTotal: { fontSize: 12, fontWeight: "600", color: colors.muted },
  card: {
    gap: spacing.sm, padding: 14,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  customer: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.onSurface },
  amount: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  items: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { fontSize: 12, color: colors.muted },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeTxt: { fontSize: 11, fontWeight: "700" },
});
