import { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, Linking, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormScreen, Field, formStyles } from "@/src/components/form-screen";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { colors, radius, spacing } from "@/src/theme";

export default function CustomerForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeId, activeBusiness } = useBusiness();
  const isEdit = !!id;

  const { data: existing } = useQuery({
    queryKey: ["customer", activeId, id],
    queryFn: () => api.getCustomer(activeId!, id!),
    enabled: isEdit && !!activeId,
  });
  const { data: sales = [] } = useQuery({
    queryKey: ["customer-sales", activeId, id],
    queryFn: () => api.customerSales(activeId!, id!),
    enabled: isEdit && !!activeId,
  });

  const [form, setForm] = useState<any>({
    name: "", phone: "", email: "", address: "", city: "", social: "", birthday: "", notes: "",
  });

  useEffect(() => { if (existing) setForm({ ...existing }); }, [existing]);

  const createMut = useMutation({
    mutationFn: () => api.createCustomer(activeId!, form),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
  });
  const updateMut = useMutation({
    mutationFn: () => api.updateCustomer(activeId!, id!, form),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteCustomer(activeId!, id!),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
  });

  const save = () => {
    if (!form.name?.trim()) { Alert.alert("Nombre requerido"); return; }
    (isEdit ? updateMut : createMut).mutate();
  };

  const total = sales.reduce((s: number, x: any) => s + (x.total || 0), 0);
  const paid = sales.reduce((s: number, x: any) => s + (x.paid || 0), 0);
  const pending = total - paid;
  const currency = activeBusiness?.currency || "L";

  const openWa = () => {
    const clean = (form.phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (clean) Linking.openURL(`https://wa.me/${clean}`);
  };

  return (
    <FormScreen
      title={isEdit ? "Cliente" : "Nuevo cliente"}
      onSave={save}
      onDelete={isEdit ? () => Alert.alert("Eliminar cliente", "¿Eliminar este cliente?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: () => deleteMut.mutate() },
      ]) : undefined}
    >
      <Field label="Nombre *">
        <TextInput style={formStyles.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} testID="customer-name" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Teléfono / WhatsApp">
        <View style={styles.row}>
          <TextInput style={[formStyles.input, { flex: 1 }]} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" placeholderTextColor={colors.muted} testID="customer-phone" />
          {!!form.phone && (
            <Pressable style={styles.waBtn} onPress={openWa} testID="customer-wa">
              <Ionicons name="logo-whatsapp" size={22} color={colors.success} />
            </Pressable>
          )}
        </View>
      </Field>
      <Field label="Correo">
        <TextInput style={formStyles.input} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Dirección">
        <TextInput style={formStyles.input} value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Ciudad">
        <TextInput style={formStyles.input} value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Red social (Instagram, Facebook...)">
        <TextInput style={formStyles.input} value={form.social} onChangeText={(v) => setForm({ ...form, social: v })} autoCapitalize="none" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Cumpleaños (YYYY-MM-DD)">
        <TextInput style={formStyles.input} value={form.birthday} onChangeText={(v) => setForm({ ...form, birthday: v })} placeholder="1990-05-20" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Notas">
        <TextInput style={formStyles.textarea} value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline placeholderTextColor={colors.muted} />
      </Field>

      {isEdit && (
        <>
          <Text style={styles.section}>Resumen de compras</Text>
          <View style={styles.summary}>
            <SummaryCell label="Total comprado" value={formatMoney(total, currency)} />
            <SummaryCell label="Pagado" value={formatMoney(paid, currency)} tint={colors.success} />
            <SummaryCell label="Pendiente" value={formatMoney(pending, currency)} tint={pending > 0 ? colors.error : colors.success} />
          </View>
          <Text style={styles.section}>Historial</Text>
          {sales.length === 0 ? (
            <Text style={styles.empty}>Sin compras registradas</Text>
          ) : (
            <ScrollView style={{ maxHeight: 240 }}>
              {sales.map((s: any) => (
                <View key={s.id} style={styles.saleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.saleTitle}>{(s.items || []).map((i: any) => `${i.quantity}× ${i.name}`).join(", ") || "Venta"}</Text>
                    <Text style={styles.saleSub}>{s.created_at?.slice(0, 10)}</Text>
                  </View>
                  <Text style={styles.saleTotal}>{formatMoney(s.total || 0, currency)}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </FormScreen>
  );
}

function SummaryCell({ label, value, tint }: any) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, tint && { color: tint }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  waBtn: { padding: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md },
  section: { fontSize: 13, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  summary: { flexDirection: "row", gap: spacing.sm },
  cell: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.sm },
  cellLabel: { fontSize: 11, color: colors.muted },
  cellValue: { fontSize: 14, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  empty: { fontSize: 13, color: colors.muted, textAlign: "center", padding: spacing.md },
  saleRow: {
    flexDirection: "row", alignItems: "center", padding: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.xs,
  },
  saleTitle: { fontSize: 14, color: colors.onSurface, fontWeight: "500" },
  saleSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  saleTotal: { fontSize: 15, fontWeight: "700", color: colors.brandPrimary },
});
