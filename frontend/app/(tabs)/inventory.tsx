import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, FlatList, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TopHeader } from "@/src/components/top-header";
import { EmptyState } from "@/src/components/empty-state";
import { useBusiness, formatMoney } from "@/src/business-context";
import { api } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function Inventory() {
  const { activeId, activeBusiness } = useBusiness();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todos" | "bajo" | string>("todos");

  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ["products", activeId],
    queryFn: () => api.listProducts(activeId!),
    enabled: !!activeId,
  });

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p: any) => p.category && s.add(p.category));
    return Array.from(s);
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (p: any) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q),
      );
    }
    if (filter === "bajo") {
      list = list.filter((p: any) => (p.stock ?? 0) <= (p.min_stock ?? 0));
    } else if (filter !== "todos") {
      list = list.filter((p: any) => p.category === filter);
    }
    return list;
  }, [products, query, filter]);

  const currency = activeBusiness?.currency || "L";

  return (
    <View style={styles.wrap}>
      <TopHeader title="Inventario" />
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            placeholder="Buscar producto..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={styles.input}
            testID="search-input"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}
        >
          <Chip label="Todos" active={filter === "todos"} onPress={() => setFilter("todos")} />
          <Chip label="Bajo stock" active={filter === "bajo"} onPress={() => setFilter("bajo")} />
          {categories.map((c) => (
            <Chip key={c} label={c} active={filter === c} onPress={() => setFilter(c)} />
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : products.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title="No hay productos"
          message="Añade tu primer producto para comenzar a gestionar tu inventario."
          actionLabel="Añadir producto"
          action={() => router.push("/product-form")}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl + insets.bottom + 60 }}
          columnWrapperStyle={{ gap: spacing.md, marginBottom: spacing.md }}
          renderItem={({ item }) => <ProductCard item={item} currency={currency} />}
          onRefresh={refetch}
          refreshing={false}
        />
      )}

      <Pressable
        testID="add-product-fab"
        style={[styles.fab, { bottom: 16 + 60 + insets.bottom }]}
        onPress={() => router.push("/product-form")}
      >
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Pressable>
    </View>
  );
}

function ProductCard({ item, currency }: { item: any; currency: string }) {
  const router = useRouter();
  const low = (item.stock ?? 0) <= (item.min_stock ?? 0);
  return (
    <Pressable
      testID={`product-${item.id}`}
      style={styles.card}
      onPress={() => router.push({ pathname: "/product-form", params: { id: item.id } })}
    >
      <View style={styles.photoWrap}>
        {item.photos?.[0] ? (
          <Image source={{ uri: item.photos[0] }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Ionicons name="image-outline" size={32} color={colors.muted} />
          </View>
        )}
        <View style={[styles.stockBadge, low && styles.stockBadgeLow]}>
          <Text style={[styles.stockTxt, low && { color: colors.onError }]}>Stock: {item.stock ?? 0}</Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      {!!item.category && <Text style={styles.cat} numberOfLines={1}>{item.category}</Text>}
      <Text style={styles.price}>{formatMoney(item.sale_price || 0, currency)}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      testID={`chip-${label}`}
    >
      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  searchWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md,
    height: 44,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 15 },
  chip: {
    paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, justifyContent: "center", flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontSize: 13, fontWeight: "500" },
  chipTxtActive: { color: colors.onBrandPrimary },
  card: {
    flex: 1,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },
  photoWrap: { position: "relative", width: "100%", aspectRatio: 1 },
  photo: { width: "100%", height: "100%", backgroundColor: colors.surfaceSecondary },
  photoFallback: { justifyContent: "center", alignItems: "center" },
  stockBadge: {
    position: "absolute", top: spacing.xs, right: spacing.xs,
    backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
  },
  stockBadgeLow: { backgroundColor: colors.error },
  stockTxt: { fontSize: 11, fontWeight: "600", color: colors.onSurface },
  name: { fontSize: 14, fontWeight: "600", color: colors.onSurface, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  cat: { fontSize: 12, color: colors.muted, paddingHorizontal: spacing.sm, marginTop: 2 },
  price: { fontSize: 14, fontWeight: "700", color: colors.brandPrimary, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  fab: {
    position: "absolute", right: spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary, justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
});
