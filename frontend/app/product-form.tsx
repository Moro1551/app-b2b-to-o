import { useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormScreen, Field, CardRow, AmountInput, formStyles, useLoadedForm } from "@/src/components/form-screen";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { pickImage, describeUploadError, toRemoteUrl } from "@/src/image-utils";
import { colors, radius, spacing } from "@/src/theme";

export default function ProductForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeId, activeBusiness } = useBusiness();
  const isEdit = !!id;

  const { data: existing } = useQuery({
    queryKey: ["product", activeId, id],
    queryFn: () => api.getProduct(activeId!, id!),
    enabled: isEdit && !!activeId,
  });

  const [form, setForm] = useLoadedForm<any, any>({
    name: "", description: "", category: "", material: "", sku: "",
    photos: [], unit_cost: "0", extra_costs: "0", sale_price: "0",
    stock: "0", min_stock: "0",
  }, existing, (p) => ({
    ...p,
    unit_cost: String(p.unit_cost ?? 0),
    extra_costs: String(p.extra_costs ?? 0),
    sale_price: String(p.sale_price ?? 0),
    stock: String(p.stock ?? 0),
    min_stock: String(p.min_stock ?? 0),
  }));
  const [addQty, setAddQty] = useState("");

  const parse = (v: string) => parseFloat(v || "0") || 0;
  const totalCost = useMemo(() => parse(form.unit_cost) + parse(form.extra_costs), [form.unit_cost, form.extra_costs]);
  const margin = useMemo(() => parse(form.sale_price) - totalCost, [form.sale_price, totalCost]);
  const marginPct = useMemo(() => totalCost > 0 ? (margin / totalCost) * 100 : 0, [margin, totalCost]);

  const payload = () => ({
    name: form.name, description: form.description, category: form.category,
    material: form.material, sku: form.sku, photos: form.photos || [],
    unit_cost: parse(form.unit_cost), extra_costs: parse(form.extra_costs),
    sale_price: parse(form.sale_price), stock: parseInt(form.stock || "0", 10) || 0,
    min_stock: parseInt(form.min_stock || "0", 10) || 0,
  });

  const createMut = useMutation({
    mutationFn: () => api.createProduct(activeId!, payload()),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
  });
  const updateMut = useMutation({
    mutationFn: () => api.updateProduct(activeId!, id!, payload()),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteProduct(activeId!, id!),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
  });
  const stockEntryMut = useMutation({
    mutationFn: () => api.createStockEntry(activeId!, { product_id: id!, quantity: parseInt(addQty, 10) || 0, unit_cost: parse(form.unit_cost) }),
    onSuccess: () => { setAddQty(""); qc.invalidateQueries(); },
  });

  const save = () => {
    if (!form.name?.trim()) {
      Alert.alert("Nombre requerido");
      return;
    }
    (isEdit ? updateMut : createMut).mutate();
  };

  const [uploading, setUploading] = useState(false);
  const addPhoto = async (fromCamera: boolean) => {
    if (uploading) return;
    setUploading(true);
    try {
      const uri = await pickImage(fromCamera);
      // Functional update: the upload takes a while and the user may keep editing meanwhile.
      if (uri) setForm((f: any) => ({ ...f, photos: [...(f.photos || []), uri] }));
    } catch (e) {
      Alert.alert("No se pudo subir la foto", describeUploadError(e));
    } finally {
      setUploading(false);
    }
  };
  const removePhoto = (idx: number) => {
    setForm((f: any) => ({ ...f, photos: f.photos.filter((_: any, i: number) => i !== idx) }));
  };

  const [generating, setGenerating] = useState(false);
  const generateDescription = async () => {
    if (!form.name?.trim()) { Alert.alert("Agrega el nombre primero"); return; }
    if (generating) return;
    setGenerating(true);
    try {
      const { getAuthToken } = await import("@/src/auth-context");
      const { API_BASE, responseError } = await import("@/src/api");
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/businesses/${activeId}/ai/product-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.name, category: form.category, material: form.material }),
      });
      if (!res.ok) throw await responseError(res);
      const j = await res.json();
      setForm((f: any) => ({ ...f, description: j.description }));
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo generar");
    } finally {
      setGenerating(false);
    }
  };

  const currency = activeBusiness?.currency || "L";
  const symbol = currency === "USD" ? "$" : "L";
  const subtitle = isEdit ? [existing?.sku, existing?.category].filter(Boolean).join(" · ") : undefined;
  const set = (key: string) => (v: string) => setForm({ ...form, [key]: v });

  return (
    <FormScreen
      title={isEdit ? "Editar producto" : "Nuevo producto"}
      subtitle={subtitle}
      onSave={save}
      saveLabel={isEdit ? "Guardar cambios" : "Guardar producto"}
      grouped
      onDelete={isEdit ? () => Alert.alert("Eliminar producto", "¿Eliminar este producto?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: () => deleteMut.mutate() },
      ]) : undefined}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
        {(form.photos || []).map((uri: string, idx: number) => (
          <View key={idx} style={styles.photoBox}>
            <Image source={{ uri: toRemoteUrl(uri) }} style={styles.photoImg} contentFit="cover" />
            {idx === 0 && (
              <View style={styles.coverBadge}>
                <Text style={styles.coverTxt}>Portada</Text>
              </View>
            )}
            <Pressable style={styles.photoRemove} onPress={() => removePhoto(idx)} hitSlop={6}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {uploading && (
          <View style={styles.addPhoto} testID="product-photo-uploading">
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.addPhotoTxt}>Subiendo…</Text>
          </View>
        )}
        <Pressable style={styles.addPhoto} onPress={() => addPhoto(false)} disabled={uploading} testID="product-add-gallery">
          <Ionicons name="images-outline" size={22} color={colors.onBrandSecondary} />
          <Text style={styles.addPhotoTxt}>Galería</Text>
        </Pressable>
        <Pressable style={styles.addPhoto} onPress={() => addPhoto(true)} disabled={uploading} testID="product-add-camera">
          <Ionicons name="camera-outline" size={22} color={colors.onBrandSecondary} />
          <Text style={styles.addPhotoTxt}>Cámara</Text>
        </Pressable>
      </ScrollView>

      <Text style={formStyles.section}>Detalles</Text>
      <Field label="Nombre *">
        <TextInput style={formStyles.input} value={form.name} onChangeText={set("name")} testID="product-name" placeholderTextColor={colors.muted} />
      </Field>
      <View style={{ marginBottom: spacing.md }}>
        <View style={styles.descHead}>
          <Text style={styles.descLabel}>Descripción</Text>
          <Pressable style={styles.aiBtn} onPress={generateDescription} disabled={generating} testID="product-ai-desc">
            {generating
              ? <ActivityIndicator size="small" color={colors.onBrandSecondary} />
              : <Ionicons name="sparkles" size={14} color={colors.onBrandSecondary} />}
            <Text style={styles.aiBtnTxt}>{generating ? "Generando…" : "Generar con AI"}</Text>
          </Pressable>
        </View>
        <TextInput style={formStyles.textarea} value={form.description} onChangeText={set("description")} multiline placeholderTextColor={colors.muted} />
      </View>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field label="Categoría">
            <TextInput style={formStyles.input} value={form.category} onChangeText={set("category")} placeholder="Pulseras, collares..." placeholderTextColor={colors.muted} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Material">
            <TextInput style={formStyles.input} value={form.material} onChangeText={set("material")} placeholder="Plata 925" placeholderTextColor={colors.muted} />
          </Field>
        </View>
      </View>
      <Field label="SKU / Código">
        <TextInput style={formStyles.input} value={form.sku} onChangeText={set("sku")} autoCapitalize="characters" placeholderTextColor={colors.muted} />
      </Field>

      <Text style={formStyles.section}>Costos y precio</Text>
      <View style={formStyles.card}>
        <CardRow label="Costo unitario">
          <AmountInput symbol={symbol} value={form.unit_cost} onChangeText={set("unit_cost")} testID="product-unit-cost" />
        </CardRow>
        <CardRow label="Costos extra">
          <AmountInput symbol={symbol} value={form.extra_costs} onChangeText={set("extra_costs")} />
        </CardRow>
        <CardRow label="Costo total" muted>
          <Text style={styles.computed}>{formatMoney(totalCost, currency)}</Text>
        </CardRow>
        <CardRow label="Precio de venta" strong>
          <AmountInput symbol={symbol} value={form.sale_price} onChangeText={set("sale_price")} testID="product-sale-price" strong />
        </CardRow>
        <View style={[styles.marginRow, { backgroundColor: margin >= 0 ? colors.successTertiary : colors.errorTertiary }]}>
          <Text style={[styles.marginLabel, { color: margin >= 0 ? colors.success : colors.error }]}>Ganancia por unidad</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.marginValue, { color: margin >= 0 ? colors.success : colors.error }]}>{formatMoney(margin, currency)}</Text>
            <Text style={[styles.marginPct, { color: margin >= 0 ? colors.success : colors.error }]}>{marginPct.toFixed(1)}% sobre el costo</Text>
          </View>
        </View>
      </View>

      <Text style={formStyles.section}>Stock</Text>
      <View style={formStyles.card}>
        <CardRow label="Cantidad en stock">
          <AmountInput value={form.stock} onChangeText={set("stock")} testID="product-stock" integer />
        </CardRow>
        <CardRow label="Stock mínimo" last>
          <AmountInput value={form.min_stock} onChangeText={set("min_stock")} integer />
        </CardRow>
      </View>

      {isEdit && (
        <>
          <Text style={formStyles.section}>Entrada de mercadería</Text>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <TextInput style={formStyles.input} value={addQty} onChangeText={setAddQty} keyboardType="number-pad" placeholder="Cantidad a añadir" placeholderTextColor={colors.muted} testID="stock-entry-qty" />
            </View>
            <Pressable
              style={[styles.entryBtn, (!addQty || parseInt(addQty, 10) <= 0) && { opacity: 0.5 }]}
              onPress={() => stockEntryMut.mutate()}
              disabled={!addQty || parseInt(addQty, 10) <= 0}
              testID="stock-entry-btn"
            >
              <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.entryTxt}>Registrar</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>Esto aumenta el stock y descuenta del capital al costo unitario.</Text>
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  photos: { gap: spacing.sm, paddingBottom: spacing.sm },
  photoBox: { position: "relative", width: 96, height: 96, borderRadius: radius.md, overflow: "hidden" },
  photoImg: { width: 96, height: 96, backgroundColor: colors.surfaceTertiary },
  coverBadge: {
    position: "absolute", left: 6, bottom: 6,
    backgroundColor: colors.brandPrimary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  coverTxt: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "700" },
  photoRemove: {
    position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)",
    width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center",
  },
  addPhoto: {
    width: 96, height: 96, borderRadius: radius.md, gap: 6,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong,
    justifyContent: "center", alignItems: "center",
  },
  addPhotoTxt: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  row2: { flexDirection: "row", gap: spacing.sm },
  descHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  descLabel: { fontSize: 13, fontWeight: "600", color: colors.muted, marginLeft: 2 },
  aiBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.brandSecondary, borderRadius: radius.sm,
  },
  aiBtnTxt: { color: colors.onBrandSecondary, fontSize: 12, fontWeight: "700" },
  computed: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  marginRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  marginLabel: { fontSize: 14, fontWeight: "700" },
  marginValue: { fontSize: 17, fontWeight: "800" },
  marginPct: { fontSize: 12, fontWeight: "600", marginTop: 1 },
  entryBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md,
    borderRadius: radius.md, justifyContent: "center",
  },
  entryTxt: { color: colors.onBrandPrimary, fontWeight: "600" },
  hint: { fontSize: 12, color: colors.muted, marginTop: spacing.xs, marginLeft: spacing.xs },
});
