import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TopHeader } from "@/src/components/top-header";
import { EmptyState } from "@/src/components/empty-state";
import { useBusiness } from "@/src/business-context";
import { api } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function Customers() {
  const { activeId } = useBusiness();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const { data: customers = [], isLoading, refetch } = useQuery({
    queryKey: ["customers", activeId],
    queryFn: () => api.listCustomers(activeId!),
    enabled: !!activeId,
  });

  const filtered = useMemo(() => {
    if (!query) return customers;
    const q = query.toLowerCase();
    return customers.filter(
      (c: any) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q),
    );
  }, [customers, query]);

  const openWhatsapp = (phone: string) => {
    const clean = (phone || "").replace(/[^\d+]/g, "");
    if (!clean) return;
    Linking.openURL(`https://wa.me/${clean.replace(/^\+/, "")}`);
  };

  return (
    <View style={styles.wrap}>
      <TopHeader title="Clientes" />
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            placeholder="Buscar cliente..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={styles.input}
            testID="customers-search"
          />
        </View>
      </View>

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
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl + insets.bottom + 60 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              testID={`customer-${item.id}`}
              onPress={() => router.push({ pathname: "/customer-form", params: { id: item.id } })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarTxt}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                {!!item.phone && <Text style={styles.sub}>{item.phone}</Text>}
              </View>
              {!!item.phone && (
                <Pressable
                  onPress={() => openWhatsapp(item.phone)}
                  style={styles.waBtn}
                  testID={`wa-${item.id}`}
                  hitSlop={10}
                >
                  <Ionicons name="logo-whatsapp" size={22} color={colors.success} />
                </Pressable>
              )}
            </Pressable>
          )}
          onRefresh={refetch}
          refreshing={false}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: 64 }} />}
        />
      )}

      <Pressable
        testID="add-customer-fab"
        style={[styles.fab, { bottom: 16 + 60 + insets.bottom }]}
        onPress={() => router.push("/customer-form")}
      >
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  searchWrap: {
    backgroundColor: colors.surface, paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md,
    height: 44,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 15 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandSecondary, justifyContent: "center", alignItems: "center",
  },
  avatarTxt: { color: colors.onBrandSecondary, fontWeight: "600", fontSize: 18 },
  name: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  waBtn: { padding: spacing.xs },
  fab: {
    position: "absolute", right: spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary, justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
});
