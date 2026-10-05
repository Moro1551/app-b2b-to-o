import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroIcon}>
          <Ionicons name="briefcase" size={56} color={colors.brandPrimary} />
        </View>
        <Text style={styles.title}>Bienvenido a Mis Negocios</Text>
        <Text style={styles.subtitle}>
          Gestiona todos tus negocios desde una sola app. Comienza creando tu primer negocio.
        </Text>
        <Pressable
          style={styles.cta}
          onPress={() => router.push("/business-form")}
          testID="onboarding-create"
        >
          <Text style={styles.ctaTxt}>Crear mi primer negocio</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  heroIcon: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: colors.brandTertiary,
    justifyContent: "center", alignItems: "center", marginBottom: spacing.xl,
  },
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface, textAlign: "center", marginBottom: spacing.sm },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: "center", marginBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  cta: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  ctaTxt: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 16 },
});
