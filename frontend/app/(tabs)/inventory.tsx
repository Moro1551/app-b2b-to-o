import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { TopHeader, HeaderAction } from "@/src/components/top-header";
import { SearchBar, FilterChips, FilterChip, ChipAction } from "@/src/components/list-tools";
import { EmptyState } from "@/src/components/empty-state";
import { useBusiness, formatMoney } from "@/src/business-context";
import { toRemoteUrl } from "@/src/image-utils";
import { api } from "@/src/api";
import { sameCategory, useCategories } from "@/src/categories";
import { colors, radius, spacing } from "@/src/theme";

const isLow = (p: any) => (p.stock ?? 0) <= (p.min_stock ?? 0);

export default function Inventory() {
  const { activeId, activeBusiness } = useBusiness();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  // The filter lives in the route so other screens can open this tab already filtered
  // (e.g. the low-stock link on Inicio).
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = params.filter || "todos";
  const setFilter = (f: string) => router.setParams({ filter: f });

  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ["products", activeId],
    queryFn: () => api.listProducts(activeId!),
    enabled: !!activeId,
  });

  const { data: categories = [] } = useCategories();

  const lowCount = useMemo(() => products.filter(isLow).length, [products]);

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
      list = list.filter(isLow);
    } else if (filter !== "todos") {
      list = list.filter((p: any) => sameCategory(p.category, filter));
    }
    return list;
  }, [products, query, filter]);

  const stockValue = useMemo(
    () => filtered.reduce((sum: number, p: any) => sum + (p.sale_price || 0) * Math.max(0, p.stock ?? 0), 0),
    [filtered],
  );

  const currency = activeBusiness?.currency || "L";
  // With a category filter on, a new product starts in that category.
  const inCategory = filter !== "todos" && filter !== "bajo" ? filter : undefined;
  const newProduct = () => router.push({ pathname: "/product-form", params: inCategory ? { category: inCategory } : {} });
  // Fixed width so a lone card in the last row keeps the size of the others.
  const cardWidth = (width - spacing.lg * 2 - spacing.md) / 2;

  return (
    <View style={styles.wrap}>
      <TopHeader
        title="Inventario"
        right={<HeaderAction icon="add" label="Nuevo" onPress={newProduct} testID="add-product-btn" />}
      />
      {(isLoading || products.length > 0) && (
        <View style={styles.tools}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar producto o SKU"
            testID="search-input"
            style={styles.search}
          />
          <FilterChips>
            <ChipAction icon="pricetags-outline" label="Categorías" onPress={() => router.push("/categories")} testID="categories-btn" />
            <FilterChip id="Todos" label={`Todos · ${products.length}`} active={filter === "todos"} onPress={() => setFilter("todos")} />
            <FilterChip id="Bajo stock" label={`Bajo stock · ${lowCount}`} active={filter === "bajo"} onPress={() => setFilter("bajo")} />
            {categories.map((c) => (
              <FilterChip key={c.id} id={c.name} label={`${c.name} · ${c.count}`} active={filter === c.name} onPress={() => setFilter(c.name)} />
            ))}
          </FilterChips>
          {!isLoading && (
            <Text style={styles.summary}>
              {filtered.length} {filtered.length === 1 ? "producto" : "productos"} · {formatMoney(stockValue, currency)} en stock
            </Text>
          )}
        </View>
      )}

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
          action={newProduct}
          secondaryLabel="Crear categorías primero"
          secondaryAction={() => router.push("/categories")}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
          columnWrapperStyle={{ gap: spacing.md, marginBottom: spacing.md }}
          renderItem={({ item }) => <ProductCard item={item} currency={currency} width={cardWidth} />}
          ListEmptyComponent={<Text style={styles.noResults}>Ningún producto coincide con la búsqueda.</Text>}
          onRefresh={refetch}
          refreshing={false}
        />
      )}
    </View>
  );
}

function ProductCard({ item, currency, width }: { item: any; currency: string; width: number }) {
  const router = useRouter();
  const low = isLow(item);
  const meta = [item.category, item.sku].filter(Boolean).join(" · ");
  return (
    <Pressable
      testID={`product-${item.id}`}
      style={[styles.card, { width }]}
      onPress={() => router.push({ pathname: "/product-form", params: { id: item.id } })}
    >
      <View style={styles.photoWrap}>
        {item.photos?.[0] ? (
          <Image source={{ uri: toRemoteUrl(item.photos[0]) }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Ionicons name="image-outline" size={32} color={colors.muted} />
          </View>
        )}
        <View style={styles.stockBadge}>
          <View style={[styles.stockDot, { backgroundColor: low ? colors.error : colors.success }]} />
          <Text style={[styles.stockTxt, low && { color: colors.error }]}>
            {low ? `${item.stock ?? 0} · bajo mínimo` : `${item.stock ?? 0} en stock`}
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        {!!meta && <Text style={styles.meta} numberOfLines={1}>{meta}</Text>}
        <Text style={styles.price}>{formatMoney(item.sale_price || 0, currency)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  tools: { paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  search: { marginHorizontal: spacing.lg },
  summary: { fontSize: 13, color: colors.muted, marginHorizontal: spacing.lg },
  noResults: { textAlign: "center", color: colors.muted, fontSize: 14, paddingVertical: spacing.xxl },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },
  photoWrap: { position: "relative", width: "100%", height: 140 },
  photo: { width: "100%", height: "100%", backgroundColor: colors.surfaceTertiary },
  photoFallback: { justifyContent: "center", alignItems: "center" },
  stockBadge: {
    position: "absolute", top: spacing.sm, left: spacing.sm,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.surface, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4,
  },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockTxt: { fontSize: 11, fontWeight: "600", color: colors.onSurface },
  cardBody: { paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: spacing.md, gap: 2 },
  name: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.muted },
  price: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginTop: spacing.xs },
});
