import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { useAuth } from "@/src/auth-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Login() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  const onPress = async () => {
    setLoading(true);
    try { await signIn(); } finally { setLoading(false); }
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
        <Pressable style={styles.google} onPress={onPress} testID="login-google" disabled={loading}>
          {loading ? <ActivityIndicator color={colors.onSurface} /> : <>
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
  google: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong,
    paddingVertical: spacing.md, borderRadius: radius.pill,
  },
  googleTxt: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  terms: { textAlign: "center", color: colors.muted, fontSize: 12, marginTop: spacing.md },
});
