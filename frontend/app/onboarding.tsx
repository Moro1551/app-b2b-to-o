import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth-context";
import { useLightStatusBar } from "@/src/components/top-header";
import { colors, radius, spacing } from "@/src/theme";

const STEPS = [
  ["Crea tu negocio", "Nombre, contacto y moneda."],
  ["Agrega tus productos", "Con foto, costo, precio y stock."],
  ["Registra ventas", "El inventario y el capital se actualizan solos."],
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  useLightStatusBar();
  const firstName = user?.name?.split(/\s+/)[0];

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl }]}>
        <Image source={require("@/assets/images/icon.png")} style={styles.icon} contentFit="cover" />
        <Text style={styles.title}>{firstName ? `¡Bienvenido, ${firstName}!` : "¡Bienvenido!"}</Text>
        <Text style={styles.subtitle}>Deja tu negocio listo en tres pasos.</Text>
        <View style={styles.steps}>
          {STEPS.map(([title, detail], i) => (
            <View key={title} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumTxt}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepDetail}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Pressable style={styles.cta} onPress={() => router.push("/business-form")} testID="onboarding-create">
          <Text style={styles.ctaTxt}>Crear mi primer negocio</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.onBrandPrimary} />
        </Pressable>
        <Text style={styles.note}>Podrás agregar más negocios después desde Más › Mis negocios.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.header },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl + 4, paddingBottom: spacing.xl, gap: spacing.lg },
  // Rounded like a launcher icon; the rest of the app uses smaller radii.
  icon: { width: 72, height: 72, borderRadius: 16, borderWidth: 1, borderColor: colors.headerControl },
  title: { fontSize: 32, fontWeight: "800", color: colors.onHeader, letterSpacing: -0.6, marginTop: spacing.sm },
  subtitle: { fontSize: 16, color: colors.onHeaderMuted, marginTop: -spacing.sm },
  steps: { gap: spacing.lg, marginTop: spacing.sm },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepNum: {
    width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.headerAccentSoft,
    justifyContent: "center", alignItems: "center",
  },
  stepNumTxt: { fontSize: 15, fontWeight: "800", color: colors.onHeaderAccent },
  stepTitle: { fontSize: 15, fontWeight: "700", color: colors.onHeader },
  stepDetail: { fontSize: 13, color: colors.onHeaderMuted, marginTop: 2 },
  panel: {
    backgroundColor: colors.surface, gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingTop: spacing.xl,
    borderTopLeftRadius: radius.lg + 2, borderTopRightRadius: radius.lg + 2,
  },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, paddingVertical: 15, borderRadius: radius.md,
  },
  ctaTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  note: { textAlign: "center", color: colors.muted, fontSize: 12 },
});
