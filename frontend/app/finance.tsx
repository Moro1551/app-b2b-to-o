import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { SubHeader } from "@/src/components/top-header";
import { FilterChips, FilterChip } from "@/src/components/list-tools";
import { EmptyState } from "@/src/components/empty-state";
import { dayLabel } from "@/src/utils/dates";
import { colors, radius, spacing } from "@/src/theme";

type Filter = "todos" | "ingreso" | "egreso";

export default function Finance() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { activeId, activeBusiness } = useBusiness();
  const [filter, setFilter] = useState<Filter>("todos");

  const { data: txs = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["transactions", activeId],
    queryFn: () => api.listTransactions(activeId!),
    enabled: !!activeId,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(activeId!, id),
    onSuccess: () => qc.invalidateQueries(),
  });

  const currency = activeBusiness?.currency || "L";
  const sums = useMemo(() => {
    let income = 0, expense = 0, incomeCount = 0;
    for (const t of txs) {
      if (t.type === "ingreso") { income += t.amount || 0; incomeCount += 1; }
      else expense += t.amount || 0;
    }
    return { income, expense, balance: income - expense, incomeCount, expenseCount: txs.length - incomeCount };
  }, [txs]);
  const filtered = filter === "todos" ? txs : txs.filter((t: any) => t.type === filter);
  // Bars are relative to the larger of the two totals.
  const barMax = Math.max(sums.income, sums.expense, 1);

  const newTx = (type: "ingreso" | "egreso") => router.push({ pathname: "/transaction-new", params: { type } });
  const confirmDelete = (id: string) =>
    Alert.alert("Eliminar", "¿Eliminar este movimiento?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => delMut.mutate(id) },
    ]);

  return (
    <View style={styles.wrap}>
      <SubHeader
        title="Movimientos"
        subtitle={activeBusiness?.name}
        action={{ icon: "add", label: "Nuevo movimiento", onPress: () => newTx("ingreso"), testID: "finance-add" }}
      />

      {isLoading ? (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : txs.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="Aún no hay movimientos"
          message="Registra ingresos y egresos para conocer el capital de tu negocio. Las ventas cobradas se agregan solas."
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListHeaderComponent={
            <View style={styles.top}>
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>Balance</Text>
                <Text style={[styles.balanceValue, sums.balance < 0 && { color: colors.error }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(sums.balance, currency)}
                </Text>
                <Bar label="Ingresos" value={formatMoney(sums.income, currency)} ratio={sums.income / barMax} tint={colors.success} />
                <Bar label="Egresos" value={formatMoney(sums.expense, currency)} ratio={sums.expense / barMax} tint={colors.error} />
              </View>
              <FilterChips>
                <FilterChip id="Todos" label={`Todos · ${txs.length}`} active={filter === "todos"} onPress={() => setFilter("todos")} />
                <FilterChip id="Ingresos" label={`Ingresos · ${sums.incomeCount}`} active={filter === "ingreso"} onPress={() => setFilter("ingreso")} />
                <FilterChip id="Egresos" label={`Egresos · ${sums.expenseCount}`} active={filter === "egreso"} onPress={() => setFilter("egreso")} />
              </FilterChips>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No hay movimientos de este tipo.</Text>}
          renderItem={({ item, index }) => (
            <TxRow
              tx={item}
              currency={currency}
              last={index === filtered.length - 1}
              onLongPress={() => confirmDelete(item.id)}
            />
          )}
        />
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(spacing.md, insets.bottom) }]}>
        <Pressable style={styles.footerBtn} onPress={() => newTx("ingreso")} testID="finance-new-income">
          <Ionicons name="trending-up-outline" size={18} color={colors.success} />
          <Text style={styles.footerTxt}>Ingreso</Text>
        </Pressable>
        <Pressable style={styles.footerBtn} onPress={() => newTx("egreso")} testID="finance-new-expense">
          <Ionicons name="trending-down-outline" size={18} color={colors.error} />
          <Text style={styles.footerTxt}>Egreso</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Bar({ label, value, ratio, tint }: { label: string; value: string; ratio: number; tint: string }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={[styles.barValue, { color: tint }]}>{value}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
}

function TxRow({ tx, currency, last, onLongPress }: { tx: any; currency: string; last: boolean; onLongPress: () => void }) {
  const income = tx.type === "ingreso";
  const tint = income ? colors.success : colors.error;
  const meta = [tx.category, tx.created_at ? dayLabel(new Date(tx.created_at)) : ""].filter(Boolean).join(" · ");
  return (
    <Pressable style={[styles.row, !last && styles.rowDivider]} onLongPress={onLongPress} testID={`tx-${tx.id}`}>
      <View style={[styles.iconBox, { backgroundColor: income ? colors.successTertiary : colors.errorTertiary }]}>
        <Ionicons name={income ? "arrow-down-outline" : "arrow-up-outline"} size={17} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{tx.description || tx.category || (income ? "Ingreso" : "Egreso")}</Text>
        {!!meta && <Text style={styles.rowSub}>{meta}</Text>}
      </View>
      <Text style={[styles.amount, { color: tint }]}>
        {income ? "+" : "−"} {formatMoney(tx.amount, currency)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  // No horizontal padding here so the chips can scroll edge to edge; cards and rows add their own margin.
  top: { paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  balanceCard: {
    gap: spacing.md, padding: spacing.lg, marginHorizontal: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  balanceLabel: { fontSize: 13, color: colors.muted, marginBottom: -spacing.sm },
  balanceValue: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  barHead: { flexDirection: "row", justifyContent: "space-between" },
  barLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  barValue: { fontSize: 13, fontWeight: "700" },
  barTrack: { height: 8, borderRadius: 2, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 2 },
  empty: { textAlign: "center", color: colors.muted, fontSize: 14, paddingVertical: spacing.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, marginHorizontal: spacing.lg },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBox: { width: 36, height: 36, borderRadius: radius.sm, justifyContent: "center", alignItems: "center" },
  rowTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: "700" },
  footer: {
    flexDirection: "row", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    paddingVertical: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  footerTxt: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
});
