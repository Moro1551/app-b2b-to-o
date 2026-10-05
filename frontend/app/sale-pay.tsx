import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Share, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api, API_BASE } from "@/src/api";
import { getAuthToken } from "@/src/auth-context";
import { useBusiness, formatMoney } from "@/src/business-context";
import { colors, radius, spacing } from "@/src/theme";

export default function SalePay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { activeId, activeBusiness } = useBusiness();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [amountUsd, setAmountUsd] = useState<string>("");

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", activeId],
    queryFn: () => api.listSales(activeId!),
    enabled: !!activeId,
  });
  const sale = sales.find((s: any) => s.id === id);

  useEffect(() => {
    if (sale) {
      const due = Math.max(0, (sale.total || 0) - (sale.paid || 0));
      setAmountUsd(due.toFixed(2));
    }
  }, [sale?.id, sale?.paid, sale?.total]);

  const currency = activeBusiness?.currency || "L";
  const due = sale ? Math.max(0, (sale.total || 0) - (sale.paid || 0)) : 0;
  const isFullyPaid = sale && due <= 0;

  const createOrder = async (openInBrowser: boolean) => {
    if (!sale) return null;
    const token = getAuthToken();
    const returnUrl = Platform.OS === "web"
      ? window.location.origin + "/"
      : Linking.createURL("paypal-return");
    const payload = {
      return_url: returnUrl,
      cancel_url: returnUrl,
      amount_usd: parseFloat(amountUsd) || undefined,
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
      const order = await createOrder(true);
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
        } catch (e: any) {
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
      const order = await createOrder(false);
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

  if (isLoading || !sale) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Cobrar venta</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl + insets.bottom }}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{sale.customer_name || "Sin cliente"}</Text>
          <Text style={styles.cardItems}>
            {(sale.items || []).map((i: any) => `${i.quantity}× ${i.name}`).join(", ")}
          </Text>
          <View style={styles.row}>
            <Text style={styles.rowK}>Total</Text><Text style={styles.rowV}>{formatMoney(sale.total || 0, currency)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowK}>Pagado</Text><Text style={[styles.rowV, { color: colors.success }]}>{formatMoney(sale.paid || 0, currency)}</Text>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={[styles.rowK, { fontWeight: "700", color: colors.onSurface }]}>Pendiente</Text>
            <Text style={[styles.rowV, { color: due > 0 ? colors.error : colors.success, fontWeight: "700" }]}>{formatMoney(due, currency)}</Text>
          </View>
        </View>

        {isFullyPaid ? (
          <View style={styles.paidBox}>
            <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            <Text style={styles.paidTxt}>Venta pagada en su totalidad</Text>
          </View>
        ) : (
          <>
            <View style={styles.ppCard}>
              <View style={styles.ppHead}>
                <View style={styles.ppLogo}>
                  <Text style={styles.ppLogoTxt}>PP</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ppTitle}>PayPal · Sandbox</Text>
                  <Text style={styles.ppSub}>Cobro en USD · El cliente paga con tarjeta o cuenta PayPal</Text>
                </View>
              </View>
              <Text style={styles.ppAmount}>USD {parseFloat(amountUsd || "0").toFixed(2)}</Text>

              <Pressable
                style={[styles.btnPrimary, loadingAction === "pay" && { opacity: 0.6 }]}
                onPress={payNow}
                disabled={!!loadingAction}
                testID="paypal-pay-now"
              >
                {loadingAction === "pay" ? <ActivityIndicator color={colors.onBrandPrimary} /> : <>
                  <Ionicons name="card-outline" size={18} color={colors.onBrandPrimary} />
                  <Text style={styles.btnPrimaryTxt}>Pagar ahora en PayPal</Text>
                </>}
              </Pressable>

              <Pressable
                style={[styles.btnSecondary, loadingAction === "share" && { opacity: 0.6 }]}
                onPress={shareLink}
                disabled={!!loadingAction}
                testID="paypal-share"
              >
                {loadingAction === "share" ? <ActivityIndicator color={colors.brandPrimary} /> : <>
                  <Ionicons name="share-social-outline" size={18} color={colors.brandPrimary} />
                  <Text style={styles.btnSecondaryTxt}>Compartir enlace al cliente</Text>
                </>}
              </Pressable>

              {!!sale.paypal_order_id && (
                <Pressable
                  style={[styles.btnGhost, loadingAction === "verify" && { opacity: 0.6 }]}
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
                Al tocar "Compartir", el enlace se abre en WhatsApp/mensajes. Cuando el cliente pague, toca "Verificar pago" para registrarlo.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  cardLabel: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  cardItems: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: spacing.sm },
  row: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowK: { fontSize: 14, color: colors.muted },
  rowV: { fontSize: 14, color: colors.onSurface, fontWeight: "500" },
  paidBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.brandTertiary, padding: spacing.lg, borderRadius: radius.md,
  },
  paidTxt: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  ppCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
  },
  ppHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  ppLogo: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: "#003087",
    justifyContent: "center", alignItems: "center",
  },
  ppLogoTxt: { color: "#FFC439", fontWeight: "900", fontSize: 14 },
  ppTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  ppSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  ppAmount: { fontSize: 28, fontWeight: "700", color: colors.onSurface, marginVertical: spacing.sm },
  btnPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: "#0070BA", paddingVertical: spacing.md, borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  btnPrimaryTxt: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
  btnSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandTertiary, paddingVertical: spacing.md, borderRadius: radius.pill,
  },
  btnSecondaryTxt: { color: colors.brandPrimary, fontWeight: "600", fontSize: 15 },
  btnGhost: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, paddingVertical: spacing.md, borderRadius: radius.pill,
  },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "500", fontSize: 14 },
  hint: { fontSize: 12, color: colors.muted, marginTop: spacing.sm, lineHeight: 17 },
});
