import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useAuth } from "@/src/auth-context";
import { colors, radius, spacing } from "@/src/theme";

// After this long, explain that the server may be waking up.
const SLOW_HINT_MS = 4000;

export default function Login() {
  const { signIn, busy, error, canRetry, retry } = useAuth();
  const insets = useSafeAreaInsets();
  const [pressed, setPressed] = useState(false);
  const [slow, setSlow] = useState(false);
  const working = pressed || busy;

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
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.heroIcon}>
          <Ionicons name="briefcase" size={56} color={colors.brandPrimary} />
        </View>
        <Text style={styles.title}>Mis Negocios</Text>
        <Text style={styles.subtitle}>
          Gestiona todos tus negocios desde una sola app.
        </Text>
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
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
        <Pressable style={styles.google} onPress={onPress} testID="login-google" disabled={working}>
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
  wrap: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.xl },
  heroIcon: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: colors.brandTertiary,
    justifyContent: "center", alignItems: "center", marginBottom: spacing.xl,
  },
  title: { fontSize: 32, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: "center", paddingHorizontal: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  hint: { textAlign: "center", color: colors.muted, fontSize: 13, marginBottom: spacing.md },
  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
    backgroundColor: colors.errorTertiary, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  errorTxt: { flex: 1, color: colors.onErrorTertiary, fontSize: 14 },
  retry: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, paddingVertical: spacing.md,
    borderRadius: radius.pill, marginBottom: spacing.md,
  },
  retryTxt: { fontSize: 16, fontWeight: "600", color: colors.onBrandPrimary },
  google: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong,
    paddingVertical: spacing.md, borderRadius: radius.pill,
  },
  googleTxt: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  terms: { textAlign: "center", color: colors.muted, fontSize: 12, marginTop: spacing.md },
});
