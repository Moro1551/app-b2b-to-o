import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Finance() {
  const router = useRouter();
  const qc = useQueryClient();
  const { activeId, activeBusiness } = useBusiness();
  const insets = useSafeAreaInsets();

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["transactions", activeId],
    queryFn: () => api.listTransactions(activeId!),
    enabled: !!activeId,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(activeId!, id),
    onSuccess: () => qc.invalidateQueries(),
  });

  const currency = activeBusiness?.currency || "L";

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={28} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Movimientos</Text>
        <Pressable onPress={() => router.push({ pathname: "/transaction-new", params: { type: "ingreso" } })} testID="finance-add"><Ionicons name="add" size={24} color={colors.brandPrimary} /></Pressable>
      </View>

      {isLoading ? (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={txs}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl + insets.bottom }}
          ListEmptyComponent={<Text style={styles.empty}>Sin movimientos registrados</Text>}
          renderItem={({ item }) => {
            const income = item.type === "ingreso";
            return (
              <Pressable
                style={styles.row}
                onLongPress={() => Alert.alert("Eliminar", "¿Eliminar este movimiento?", [
                  { text: "Cancelar", style: "cancel" },
                  { text: "Eliminar", style: "destructive", onPress: () => delMut.mutate(item.id) },
                ])}
                testID={`tx-${item.id}`}
              >
                <View style={[styles.iconBox, { backgroundColor: income ? colors.success : colors.error }]}>
                  <Ionicons name={income ? "arrow-up" : "arrow-down"} size={16} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.description || item.category || (income ? "Ingreso" : "Egreso")}</Text>
                  <Text style={styles.rowSub}>{item.category || "—"} · {item.created_at?.slice(0, 10)}</Text>
                </View>
                <Text style={[styles.amount, { color: income ? colors.success : colors.error }]}>
                  {income ? "+" : "-"} {formatMoney(item.amount, currency)}
                </Text>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
  },
  iconBox: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700" },
  empty: { textAlign: "center", color: colors.muted, padding: spacing.xxl },
});
