import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBusiness } from "@/src/business-context";
import { toRemoteUrl } from "@/src/image-utils";
import { colors, radius, spacing } from "@/src/theme";

export default function BusinessesList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { businesses, activeId, switchBusiness, isLoading } = useBusiness();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={28} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Mis negocios</Text>
        <Pressable onPress={() => router.push("/business-form")} testID="businesses-add"><Ionicons name="add" size={24} color={colors.brandPrimary} /></Pressable>
      </View>

      {isLoading ? (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl + insets.bottom }}
          renderItem={({ item }) => {
            const active = item.id === activeId;
            return (
              <View style={[styles.row, active && styles.rowActive]}>
                <Pressable style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 }} onPress={() => switchBusiness(item.id)} testID={`biz-list-${item.id}`}>
                  <View style={styles.avatar}>
                    {item.logo ? <Image source={{ uri: toRemoteUrl(item.logo) }} style={styles.avatarImg} contentFit="cover" /> : <Text style={styles.avatarTxt}>{item.name.charAt(0).toUpperCase()}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    {!!item.subtitle && <Text style={styles.sub}>{item.subtitle}</Text>}
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
                </Pressable>
                <Pressable onPress={() => router.push({ pathname: "/business-form", params: { id: item.id } })} hitSlop={10} style={{ paddingHorizontal: spacing.sm }} testID={`biz-edit-${item.id}`}>
                  <Ionicons name="create-outline" size={20} color={colors.muted} />
                </Pressable>
              </View>
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
    flexDirection: "row", alignItems: "center",
    padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.brandTertiary },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandSecondary, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  avatarImg: { width: 44, height: 44 },
  avatarTxt: { color: colors.onBrandSecondary, fontWeight: "600", fontSize: 18 },
  name: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
