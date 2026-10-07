import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormScreen, Field, formStyles } from "@/src/components/form-screen";
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

  const [form, setForm] = useState<any>({
    name: "", description: "", category: "", material: "", sku: "",
    photos: [], unit_cost: "0", extra_costs: "0", sale_price: "0",
    stock: "0", min_stock: "0",
  });
  const [addQty, setAddQty] = useState("");

  useEffect(() => {
    if (existing) {
      setForm({
        ...existing,
        unit_cost: String(existing.unit_cost ?? 0),
        extra_costs: String(existing.extra_costs ?? 0),
        sale_price: String(existing.sale_price ?? 0),
        stock: String(existing.stock ?? 0),
        min_stock: String(existing.min_stock ?? 0),
      });
    }
  }, [existing]);

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

  const currency = activeBusiness?.currency || "L";

  return (
    <FormScreen
      title={isEdit ? "Editar producto" : "Nuevo producto"}
      onSave={save}
      onDelete={isEdit ? () => Alert.alert("Eliminar producto", "¿Eliminar este producto?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: () => deleteMut.mutate() },
      ]) : undefined}
    >
      <Field label="Fotos">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {(form.photos || []).map((uri: string, idx: number) => (
            <View key={idx} style={styles.photoBox}>
              <Image source={{ uri: toRemoteUrl(uri) }} style={styles.photoImg} contentFit="cover" />
              <Pressable style={styles.photoRemove} onPress={() => removePhoto(idx)}>
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
            <Ionicons name="images-outline" size={24} color={colors.brandPrimary} />
            <Text style={styles.addPhotoTxt}>Galería</Text>
          </Pressable>
          <Pressable style={styles.addPhoto} onPress={() => addPhoto(true)} disabled={uploading} testID="product-add-camera">
            <Ionicons name="camera-outline" size={24} color={colors.brandPrimary} />
            <Text style={styles.addPhotoTxt}>Cámara</Text>
          </Pressable>
        </ScrollView>
      </Field>

      <Field label="Nombre *">
        <TextInput style={formStyles.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="product-name" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Descripción">
        <View style={{ gap: spacing.xs }}>
          <TextInput style={formStyles.textarea} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline placeholderTextColor={colors.muted} />
          <Pressable
            style={styles.aiBtn}
            onPress={async () => {
              if (!form.name?.trim()) { Alert.alert("Agrega el nombre primero"); return; }
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
              }
            }}
            testID="product-ai-desc"
          >
            <Ionicons name="sparkles" size={16} color={colors.brandPrimary} />
            <Text style={styles.aiBtnTxt}>Generar con AI</Text>
          </Pressable>
        </View>
      </Field>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field label="Categoría">
            <TextInput style={formStyles.input} value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="Pulseras, collares..." placeholderTextColor={colors.muted} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Material">
            <TextInput style={formStyles.input} value={form.material} onChangeText={(v) => setForm({ ...form, material: v })} placeholder="Plata 925" placeholderTextColor={colors.muted} />
          </Field>
        </View>
      </View>
      <Field label="SKU / Código">
        <TextInput style={formStyles.input} value={form.sku} onChangeText={(v) => setForm({ ...form, sku: v })} autoCapitalize="characters" placeholderTextColor={colors.muted} />
      </Field>

      <Text style={styles.section}>Costos y precio</Text>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field label="Costo unitario"><TextInput style={formStyles.input} value={form.unit_cost} onChangeText={(v) => setForm({ ...form, unit_cost: v })} keyboardType="decimal-pad" testID="product-unit-cost" placeholderTextColor={colors.muted} /></Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Costos extra"><TextInput style={formStyles.input} value={form.extra_costs} onChangeText={(v) => setForm({ ...form, extra_costs: v })} keyboardType="decimal-pad" placeholderTextColor={colors.muted} /></Field>
        </View>
      </View>
      <View style={styles.calcCard}>
        <View style={styles.calcRow}>
          <Text style={styles.calcLabel}>Costo total</Text>
          <Text style={styles.calcVal}>{formatMoney(totalCost, currency)}</Text>
        </View>
      </View>
      <Field label="Precio de venta">
        <TextInput style={formStyles.input} value={form.sale_price} onChangeText={(v) => setForm({ ...form, sale_price: v })} keyboardType="decimal-pad" testID="product-sale-price" placeholderTextColor={colors.muted} />
      </Field>
      <View style={styles.calcCard}>
        <View style={styles.calcRow}>
          <Text style={styles.calcLabel}>Margen de ganancia</Text>
          <Text style={[styles.calcVal, { color: margin >= 0 ? colors.success : colors.error }]}>
            {formatMoney(margin, currency)} ({marginPct.toFixed(1)}%)
          </Text>
        </View>
      </View>

      <Text style={styles.section}>Stock</Text>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field label="Cantidad en stock"><TextInput style={formStyles.input} value={form.stock} onChangeText={(v) => setForm({ ...form, stock: v })} keyboardType="number-pad" testID="product-stock" placeholderTextColor={colors.muted} /></Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Stock mínimo"><TextInput style={formStyles.input} value={form.min_stock} onChangeText={(v) => setForm({ ...form, min_stock: v })} keyboardType="number-pad" placeholderTextColor={colors.muted} /></Field>
        </View>
      </View>

      {isEdit && (
        <>
          <Text style={styles.section}>Entrada de mercadería</Text>
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
  photoBox: { position: "relative", width: 80, height: 80, borderRadius: radius.md, overflow: "hidden" },
  photoImg: { width: 80, height: 80, backgroundColor: colors.surfaceSecondary },
  photoRemove: {
    position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)",
    width: 20, height: 20, borderRadius: 10, justifyContent: "center", alignItems: "center",
  },
  addPhoto: {
    width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary,
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
  },
  addPhotoTxt: { color: colors.brandPrimary, fontSize: 11, marginTop: 2 },
  row2: { flexDirection: "row", gap: spacing.sm },
  section: { fontSize: 13, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.sm },
  calcCard: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  calcRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  calcLabel: { fontSize: 13, color: colors.onBrandTertiary, fontWeight: "500" },
  calcVal: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  entryBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md,
    borderRadius: radius.md, justifyContent: "center",
  },
  entryTxt: { color: colors.onBrandPrimary, fontWeight: "600" },
  hint: { fontSize: 12, color: colors.muted, marginTop: spacing.xs, marginLeft: spacing.xs },
  aiBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start",
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.brandTertiary, borderRadius: radius.pill,
  },
  aiBtnTxt: { color: colors.brandPrimary, fontSize: 13, fontWeight: "600" },
});
