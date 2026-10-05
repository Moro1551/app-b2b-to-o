import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TopHeader } from "@/src/components/top-header";
import { useBusiness, formatMoney } from "@/src/business-context";
import { useAuth } from "@/src/auth-context";
import { api } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function More() {
  const router = useRouter();
  const { activeId, activeBusiness } = useBusiness();
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const { data: dash } = useQuery({
    queryKey: ["dashboard", activeId],
    queryFn: () => api.dashboard(activeId!),
    enabled: !!activeId,
  });

  const currency = activeBusiness?.currency || "L";

  return (
    <View style={styles.wrap}>
      <TopHeader title="Más" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl + insets.bottom + 60 }}>
        <Section title="Negocio">
          <Row
            icon="briefcase-outline" label="Perfil del negocio"
            onPress={() => activeBusiness && router.push({ pathname: "/business-form", params: { id: activeBusiness.id } })}
            testID="row-profile"
          />
          <Row icon="sparkles-outline" label="Asistente AI (Claude)" onPress={() => router.push("/ai-chat")} testID="row-ai" />
          <Row icon="document-text-outline" label="Catálogo PDF" onPress={() => router.push("/catalog")} testID="row-catalog" />
        </Section>

        <Section title="Finanzas">
          <View style={styles.summary}>
            <SummaryCell label="Capital" value={formatMoney(dash?.capital ?? 0, currency)} tint={colors.brandPrimary} />
            <SummaryCell label="Ingresos" value={formatMoney(dash?.income ?? 0, currency)} tint={colors.success} />
            <SummaryCell label="Egresos" value={formatMoney(dash?.expense ?? 0, currency)} tint={colors.error} />
          </View>
          <Row icon="list-outline" label="Movimientos" onPress={() => router.push("/finance")} testID="row-finance" />
          <Row icon="trending-up-outline" label="Registrar ingreso" onPress={() => router.push({ pathname: "/transaction-new", params: { type: "ingreso" } })} testID="row-income" />
          <Row icon="trending-down-outline" label="Registrar egreso" onPress={() => router.push({ pathname: "/transaction-new", params: { type: "egreso" } })} testID="row-expense" />
        </Section>

        <Section title="Ventas">
          <Row icon="cart-outline" label="Nueva venta" onPress={() => router.push("/sale-new")} testID="row-new-sale" />
          <Row icon="receipt-outline" label="Historial de ventas" onPress={() => router.push("/sales")} testID="row-sales" />
        </Section>

        <Section title="Gestión">
          <Row icon="business-outline" label="Mis negocios" onPress={() => router.push("/businesses")} testID="row-businesses" />
          <Row icon="add-circle-outline" label="Añadir negocio" onPress={() => router.push("/business-form")} testID="row-add-business" />
        </Section>

        <Section title="Cuenta">
          <View style={styles.userRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="person-outline" size={18} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.name || "Usuario"}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
            </View>
          </View>
          <Row icon="log-out-outline" label="Cerrar sesión" onPress={signOut} testID="row-signout" />
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ icon, label, onPress, testID }: any) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={colors.brandPrimary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function SummaryCell({ label, value, tint }: any) {
  return (
    <View style={styles.sumCell}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, { color: tint }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm, marginLeft: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, overflow: "hidden" },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: colors.brandTertiary,
    justifyContent: "center", alignItems: "center",
  },
  rowLabel: { flex: 1, fontSize: 15, color: colors.onSurface, fontWeight: "500" },
  summary: {
    flexDirection: "row", gap: spacing.sm, padding: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm,
  },
  sumCell: { flex: 1, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.sm },
  sumLabel: { fontSize: 11, color: colors.muted, fontWeight: "500" },
  sumValue: { fontSize: 15, fontWeight: "700", marginTop: 2 },
  userRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  userName: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  userEmail: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
