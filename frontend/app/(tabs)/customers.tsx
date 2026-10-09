import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { TopHeader, HeaderAction } from "@/src/components/top-header";
import { SearchBar, FilterChips, FilterChip } from "@/src/components/list-tools";
import { EmptyState } from "@/src/components/empty-state";
import { useBusiness, formatMoney } from "@/src/business-context";
import { api } from "@/src/api";
import { openWhatsapp, paymentReminder } from "@/src/whatsapp";
import { colors, radius, spacing } from "@/src/theme";

type Stats = { count: number; total: number; due: number };

// Ignore rounding leftovers when comparing money amounts.
const hasDebt = (s?: Stats) => !!s && s.due > 0.005;
const purchases = (n: number) => `${n} ${n === 1 ? "compra" : "compras"}`;

export default function Customers() {
  const { activeId, activeBusiness } = useBusiness();
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Kept in the route, like Inventario, so a link can open the list already filtered.
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = params.filter || "todos";
  const setFilter = (f: string) => router.setParams({ filter: f });

  const { data: customers = [], isLoading, refetch } = useQuery({
    queryKey: ["customers", activeId],
    queryFn: () => api.listCustomers(activeId!),
    enabled: !!activeId,
  });
  const { data: sales = [], isSuccess: salesReady, refetch: refetchSales } = useQuery({
    queryKey: ["sales", activeId],
    queryFn: () => api.listSales(activeId!),
    enabled: !!activeId,
  });

  const stats = useMemo(() => {
    const byCustomer = new Map<string, Stats>();
    for (const s of sales) {
      if (!s.customer_id) continue;
      const st = byCustomer.get(s.customer_id) ?? { count: 0, total: 0, due: 0 };
      st.count += 1;
      st.total += s.total || 0;
      st.due += Math.max(0, (s.total || 0) - (s.paid || 0));
      byCustomer.set(s.customer_id, st);
    }
    return byCustomer;
  }, [sales]);

  const debtors = useMemo(() => customers.filter((c: any) => hasDebt(stats.get(c.id))), [customers, stats]);
  const totalDue = debtors.reduce((sum: number, c: any) => sum + stats.get(c.id)!.due, 0);
  const noPurchases = useMemo(() => customers.filter((c: any) => !stats.has(c.id)).length, [customers, stats]);

  const filtered = useMemo(() => {
    let list = customers;
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (c: any) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q),
      );
    }
    if (filter === "saldo") list = list.filter((c: any) => hasDebt(stats.get(c.id)));
    else if (filter === "sin-compras") list = list.filter((c: any) => !stats.has(c.id));
    return list;
  }, [customers, query, filter, stats]);

  const currency = activeBusiness?.currency || "L";
  const count = (n: number) => (salesReady ? ` · ${n}` : "");

  // Customers who owe get the chat opened with a reminder of their balance, ready to send.
  const contact = (c: any) => {
    if (!hasDebt(stats.get(c.id))) { openWhatsapp(c.phone); return; }
    openWhatsapp(c.phone, paymentReminder({
      customerName: c.name, businessName: activeBusiness?.name, currency,
      sales: sales.filter((s: any) => s.customer_id === c.id),
    }));
  };

  return (
    <View style={styles.wrap}>
      <TopHeader
        title="Clientes"
        right={<HeaderAction icon="person-add-outline" label="Nuevo" onPress={() => router.push("/customer-form")} testID="add-customer-btn" />}
      />
      {(isLoading || customers.length > 0) && (
        <View style={styles.tools}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por nombre o teléfono"
            testID="customers-search"
            style={styles.inset}
          />
          <FilterChips>
            <FilterChip id="Todos" label={`Todos · ${customers.length}`} active={filter === "todos"} onPress={() => setFilter("todos")} />
            <FilterChip id="Con saldo" label={`Con saldo${count(debtors.length)}`} active={filter === "saldo"} onPress={() => setFilter("saldo")} />
            <FilterChip id="Sin compras" label={`Sin compras${count(noPurchases)}`} active={filter === "sin-compras"} onPress={() => setFilter("sin-compras")} />
          </FilterChips>
          {debtors.length > 0 && filter !== "saldo" && (
            <Pressable style={[styles.inset, styles.dueBanner]} onPress={() => setFilter("saldo")} testID="customers-due-banner">
              <Ionicons name="cash-outline" size={18} color={colors.warning} />
              <Text style={styles.dueTxt}>
                Por cobrar: {formatMoney(totalDue, currency)} de {debtors.length} {debtors.length === 1 ? "cliente" : "clientes"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.warning} />
            </Pressable>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : customers.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No hay clientes"
          message="Registra tus clientes para dar seguimiento a sus compras."
          actionLabel="Añadir cliente"
          action={() => router.push("/customer-form")}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
          renderItem={({ item }) => (
            <CustomerRow
              item={item}
              stats={salesReady ? stats.get(item.id) : undefined}
              showStats={salesReady}
              currency={currency}
              onPress={() => router.push({ pathname: "/customer-form", params: { id: item.id } })}
              onWhatsapp={() => contact(item)}
            />
          )}
          ListEmptyComponent={<Text style={styles.noResults}>Ningún cliente coincide con la búsqueda.</Text>}
          onRefresh={() => { refetch(); refetchSales(); }}
          refreshing={false}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
        />
      )}
    </View>
  );
}

function CustomerRow({ item, stats, showStats, currency, onPress, onWhatsapp }: {
  item: any;
  stats?: Stats;
  showStats: boolean;
  currency: string;
  onPress: () => void;
  onWhatsapp: () => void;
}) {
  return (
    <Pressable style={styles.row} testID={`customer-${item.id}`} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarTxt}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {!!item.phone && <Text style={styles.sub}>{item.phone}</Text>}
      </View>
      {showStats && (
        <View style={styles.stats}>
          {hasDebt(stats) ? (
            <View style={styles.debtBadge}>
              <Text style={styles.debtTxt}>Debe {formatMoney(stats!.due, currency)}</Text>
            </View>
          ) : stats ? (
            <Text style={styles.total}>{formatMoney(stats.total, currency)}</Text>
          ) : null}
          <Text style={styles.meta}>{stats ? purchases(stats.count) : "Sin compras"}</Text>
        </View>
      )}
      {item.phone ? (
        <Pressable
          onPress={onWhatsapp}
          style={[styles.waBtn, hasDebt(stats) && styles.waBtnDebt]}
          testID={`wa-${item.id}`}
          hitSlop={6}
          accessibilityLabel={hasDebt(stats) ? `Recordar pago a ${item.name} por WhatsApp` : `WhatsApp de ${item.name}`}
        >
          <Ionicons name="logo-whatsapp" size={18} color={colors.success} />
        </Pressable>
      ) : (
        // Keeps the purchase column aligned with rows that have the WhatsApp button.
        <View style={styles.waSpacer} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  tools: { paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  inset: { marginHorizontal: spacing.lg },
  dueBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.warningTertiary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  dueTxt: { flex: 1, color: colors.warning, fontSize: 13, fontWeight: "600" },
  noResults: { textAlign: "center", color: colors.muted, fontSize: 14, paddingVertical: spacing.xxl },
  divider: { height: 1, backgroundColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  avatar: {
    width: 42, height: 42, borderRadius: radius.md,
    backgroundColor: colors.brandSecondary, justifyContent: "center", alignItems: "center",
  },
  avatarTxt: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: 16 },
  name: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  stats: { alignItems: "flex-end", gap: 3 },
  total: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  debtBadge: { backgroundColor: colors.warningTertiary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  debtTxt: { fontSize: 11, fontWeight: "700", color: colors.warning },
  meta: { fontSize: 12, color: colors.muted },
  waBtn: {
    width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, justifyContent: "center", alignItems: "center",
  },
  // Marks that the button sends a payment reminder.
  waBtnDebt: { borderColor: colors.warning, backgroundColor: colors.warningTertiary },
  waSpacer: { width: 36 },
});
