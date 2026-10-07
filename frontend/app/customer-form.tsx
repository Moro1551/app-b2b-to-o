import { useRef } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Alert, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FormScreen, Field, SectionHead, formStyles, useLoadedForm } from "@/src/components/form-screen";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { dayLabel } from "@/src/utils/dates";
import { colors, radius, spacing } from "@/src/theme";

const EMPTY = { name: "", phone: "", email: "", address: "", city: "", social: "", birthday: "", notes: "" };

// Ignore rounding leftovers when comparing money amounts.
const dueOf = (s: any) => Math.max(0, (s.total || 0) - (s.paid || 0));

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

  const [form, setForm] = useLoadedForm<any, any>(EMPTY, existing, (c) => ({ ...EMPTY, ...c }));
  const set = (key: string) => (v: string) => setForm({ ...form, [key]: v });

  const onError = (e: any) => Alert.alert("No se pudo guardar", e?.message || "Inténtalo de nuevo.");
  const createMut = useMutation({
    mutationFn: () => api.createCustomer(activeId!, form),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
    onError,
  });
  const updateMut = useMutation({
    mutationFn: () => api.updateCustomer(activeId!, id!, form),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
    onError,
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteCustomer(activeId!, id!),
    onSuccess: () => { qc.invalidateQueries(); router.back(); },
  });

  // isPending only updates on the next render, so two quick taps could both get through.
  const submitting = useRef(false);
  const save = () => {
    if (submitting.current) return;
    if (!form.name?.trim()) { Alert.alert("Nombre requerido"); return; }
    submitting.current = true;
    (isEdit ? updateMut : createMut).mutate(undefined, { onSettled: () => { submitting.current = false; } });
  };

  const total = sales.reduce((s: number, x: any) => s + (x.total || 0), 0);
  const pending = sales.reduce((s: number, x: any) => s + dueOf(x), 0);
  const paid = total - pending;
  const currency = activeBusiness?.currency || "L";
  const phoneDigits = (form.phone || "").replace(/[^\d+]/g, "");

  return (
    <FormScreen
      title={isEdit ? "Cliente" : "Nuevo cliente"}
      subtitle={isEdit ? existing?.name : activeBusiness?.name}
      onSave={save}
      saveLabel={isEdit ? "Guardar cambios" : "Guardar cliente"}
      saving={createMut.isPending || updateMut.isPending}
      grouped
      onDelete={isEdit ? () => Alert.alert("Eliminar cliente", "¿Eliminar este cliente?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: () => deleteMut.mutate() },
      ]) : undefined}
    >
      {isEdit && existing && (
        <View style={[formStyles.card, styles.profile]}>
          <View style={styles.profileHead}>
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{(existing.name || "?").charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName} numberOfLines={1}>{existing.name}</Text>
              {!!existing.created_at && (
                <Text style={styles.muted}>Cliente desde {format(new Date(existing.created_at), "MMMM yyyy", { locale: es })}</Text>
              )}
            </View>
          </View>
          {!!phoneDigits && (
            <View style={styles.actions}>
              <Pressable style={styles.action} onPress={() => Linking.openURL(`https://wa.me/${phoneDigits.replace(/^\+/, "")}`)} testID="customer-wa">
                <Ionicons name="logo-whatsapp" size={18} color={colors.success} />
                <Text style={styles.actionTxt}>WhatsApp</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => Linking.openURL(`tel:${phoneDigits}`)} testID="customer-call">
                <Ionicons name="call-outline" size={18} color={colors.onBrandSecondary} />
                <Text style={styles.actionTxt}>Llamar</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.stats}>
            <Stat label="Comprado" value={formatMoney(total, currency)} />
            <Stat label="Pagado" value={formatMoney(paid, currency)} tint={colors.success} divider />
            <Stat label="Pendiente" value={formatMoney(pending, currency)} tint={pending > 0.005 ? colors.warning : colors.onSurface} divider />
          </View>
        </View>
      )}

      <SectionHead title="Contacto" />
      <Field label="Nombre *">
        <TextInput style={formStyles.input} value={form.name} onChangeText={set("name")} testID="customer-name" placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Teléfono / WhatsApp">
        <TextInput style={formStyles.input} value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="+504 9999-9999" placeholderTextColor={colors.muted} testID="customer-phone" />
      </Field>
      <Field label="Correo">
        <TextInput style={formStyles.input} value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.muted} />
      </Field>

      <SectionHead title="Ubicación" />
      <Field label="Dirección">
        <TextInput style={formStyles.input} value={form.address} onChangeText={set("address")} placeholderTextColor={colors.muted} />
      </Field>
      <Field label="Ciudad">
        <TextInput style={formStyles.input} value={form.city} onChangeText={set("city")} placeholderTextColor={colors.muted} />
      </Field>

      <SectionHead title="Más datos" />
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field label="Red social">
            <TextInput style={formStyles.input} value={form.social} onChangeText={set("social")} autoCapitalize="none" placeholder="@usuario" placeholderTextColor={colors.muted} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Cumpleaños">
            <TextInput style={formStyles.input} value={form.birthday} onChangeText={set("birthday")} placeholder="AAAA-MM-DD" placeholderTextColor={colors.muted} />
          </Field>
        </View>
      </View>
      <Field label="Notas">
        <TextInput style={formStyles.textarea} value={form.notes} onChangeText={set("notes")} multiline placeholder="Preferencias, tallas, recordatorios…" placeholderTextColor={colors.muted} />
      </Field>

      {isEdit && (
        <>
          <SectionHead title={`Historial · ${sales.length} ${sales.length === 1 ? "compra" : "compras"}`} />
          {sales.length === 0 ? (
            <Text style={styles.empty}>Sin compras registradas.</Text>
          ) : (
            <View style={formStyles.card}>
              {sales.map((s: any, i: number) => {
                const due = dueOf(s);
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.saleRow, i < sales.length - 1 && styles.divider]}
                    onPress={() => router.push({ pathname: "/sale-pay", params: { id: s.id } })}
                    testID={`customer-sale-${s.id}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.saleTitle} numberOfLines={1}>
                        {(s.items || []).map((it: any) => `${it.quantity}× ${it.name}`).join(", ") || "Venta"}
                      </Text>
                      <Text style={styles.muted}>{s.created_at ? dayLabel(new Date(s.created_at)) : ""}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <Text style={styles.saleTotal}>{formatMoney(s.total || 0, currency)}</Text>
                      <Text style={[styles.saleStatus, { color: due > 0.005 ? colors.warning : colors.success }]}>
                        {due > 0.005 ? `Debe ${formatMoney(due, currency)}` : "Pagado"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}
    </FormScreen>
  );
}

function Stat({ label, value, tint = colors.onSurface, divider }: { label: string; value: string; tint?: string; divider?: boolean }) {
  return (
    <View style={[styles.stat, divider && styles.statDivider]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { padding: spacing.md, gap: spacing.md },
  profileHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center",
  },
  avatarTxt: { color: colors.onBrandSecondary, fontSize: 19, fontWeight: "800" },
  profileName: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  muted: { fontSize: 12, color: colors.muted, marginTop: 2 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
  },
  actionTxt: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  stats: { flexDirection: "row", paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  stat: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: spacing.xs },
  statDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  statLabel: { fontSize: 12, color: colors.muted },
  statValue: { fontSize: 15, fontWeight: "800" },
  row2: { flexDirection: "row", gap: spacing.sm },
  empty: { fontSize: 13, color: colors.muted, textAlign: "center", padding: spacing.md },
  saleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  saleTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  saleTotal: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  saleStatus: { fontSize: 12, fontWeight: "700" },
});
