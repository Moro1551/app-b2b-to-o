import { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormScreen, Field, formStyles } from "@/src/components/form-screen";
import { api } from "@/src/api";
import { useBusiness } from "@/src/business-context";
import { pickImage } from "@/src/image-utils";
import { toRemoteUrl } from "@/src/image-utils";
import { colors, radius, spacing } from "@/src/theme";

export default function BusinessForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { switchBusiness, businesses } = useBusiness();
  const isEdit = !!id;

  const { data: existing } = useQuery({
    queryKey: ["business", id],
    queryFn: async () => (await api.listBusinesses()).find((b) => b.id === id),
    enabled: isEdit,
  });

  const [form, setForm] = useState<any>({
    name: "", subtitle: "", logo: "", phone: "", email: "", address: "",
    facebook: "", instagram: "", tiktok: "", website: "", currency: "L", color: "#9D7A2A",
  });

  useEffect(() => {
    if (existing) setForm({ ...existing });
  }, [existing]);

  const createMut = useMutation({
    mutationFn: () => api.createBusiness(form),
    onSuccess: async (b) => {
      await qc.invalidateQueries({ queryKey: ["businesses"] });
      await switchBusiness(b.id);
      router.replace("/(tabs)");
    },
  });

  const updateMut = useMutation({
    mutationFn: () => api.updateBusiness(id!, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["businesses"] });
      router.back();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteBusiness(id!),
    onSuccess: async () => {
      await qc.invalidateQueries();
      if (businesses.length <= 1) router.replace("/onboarding");
      else router.replace("/(tabs)");
    },
  });

  const save = () => {
    if (!form.name?.trim()) {
      Alert.alert("Nombre requerido", "Ingresa un nombre para el negocio.");
      return;
    }
    (isEdit ? updateMut : createMut).mutate();
  };

  const chooseLogo = async () => {
    const uri = await pickImage(false);
    if (uri) setForm({ ...form, logo: uri });
  };

  return (
    <FormScreen
      title={isEdit ? "Editar negocio" : "Nuevo negocio"}
      onSave={save}
      onDelete={isEdit ? () => {
        Alert.alert("Eliminar negocio", "Esto borrará todos sus datos. ¿Continuar?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: () => deleteMut.mutate() },
        ]);
      } : undefined}
    >
      <Pressable style={styles.logoBtn} onPress={chooseLogo} testID="biz-logo-btn">
        {form.logo ? (
          <Image source={{ uri: toRemoteUrl(form.logo) }} style={styles.logoImg} contentFit="cover" />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Ionicons name="image-outline" size={32} color={colors.muted} />
            <Text style={styles.logoHint}>Toca para subir logo</Text>
          </View>
        )}
      </Pressable>

      <Field label="Nombre *">
        <TextInput style={formStyles.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Ej. ARGENTEA" placeholderTextColor={colors.muted} testID="biz-name" />
      </Field>
      <Field label="Subtítulo / eslogan">
        <TextInput style={formStyles.input} value={form.subtitle} onChangeText={(v) => setForm({ ...form, subtitle: v })} placeholder="Ej. Essenza" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Teléfono / WhatsApp">
        <TextInput style={formStyles.input} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} placeholder="+504..." placeholderTextColor={colors.muted} keyboardType="phone-pad" />
      </Field>
      <Field label="Correo">
        <TextInput style={formStyles.input} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Dirección">
        <TextInput style={formStyles.input} value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Facebook">
        <TextInput style={formStyles.input} value={form.facebook} onChangeText={(v) => setForm({ ...form, facebook: v })} autoCapitalize="none" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Instagram">
        <TextInput style={formStyles.input} value={form.instagram} onChangeText={(v) => setForm({ ...form, instagram: v })} autoCapitalize="none" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="TikTok">
        <TextInput style={formStyles.input} value={form.tiktok} onChangeText={(v) => setForm({ ...form, tiktok: v })} autoCapitalize="none" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Tienda online (URL)">
        <TextInput style={formStyles.input} value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} autoCapitalize="none" placeholder="argentea.catalogst.com" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Moneda">
        <View style={styles.segment}>
          {[["L", "Lempiras (L)"], ["USD", "Dólares ($)"]].map(([v, l]) => (
            <Pressable
              key={v}
              style={[styles.segBtn, form.currency === v && styles.segActive]}
              onPress={() => setForm({ ...form, currency: v })}
              testID={`currency-${v}`}
            >
              <Text style={[styles.segTxt, form.currency === v && styles.segTxtActive]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Color principal">
        <View style={styles.colorsRow}>
          {["#9D7A2A", "#1F2937", "#B91C1C", "#1D4ED8", "#15803D", "#7C3AED"].map((c) => (
            <Pressable
              key={c}
              style={[styles.colorDot, { backgroundColor: c }, form.color === c && styles.colorActive]}
              onPress={() => setForm({ ...form, color: c })}
              testID={`color-${c}`}
            />
          ))}
        </View>
      </Field>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  logoBtn: { alignSelf: "center", marginBottom: spacing.lg },
  logoImg: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.surfaceSecondary },
  logoPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.surfaceSecondary, justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
  },
  logoHint: { fontSize: 11, color: colors.muted, marginTop: 4, textAlign: "center", paddingHorizontal: 8 },
  segment: { flexDirection: "row", gap: spacing.sm },
  segBtn: {
    flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center",
  },
  segActive: { backgroundColor: colors.brandPrimary },
  segTxt: { color: colors.onSurface, fontWeight: "500" },
  segTxtActive: { color: colors.onBrandPrimary },
  colorsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "transparent" },
  colorActive: { borderColor: colors.onSurface },
});
