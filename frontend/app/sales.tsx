import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Sales() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { activeId, activeBusiness } = useBusiness();

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", activeId],
    queryFn: () => api.listSales(activeId!),
    enabled: !!activeId,
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteSale(activeId!, id),
    onSuccess: () => qc.invalidateQueries(),
  });

  const currency = activeBusiness?.currency || "L";

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={28} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Ventas</Text>
        <Pressable onPress={() => router.push("/sale-new")} testID="sales-add"><Ionicons name="add" size={24} color={colors.brandPrimary} /></Pressable>
      </View>

      {isLoading ? (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl + insets.bottom }}
          ListEmptyComponent={<Text style={styles.empty}>Sin ventas registradas</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onLongPress={() => Alert.alert("Eliminar", "¿Eliminar esta venta?", [
                { text: "Cancelar", style: "cancel" },
                { text: "Eliminar", style: "destructive", onPress: () => delMut.mutate(item.id) },
              ])}
              testID={`sale-${item.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.customer_name || "Sin cliente"}</Text>
                <Text style={styles.rowSub}>
                  {(item.items || []).map((i: any) => `${i.quantity}× ${i.name}`).join(", ")}
                </Text>
                <Text style={styles.rowDate}>{item.created_at?.slice(0, 16).replace("T", " ")}</Text>
              </View>
              <Text style={styles.amount}>{formatMoney(item.total || 0, currency)}</Text>
            </Pressable>
          )}
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
  row: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rowDate: { fontSize: 11, color: colors.muted, marginTop: 4 },
  amount: { fontSize: 16, fontWeight: "700", color: colors.brandPrimary },
  empty: { textAlign: "center", color: colors.muted, padding: spacing.xxl },
});
