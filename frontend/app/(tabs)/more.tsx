import { useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { TopHeader } from "@/src/components/top-header";
import { useBusiness, formatMoney } from "@/src/business-context";
import { useAuth } from "@/src/auth-context";
import { api } from "@/src/api";
import { shareBackup } from "@/src/backup";
import { colors, radius, spacing } from "@/src/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

export default function More() {
  const router = useRouter();
  const { activeId, activeBusiness, businesses } = useBusiness();
  const { user, signOut } = useAuth();
  const [backingUp, setBackingUp] = useState(false);

  const backup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      await shareBackup();
    } catch (e: any) {
      Alert.alert("No se pudo crear el respaldo", e?.message || "Inténtalo de nuevo.");
    } finally {
      setBackingUp(false);
    }
  };

  const { data: dash } = useQuery({
    queryKey: ["dashboard", activeId],
    queryFn: () => api.dashboard(activeId!),
    enabled: !!activeId,
  });

  const currency = activeBusiness?.currency || "L";
  const userName = user?.name || "Usuario";
  const bizCount = `${businesses.length} ${businesses.length === 1 ? "negocio" : "negocios"}`;

  return (
    <View style={styles.wrap}>
      <TopHeader title="Más" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, styles.account]} testID="account-card">
          <View style={styles.accountAvatar}>
            <Text style={styles.accountInitials}>{initials(userName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {[user?.email, bizCount].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>

        <View style={[styles.card, styles.summary]}>
          <SummaryCell label="Capital" value={formatMoney(dash?.capital ?? 0, currency)} tint={colors.onSurface} />
          <SummaryCell label="Ingresos" value={formatMoney(dash?.income ?? 0, currency)} tint={colors.success} divider />
          <SummaryCell label="Egresos" value={formatMoney(dash?.expense ?? 0, currency)} tint={colors.error} divider />
        </View>

        <Section title="Negocio">
          <Row
            icon="storefront-outline" label="Perfil del negocio"
            onPress={() => activeBusiness && router.push({ pathname: "/business-form", params: { id: activeBusiness.id } })}
            testID="row-profile"
          />
          <Row icon="sparkles-outline" label="Asistente AI" onPress={() => router.push("/ai-chat")} testID="row-ai" />
          <Row icon="document-text-outline" label="Catálogo PDF" onPress={() => router.push("/catalog")} testID="row-catalog" last />
        </Section>

        <Section title="Ventas y finanzas">
          <Row icon="receipt-outline" label="Historial de ventas" onPress={() => router.push("/sales")} testID="row-sales" />
          <Row icon="swap-horizontal-outline" label="Movimientos" onPress={() => router.push("/finance")} testID="row-finance" last />
        </Section>

        <Section title="Gestión">
          <Row icon="business-outline" label="Mis negocios" onPress={() => router.push("/businesses")} testID="row-businesses" />
          <Row icon="cloud-download-outline" label="Respaldar mis datos" onPress={backup} busy={backingUp} testID="row-backup" />
          <Row icon="log-out-outline" label="Cerrar sesión" onPress={signOut} testID="row-signout" danger last />
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ icon, label, onPress, testID, danger, busy, last }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
  danger?: boolean;
  busy?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable style={[styles.row, !last && styles.rowDivider]} onPress={onPress} testID={testID}>
      <View style={[styles.iconWrap, danger && { backgroundColor: colors.errorTertiary }]}>
        <Ionicons name={icon} size={17} color={danger ? colors.error : colors.onBrandSecondary} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.error }]}>{label}</Text>
      {busy
        ? <ActivityIndicator size="small" color={colors.muted} />
        : !danger && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </Pressable>
  );
}

function SummaryCell({ label, value, tint, divider }: { label: string; value: string; tint: string; divider?: boolean }) {
  return (
    <View style={[styles.sumCell, divider && styles.sumDivider]}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },
  account: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  accountAvatar: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandPrimary,
    justifyContent: "center", alignItems: "center",
  },
  accountInitials: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
  userName: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  userEmail: { fontSize: 12, color: colors.muted, marginTop: 2 },
  summary: { flexDirection: "row", paddingVertical: spacing.md },
  sumCell: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: spacing.sm },
  sumDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  sumLabel: { fontSize: 12, color: colors.muted },
  sumValue: { fontSize: 16, fontWeight: "800" },
  sectionTitle: {
    fontSize: 11, fontWeight: "700", color: colors.muted,
    textTransform: "uppercase", letterSpacing: 1, marginLeft: spacing.xs,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 11, paddingHorizontal: spacing.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconWrap: {
    width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.brandTertiary,
    justifyContent: "center", alignItems: "center",
  },
  rowLabel: { flex: 1, fontSize: 15, color: colors.onSurface, fontWeight: "500" },
});
