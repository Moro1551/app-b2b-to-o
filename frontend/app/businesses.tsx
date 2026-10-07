import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useBusiness } from "@/src/business-context";
import { toRemoteUrl } from "@/src/image-utils";
import { SubHeader } from "@/src/components/top-header";
import { colors, radius, spacing } from "@/src/theme";

export default function BusinessesList() {
  const router = useRouter();
  const { businesses, activeId, switchBusiness, isLoading } = useBusiness();
  const count = `${businesses.length} ${businesses.length === 1 ? "negocio" : "negocios"}`;

  return (
    <View style={styles.wrap}>
      <SubHeader
        title="Mis negocios"
        subtitle={isLoading ? undefined : count}
        action={{ icon: "add", label: "Añadir negocio", onPress: () => router.push("/business-form"), testID: "businesses-add" }}
      />

      {isLoading ? (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm }}
          ListHeaderComponent={
            <Text style={styles.hint}>
              Toca un negocio para trabajar con él. Ventas, inventario y clientes se guardan en el negocio activo.
            </Text>
          }
          renderItem={({ item }) => {
            const active = item.id === activeId;
            return (
              <View style={[styles.card, active && styles.cardActive]}>
                <Pressable style={styles.main} onPress={() => switchBusiness(item.id)} testID={`biz-list-${item.id}`}>
                  <View style={styles.avatar}>
                    {item.logo
                      ? <Image source={{ uri: toRemoteUrl(item.logo) }} style={styles.avatarImg} contentFit="cover" />
                      : <Text style={styles.avatarTxt}>{item.name.charAt(0).toUpperCase()}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                      {active && (
                        <View style={styles.activeBadge}>
                          <Ionicons name="checkmark" size={11} color={colors.onBrand} />
                          <Text style={styles.activeTxt}>Activo</Text>
                        </View>
                      )}
                    </View>
                    {!!item.subtitle && <Text style={styles.sub} numberOfLines={1}>{item.subtitle}</Text>}
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: "/business-form", params: { id: item.id } })}
                  hitSlop={6}
                  style={styles.editBtn}
                  testID={`biz-edit-${item.id}`}
                  accessibilityLabel={`Editar ${item.name}`}
                >
                  <Ionicons name="create-outline" size={18} color={colors.onSurface} />
                </Pressable>
              </View>
            );
          }}
          ListFooterComponent={
            <Pressable style={styles.addCard} onPress={() => router.push("/business-form")} testID="businesses-add-card">
              <Ionicons name="add" size={20} color={colors.onBrandSecondary} />
              <Text style={styles.addTxt}>Añadir negocio</Text>
            </Pressable>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: spacing.sm, marginHorizontal: 2 },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingRight: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  cardActive: { borderColor: colors.brand, borderWidth: 1.5 },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  avatar: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44 },
  avatarTxt: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: 18 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  activeBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: colors.brand, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  activeTxt: { fontSize: 11, fontWeight: "700", color: colors.onBrand },
  editBtn: {
    width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    justifyContent: "center", alignItems: "center",
  },
  addCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    paddingVertical: spacing.md, marginTop: spacing.xs,
    borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong,
  },
  addTxt: { fontSize: 15, fontWeight: "700", color: colors.onBrandSecondary },
});
