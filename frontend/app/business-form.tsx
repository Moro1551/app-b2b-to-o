import { useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, ActivityIndicator, Switch } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormScreen, Field, SectionHead, CardRow, AmountInput, Segmented, formStyles, useLoadedForm } from "@/src/components/form-screen";
import { api } from "@/src/api";
import { useBusiness } from "@/src/business-context";
import { pickImage, describeUploadError, toRemoteUrl } from "@/src/image-utils";
import { colors, radius, spacing } from "@/src/theme";

const EMPTY = {
  name: "", subtitle: "", logo: "", phone: "", email: "", address: "",
  facebook: "", instagram: "", tiktok: "", website: "", currency: "L", color: colors.brandPrimary,
  usd_rate: "24.50", auto_rate: false,
};

// Used by the PDF and online catalogs. Navy and teal match the app's palette.
const CATALOG_COLORS = ["#00183F", "#0E9384", "#9D7A2A", "#1F2937", "#B91C1C", "#1D4ED8", "#15803D", "#7C3AED"];

export default function BusinessForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { businesses } = useBusiness();
  const isEdit = !!id;

  const { data: existing } = useQuery({
    queryKey: ["business", id],
    queryFn: async () => (await api.listBusinesses()).find((b) => b.id === id),
    enabled: isEdit,
  });

  const [form, setForm] = useLoadedForm<any, any>(EMPTY, existing, (b) => ({
    ...b,
    usd_rate: String(b.usd_rate ?? 24.5),
    auto_rate: !!b.auto_rate,
  }));
  const set = (key: string) => (v: any) => setForm({ ...form, [key]: v });

  const { data: fx, refetch: refetchFx, isRefetching: fxLoading } = useQuery({
    queryKey: ["fx-usd-hnl"],
    queryFn: () => api.fxUsdHnl(),
    enabled: form.currency === "L",
    staleTime: 1000 * 60 * 10,
  });

  const onError = (e: any) => Alert.alert("No se pudo guardar", e?.message || "Inténtalo de nuevo.");
  const createMut = useMutation({
    mutationFn: () => api.createBusiness({ ...form, usd_rate: parseFloat(form.usd_rate) || 24.5, auto_rate: !!form.auto_rate }),
    onSuccess: () => {
      // BusinessProvider's auto-select effect picks up the new business via the
      // refetched businesses list. Avoid chaining switchBusiness + navigation in
      // the same microtask on react-native-web (causes insertBefore DOM errors).
      qc.invalidateQueries({ queryKey: ["businesses"] });
      setTimeout(() => router.replace("/(tabs)"), 0);
    },
    onError,
  });

  const updateMut = useMutation({
    mutationFn: () => api.updateBusiness(id!, { ...form, usd_rate: parseFloat(form.usd_rate) || 24.5, auto_rate: !!form.auto_rate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["businesses"] });
      setTimeout(() => router.back(), 0);
    },
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteBusiness(id!),
    onSuccess: () => {
      const target = businesses.length <= 1 ? "/onboarding" : "/(tabs)";
      qc.invalidateQueries();
      setTimeout(() => router.replace(target), 0);
    },
  });

  // isPending only updates on the next render, so two quick taps could both get through.
  const submitting = useRef(false);
  const save = () => {
    if (submitting.current) return;
    if (!form.name?.trim()) {
      Alert.alert("Nombre requerido", "Ingresa un nombre para el negocio.");
      return;
    }
    submitting.current = true;
    (isEdit ? updateMut : createMut).mutate(undefined, { onSettled: () => { submitting.current = false; } });
  };

  const [uploading, setUploading] = useState(false);
  const chooseLogo = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const uri = await pickImage(false);
      // Functional update: the upload takes a while and the user may keep editing meanwhile.
      if (uri) setForm((f: any) => ({ ...f, logo: uri }));
    } catch (e) {
      Alert.alert("No se pudo subir el logo", describeUploadError(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <FormScreen
      title={isEdit ? "Editar negocio" : "Nuevo negocio"}
      subtitle={isEdit ? existing?.name : undefined}
      onSave={save}
      saveLabel={isEdit ? "Guardar cambios" : "Crear negocio"}
      saving={createMut.isPending || updateMut.isPending}
      grouped
      onDelete={isEdit ? () => {
        Alert.alert("Eliminar negocio", "Esto borrará todos sus datos. ¿Continuar?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: () => deleteMut.mutate() },
        ]);
      } : undefined}
    >
      <View style={[formStyles.card, styles.identity]}>
        <Pressable style={styles.logoBtn} onPress={chooseLogo} disabled={uploading} testID="biz-logo-btn">
          {uploading ? (
            <View style={styles.logoEmpty} testID="biz-logo-uploading">
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : form.logo ? (
            <Image source={{ uri: toRemoteUrl(form.logo) }} style={styles.logoImg} contentFit="cover" />
          ) : (
            <View style={styles.logoEmpty}>
              <Ionicons name="image-outline" size={26} color={colors.onBrandSecondary} />
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.identityTitle}>{uploading ? "Subiendo logo…" : form.logo ? "Logo del negocio" : "Agrega tu logo"}</Text>
          <Text style={styles.muted}>Aparece en el selector de negocios y en tus catálogos.</Text>
          <Pressable onPress={chooseLogo} disabled={uploading} hitSlop={6}>
            <Text style={styles.link}>{form.logo ? "Cambiar logo" : "Elegir imagen"}</Text>
          </Pressable>
        </View>
      </View>

      <SectionHead title="Identidad" />
      <Field label="Nombre *">
        <TextInput style={formStyles.input} value={form.name} onChangeText={set("name")} placeholder="Ej. Bisutería Luna" placeholderTextColor={colors.muted} testID="biz-name" />
      </Field>
      <Field label="Subtítulo / eslogan">
        <TextInput style={formStyles.input} value={form.subtitle} onChangeText={set("subtitle")} placeholder="Ej. Joyería artesanal" placeholderTextColor={colors.muted} />
      </Field>

      <SectionHead title="Contacto" />
      <Field label="Teléfono / WhatsApp">
        <TextInput style={formStyles.input} value={form.phone} onChangeText={set("phone")} placeholder="+504 9999-9999" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
      </Field>
      <Field label="Correo">
        <TextInput style={formStyles.input} value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Dirección">
        <TextInput style={formStyles.input} value={form.address} onChangeText={set("address")} placeholderTextColor={colors.muted} />
      </Field>

      <SectionHead title="Redes y tienda online" />
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field label="Facebook">
            <TextInput style={formStyles.input} value={form.facebook} onChangeText={set("facebook")} autoCapitalize="none" placeholderTextColor={colors.muted} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Instagram">
            <TextInput style={formStyles.input} value={form.instagram} onChangeText={set("instagram")} autoCapitalize="none" placeholder="@usuario" placeholderTextColor={colors.muted} />
          </Field>
        </View>
      </View>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field label="TikTok">
            <TextInput style={formStyles.input} value={form.tiktok} onChangeText={set("tiktok")} autoCapitalize="none" placeholder="@usuario" placeholderTextColor={colors.muted} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Tienda online">
            <TextInput style={formStyles.input} value={form.website} onChangeText={set("website")} autoCapitalize="none" placeholder="mitienda.com" placeholderTextColor={colors.muted} />
          </Field>
        </View>
      </View>

      <SectionHead title="Moneda" />
      <Segmented
        options={[["L", "Lempiras (L)"], ["USD", "Dólares ($)"]]}
        value={form.currency}
        onChange={set("currency")}
        testIDPrefix="currency"
      />
      {form.currency === "L" && (
        <View style={[formStyles.card, { marginTop: spacing.md }]}>
          <CardRow label="Tasa automática">
            <Switch
              value={!!form.auto_rate}
              onValueChange={set("auto_rate")}
              trackColor={{ false: colors.surfaceTertiary, true: colors.brand }}
              thumbColor={colors.surface}
              testID="auto-rate-toggle"
            />
          </CardRow>
          <CardRow label="1 USD equivale a" last>
            {form.auto_rate ? (
              <Text style={styles.rateValue}>{fx?.rate ? `L ${Number(fx.rate).toFixed(2)}` : "Cargando…"}</Text>
            ) : (
              <AmountInput symbol="L" value={String(form.usd_rate)} onChangeText={set("usd_rate")} placeholder="24.50" testID="usd-rate" />
            )}
          </CardRow>
          <View style={styles.rateFoot}>
            <Text style={[styles.muted, { flex: 1, marginTop: 0 }]}>
              {form.auto_rate
                ? (fx ? `Tasa de mercado · fuente: ${fx.source}${fxLoading ? " (actualizando…)" : ""}` : "Obteniendo tasa…")
                : `${fx ? `Mercado hoy: L ${Number(fx.rate).toFixed(2)}. ` : ""}Se usa para cobrar por PayPal en dólares.`}
            </Text>
            <Pressable onPress={() => refetchFx()} hitSlop={10} testID="fx-refresh" accessibilityLabel="Actualizar tasa">
              <Ionicons name="refresh" size={18} color={colors.onBrandSecondary} />
            </Pressable>
          </View>
        </View>
      )}

      <SectionHead title="Color del catálogo" />
      <View style={styles.colorsRow}>
        {CATALOG_COLORS.map((c) => (
          <Pressable
            key={c}
            style={[styles.colorDot, { backgroundColor: c }, form.color === c && styles.colorActive]}
            onPress={() => setForm({ ...form, color: c })}
            testID={`color-${c}`}
            accessibilityLabel={`Color ${c}`}
          >
            {form.color === c && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
          </Pressable>
        ))}
      </View>
      <Text style={[styles.muted, { marginLeft: 2 }]}>Se usa en el encabezado y los precios del catálogo PDF y del catálogo online.</Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  logoBtn: { borderRadius: radius.lg, overflow: "hidden" },
  logoImg: { width: 76, height: 76, backgroundColor: colors.surfaceTertiary },
  logoEmpty: {
    width: 76, height: 76, borderRadius: radius.lg, backgroundColor: colors.brandTertiary,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: colors.brandSecondary, borderStyle: "dashed",
  },
  identityTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  muted: { fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: spacing.xs },
  link: { fontSize: 13, fontWeight: "700", color: colors.onBrandSecondary, marginTop: 2 },
  row2: { flexDirection: "row", gap: spacing.sm },
  rateValue: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rateFoot: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border,
  },
  colorsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  colorDot: {
    width: 36, height: 36, borderRadius: radius.sm, justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: "transparent",
  },
  colorActive: { borderColor: colors.onSurface },
});
