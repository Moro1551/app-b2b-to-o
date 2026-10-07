import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Share, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api, API_BASE } from "@/src/api";
import { getAuthToken } from "@/src/auth-context";
import { useBusiness, formatMoney } from "@/src/business-context";
import { SubHeader } from "@/src/components/top-header";
import { SectionHead, CardRow, formStyles } from "@/src/components/form-screen";
import { EmptyState } from "@/src/components/empty-state";
import { dayLabel, timeLabel } from "@/src/utils/dates";
import { colors, radius, spacing } from "@/src/theme";

export default function SalePay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeId, activeBusiness } = useBusiness();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", activeId],
    queryFn: () => api.listSales(activeId!),
    enabled: !!activeId,
  });
  const sale = sales.find((s: any) => s.id === id);

  const currency = activeBusiness?.currency || "L";
  const total = sale?.total || 0;
  const paid = sale?.paid || 0;
  const due = Math.max(0, total - paid);
  // Ignore rounding leftovers when comparing money amounts.
  const isFullyPaid = !!sale && due <= 0.005;
  // PayPal charges in USD; convert the pending amount with the business' rate.
  const usdRate = Number(activeBusiness?.usd_rate) || 24.5;
  const inUsd = (activeBusiness?.currency || "L").toUpperCase() === "USD";
  const amountUsd = Number((inUsd ? due : due / usdRate).toFixed(2));

  const createOrder = async () => {
    if (!sale) return null;
    const token = getAuthToken();
    const returnUrl = Platform.OS === "web"
      ? window.location.origin + "/"
      : Linking.createURL("paypal-return");
    const payload = {
      return_url: returnUrl,
      cancel_url: returnUrl,
      amount_usd: amountUsd || undefined,
    };
    const res = await fetch(`${API_BASE}/businesses/${activeId}/sales/${sale.id}/paypal/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const capture = async () => {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/businesses/${activeId}/sales/${sale.id}/paypal/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const payNow = async () => {
    if (!sale) return;
    setLoadingAction("pay");
    try {
      const order = await createOrder();
      if (!order?.approve_url) throw new Error("No se obtuvo URL de pago");
      const returnUrl = Platform.OS === "web"
        ? window.location.origin + "/"
        : Linking.createURL("paypal-return");
      let shouldCapture = false;
      if (Platform.OS === "web") {
        window.open(order.approve_url, "_blank");
        shouldCapture = true;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(order.approve_url, returnUrl);
        shouldCapture = result.type === "success" || result.type === "dismiss";
      }
      if (shouldCapture) {
        // Give PayPal a moment
        await new Promise((r) => setTimeout(r, 500));
        try {
          const cap = await capture();
          qc.invalidateQueries();
          Alert.alert("Pago capturado", `USD ${cap.captured_usd?.toFixed(2) ?? "?"} añadido a la venta`);
        } catch {
          Alert.alert("Pago pendiente", "No se pudo capturar aún. Toca 'Verificar pago' cuando el cliente complete el pago.");
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo crear la orden");
    } finally {
      setLoadingAction(null);
    }
  };

  const shareLink = async () => {
    if (!sale) return;
    setLoadingAction("share");
    try {
      const order = await createOrder();
      if (!order?.approve_url) throw new Error("No se obtuvo URL de pago");
      const msg = `Hola, puedes pagar tu compra por PayPal aquí: ${order.approve_url}`;
      if (Platform.OS === "web") {
        if ((navigator as any).share) {
          await (navigator as any).share({ title: "Enlace de pago", text: msg });
        } else {
          await (navigator as any).clipboard?.writeText(order.approve_url);
          Alert.alert("Enlace copiado", "Pégalo donde quieras compartirlo");
        }
      } else {
        await Share.share({ message: msg });
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo compartir");
    } finally {
      setLoadingAction(null);
    }
  };

  const verifyPayment = async () => {
    setLoadingAction("verify");
    try {
      const cap = await capture();
      qc.invalidateQueries();
      Alert.alert("Pago capturado", `USD ${cap.captured_usd?.toFixed(2) ?? "?"} añadido a la venta`);
    } catch (e: any) {
      Alert.alert("Aún no completado", e?.message || "El cliente aún no ha completado el pago");
    } finally {
      setLoadingAction(null);
    }
  };

  const created = sale ? new Date(sale.created_at) : null;

  return (
    <View style={styles.wrap}>
      <SubHeader
        title="Cobrar venta"
        subtitle={created ? `${dayLabel(created)}, ${timeLabel(created)}` : undefined}
      />
      {isLoading ? (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : !sale ? (
        <EmptyState
          icon="receipt-outline"
          title="Venta no encontrada"
          message="Puede que se haya eliminado. Vuelve al historial para ver las ventas actuales."
          actionLabel="Volver"
          action={() => router.back()}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
          <View style={formStyles.card}>
            <View style={styles.saleHead}>
              <View style={styles.avatar}>
                {sale.customer_name
                  ? <Text style={styles.avatarTxt}>{sale.customer_name.charAt(0).toUpperCase()}</Text>
                  : <Ionicons name="person-outline" size={18} color={colors.muted} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.customer} numberOfLines={1}>{sale.customer_name || "Sin cliente"}</Text>
                <Text style={styles.muted}>
                  {(sale.items || []).length} {(sale.items || []).length === 1 ? "producto" : "productos"}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: isFullyPaid ? colors.successTertiary : colors.warningTertiary }]}>
                <Text style={[styles.badgeTxt, { color: isFullyPaid ? colors.success : colors.warning }]}>
                  {isFullyPaid ? "Pagado" : "Pendiente"}
                </Text>
              </View>
            </View>
            {(sale.items || []).map((it: any, i: number) => (
              <View key={`${it.product_id}-${i}`} style={styles.itemRow}>
                <Text style={styles.itemQty}>{it.quantity}×</Text>
                <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                <Text style={styles.itemTotal}>{formatMoney(it.quantity * it.unit_price, currency)}</Text>
              </View>
            ))}
            {!!sale.note && <Text style={styles.note}>Nota: {sale.note}</Text>}
          </View>

          <SectionHead title="Pago" />
          <View style={formStyles.card}>
            <CardRow label="Total">
              <Text style={styles.value}>{formatMoney(total, currency)}</Text>
            </CardRow>
            <CardRow label="Pagado">
              <Text style={[styles.value, { color: colors.success }]}>{formatMoney(paid, currency)}</Text>
            </CardRow>
            <CardRow label="Pendiente" strong last>
              <Text style={[styles.value, styles.valueStrong, { color: isFullyPaid ? colors.success : colors.warning }]}>
                {formatMoney(due, currency)}
              </Text>
            </CardRow>
            <View style={[styles.progress, { gap: paid > 0 && !isFullyPaid ? 2 : 0 }]}>
              <View style={[styles.progressPaid, { flex: Math.min(paid, total) || 0 }]} />
              <View style={[styles.progressDue, { flex: due }]} />
            </View>
          </View>

          {isFullyPaid ? (
            <View style={styles.paidBox}>
              <Ionicons name="checkmark-circle" size={26} color={colors.success} />
              <Text style={styles.paidTxt}>Venta pagada en su totalidad</Text>
            </View>
          ) : (
            <>
              <SectionHead title="Cobrar con PayPal" />
              <View style={[formStyles.card, styles.ppCard]}>
                <View style={styles.ppHead}>
                  <View style={styles.ppLogo}>
                    <Text style={styles.ppLogoTxt}>PP</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ppTitle}>PayPal · Sandbox</Text>
                    <Text style={styles.muted}>Cobro en USD · El cliente paga con tarjeta o cuenta PayPal</Text>
                  </View>
                </View>
                <View>
                  <Text style={styles.muted}>Monto a cobrar</Text>
                  <Text style={styles.ppAmount}>USD {amountUsd.toFixed(2)}</Text>
                  {!inUsd && (
                    <Text style={styles.muted}>
                      Convertido de {formatMoney(due, "L")} a tasa 1 USD = L {usdRate.toFixed(2)}
                    </Text>
                  )}
                </View>

                <Pressable
                  style={[styles.btn, styles.btnPaypal, loadingAction === "pay" && { opacity: 0.6 }]}
                  onPress={payNow}
                  disabled={!!loadingAction}
                  testID="paypal-pay-now"
                >
                  {loadingAction === "pay" ? <ActivityIndicator color="#FFFFFF" /> : <>
                    <Ionicons name="card-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.btnPaypalTxt}>Pagar ahora en PayPal</Text>
                  </>}
                </Pressable>

                <Pressable
                  style={[styles.btn, styles.btnOutline, loadingAction === "share" && { opacity: 0.6 }]}
                  onPress={shareLink}
                  disabled={!!loadingAction}
                  testID="paypal-share"
                >
                  {loadingAction === "share" ? <ActivityIndicator color={colors.onSurface} /> : <>
                    <Ionicons name="share-social-outline" size={18} color={colors.onBrandSecondary} />
                    <Text style={styles.btnOutlineTxt}>Compartir enlace al cliente</Text>
                  </>}
                </Pressable>

                {!!sale.paypal_order_id && (
                  <Pressable
                    style={[styles.btn, styles.btnGhost, loadingAction === "verify" && { opacity: 0.6 }]}
                    onPress={verifyPayment}
                    disabled={!!loadingAction}
                    testID="paypal-verify"
                  >
                    {loadingAction === "verify" ? <ActivityIndicator color={colors.onSurface} /> : <>
                      <Ionicons name="refresh" size={18} color={colors.onSurface} />
                      <Text style={styles.btnGhostTxt}>Verificar pago del cliente</Text>
                    </>}
                  </Pressable>
                )}
                <Text style={styles.hint}>
                  Al tocar &quot;Compartir&quot;, el enlace se abre en WhatsApp/mensajes. Cuando el cliente pague, toca &quot;Verificar pago&quot; para registrarlo.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  muted: { fontSize: 12, color: colors.muted, marginTop: 2 },
  saleHead: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary,
    justifyContent: "center", alignItems: "center",
  },
  avatarTxt: { color: colors.onBrandSecondary, fontSize: 16, fontWeight: "700" },
  customer: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 11, fontWeight: "700" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10 },
  itemQty: { width: 28, fontSize: 13, fontWeight: "700", color: colors.muted },
  itemName: { flex: 1, fontSize: 14, color: colors.onSurface },
  itemTotal: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  note: { fontSize: 13, color: colors.muted, fontStyle: "italic", paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  value: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  valueStrong: { fontSize: 16, fontWeight: "800" },
  progress: {
    flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden",
    marginHorizontal: spacing.md, marginBottom: spacing.md,
  },
  progressPaid: { backgroundColor: colors.success },
  progressDue: { backgroundColor: colors.warning },
  paidBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.successTertiary, padding: spacing.lg, borderRadius: radius.lg,
  },
  paidTxt: { fontSize: 15, fontWeight: "700", color: colors.success },
  ppCard: { padding: spacing.lg, gap: spacing.md },
  ppHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  // PayPal's own brand colors, so customers recognize the payment option.
  ppLogo: {
    width: 38, height: 38, borderRadius: radius.md, backgroundColor: "#003087",
    justifyContent: "center", alignItems: "center",
  },
  ppLogoTxt: { color: "#FFC439", fontWeight: "900", fontSize: 14 },
  ppTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  ppAmount: { fontSize: 30, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    paddingVertical: 14, borderRadius: radius.md,
  },
  btnPaypal: { backgroundColor: "#0070BA" },
  btnPaypalTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  btnOutline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  btnOutlineTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 15 },
  btnGhost: { backgroundColor: colors.surfaceSecondary },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "500", fontSize: 14 },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});
