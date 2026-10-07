import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import type { ComponentProps } from "react";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useAuth } from "@/src/auth-context";
import { useLightStatusBar } from "@/src/components/top-header";
import { colors, radius, spacing } from "@/src/theme";

// After this long, explain that the server may be waking up.
const SLOW_HINT_MS = 4000;

const BENEFITS: [ComponentProps<typeof Ionicons>["name"], string][] = [
  ["bar-chart-outline", "Ventas del día y capital al instante"],
  ["cube-outline", "Alertas cuando un producto se agota"],
  ["sparkles-outline", "Asistente con IA para tu negocio"],
];

export default function Login() {
  const { signIn, busy, error, canRetry, retry } = useAuth();
  const insets = useSafeAreaInsets();
  const [pressed, setPressed] = useState(false);
  const [slow, setSlow] = useState(false);
  const working = pressed || busy;
  useLightStatusBar();

  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setSlow(true), SLOW_HINT_MS);
    return () => { clearTimeout(t); setSlow(false); };
  }, [busy]);

  const onPress = async () => {
    setPressed(true);
    try { await signIn(); } finally { setPressed(false); }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxxl }]}>
        <Image source={require("@/assets/images/icon.png")} style={styles.icon} contentFit="cover" />
        <Text style={styles.title}>Mis Negocios</Text>
        <Text style={styles.subtitle}>
          Ventas, inventario y clientes de todos tus negocios en un solo lugar.
        </Text>
        <View style={styles.benefits}>
          {BENEFITS.map(([icon, label]) => (
            <View key={label} style={styles.benefit}>
              <View style={styles.benefitIcon}>
                <Ionicons name={icon} size={17} color={colors.onHeaderAccent} />
              </View>
              <Text style={styles.benefitTxt}>{label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.panelTitle}>Inicia sesión</Text>
        {busy && slow && (
          <Text style={styles.hint} testID="login-slow-hint">
            Conectando con el servidor… la primera vez puede tardar hasta un minuto.
          </Text>
        )}
        {!busy && error && (
          <View style={styles.errorBox} testID="login-error">
            <Ionicons name="alert-circle" size={18} color={colors.onErrorTertiary} />
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        )}
        {canRetry && !busy && (
          <Pressable style={styles.retry} onPress={retry} testID="login-retry">
            <Ionicons name="refresh" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.retryTxt}>Reintentar</Text>
          </Pressable>
        )}
        <Pressable style={[styles.google, working && { opacity: 0.7 }]} onPress={onPress} testID="login-google" disabled={working}>
          {working ? <ActivityIndicator color={colors.onSurface} /> : <>
            <Ionicons name="logo-google" size={20} color={colors.onSurface} />
            <Text style={styles.googleTxt}>Continuar con Google</Text>
          </>}
        </Pressable>
        <Text style={styles.terms}>Al iniciar sesión aceptas los términos de uso.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.header },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl + 4, paddingBottom: spacing.xl, gap: spacing.lg },
  // Rounded like a launcher icon; the rest of the app uses smaller radii.
  icon: { width: 72, height: 72, borderRadius: 16, borderWidth: 1, borderColor: colors.headerControl },
  title: { fontSize: 38, fontWeight: "800", color: colors.onHeader, letterSpacing: -0.8, marginTop: spacing.sm },
  subtitle: { fontSize: 16, color: colors.onHeaderMuted, lineHeight: 24, marginTop: -spacing.sm },
  benefits: { gap: spacing.md, marginTop: spacing.sm },
  benefit: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  benefitIcon: {
    width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.headerAccentSoft,
    justifyContent: "center", alignItems: "center",
  },
  benefitTxt: { flex: 1, fontSize: 15, fontWeight: "500", color: colors.onHeader },
  panel: {
    backgroundColor: colors.surface, gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingTop: spacing.xl,
    borderTopLeftRadius: radius.lg + 2, borderTopRightRadius: radius.lg + 2,
  },
  panelTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
    backgroundColor: colors.errorTertiary, borderRadius: radius.md, padding: spacing.md,
  },
  errorTxt: { flex: 1, color: colors.onErrorTertiary, fontSize: 14 },
  retry: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md,
  },
  retryTxt: { fontSize: 16, fontWeight: "600", color: colors.onBrandPrimary },
  google: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong,
    paddingVertical: 14, borderRadius: radius.md,
  },
  googleTxt: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  terms: { textAlign: "center", color: colors.muted, fontSize: 12 },
});
