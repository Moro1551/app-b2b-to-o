import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Platform, Linking, Share } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { toRemoteUrl, uploadAnyFile } from "@/src/image-utils";
import { colors, radius, spacing } from "@/src/theme";

export default function Catalog() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeId, activeBusiness } = useBusiness();
  const [generating, setGenerating] = useState(false);
  const [sharingWa, setSharingWa] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", activeId],
    queryFn: () => api.listProducts(activeId!),
    enabled: !!activeId,
  });

  const currency = activeBusiness?.currency || "L";

  const buildHtml = () => {
    const b = activeBusiness;
    const headerColor = b?.color || "#9D7A2A";
    const items = products.map((p: any) => `
      <div class="card">
        ${p.photos?.[0] ? `<img src="${toRemoteUrl(p.photos[0])}" />` : `<div class="noimg">Sin foto</div>`}
        <div class="info">
          <div class="pname">${escape(p.name)}</div>
          ${p.category ? `<div class="pcat">${escape(p.category)}</div>` : ""}
          ${p.description ? `<div class="pdesc">${escape(p.description)}</div>` : ""}
          <div class="pprice">${formatMoney(p.sale_price || 0, currency)}</div>
        </div>
      </div>
    `).join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; font-family: -apple-system, Helvetica, Arial, sans-serif; }
      body { margin: 0; padding: 24px; color: #1C1C1E; }
      .header { padding: 20px; background: ${headerColor}; color: white; border-radius: 12px; margin-bottom: 24px; }
      .bname { font-size: 28px; font-weight: 700; margin: 0; }
      .bsub { font-size: 14px; opacity: 0.9; margin-top: 4px; }
      .bcontact { font-size: 12px; margin-top: 10px; opacity: 0.95; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
      .card { border: 1px solid #E5E5EA; border-radius: 12px; overflow: hidden; }
      .card img { width: 100%; height: 200px; object-fit: cover; display: block; background: #F2F2F7; }
      .noimg { height: 200px; background: #F2F2F7; display: flex; align-items: center; justify-content: center; color: #8E8E93; font-size: 12px; }
      .info { padding: 10px 12px 12px; }
      .pname { font-size: 15px; font-weight: 600; }
      .pcat { font-size: 11px; color: #8E8E93; margin-top: 2px; }
      .pdesc { font-size: 11px; color: #4A4A4A; margin-top: 4px; }
      .pprice { font-size: 15px; font-weight: 700; color: ${headerColor}; margin-top: 6px; }
    </style></head><body>
      <div class="header">
        <div class="bname">${escape(b?.name || "")}</div>
        ${b?.subtitle ? `<div class="bsub">${escape(b.subtitle)}</div>` : ""}
        <div class="bcontact">
          ${b?.phone ? `Tel: ${escape(b.phone)} · ` : ""}
          ${b?.email ? `${escape(b.email)} · ` : ""}
          ${b?.website || ""}
        </div>
      </div>
      <div class="grid">${items || '<div style="padding:40px;text-align:center;color:#8E8E93">Sin productos</div>'}</div>
    </body></html>`;
  };

  const generate = async () => {
    try {
      setGenerating(true);
      const { uri } = await Print.printToFileAsync({ html: buildHtml() });
      if (Platform.OS === "web") {
        setGenerating(false);
        return;
      }
      const can = await Sharing.isAvailableAsync();
      if (can) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Catálogo" });
      } else {
        Alert.alert("Catálogo", `PDF guardado en: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo generar el PDF");
    } finally {
      setGenerating(false);
    }
  };

  const shareWhatsapp = async () => {
    if (sharingWa || isLoading) return;
    setSharingWa(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHtml() });
      const name = `catalogo-${(activeBusiness?.name || "negocio").replace(/\s+/g, "-").toLowerCase()}.pdf`;
      const { absoluteUrl } = await uploadAnyFile(uri, "application/pdf", name);
      const text = `Catálogo de ${activeBusiness?.name || "nuestro negocio"} 📒\n${absoluteUrl}`;
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else if (Platform.OS === "web" && (navigator as any).share) {
        await (navigator as any).share({ title: "Catálogo", text, url: absoluteUrl });
      } else {
        await Share.share({ message: text });
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo compartir el catálogo");
    } finally {
      setSharingWa(false);
    }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={28} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Catálogo PDF</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl + insets.bottom }}>
        <View style={styles.card}>
          <Text style={styles.heroTitle}>Genera tu catálogo</Text>
          <Text style={styles.heroSub}>
            {products.length} producto{products.length !== 1 ? "s" : ""} en {activeBusiness?.name || ""}.
          </Text>
          <Text style={styles.heroInfo}>
            El catálogo incluye encabezado con nombre, subtítulo y contactos del negocio, y una tarjeta por producto con foto, categoría, descripción y precio.
          </Text>
        </View>
        <Pressable
          style={[styles.waBtn, (sharingWa || isLoading) && { opacity: 0.6 }]}
          onPress={shareWhatsapp}
          disabled={sharingWa || isLoading}
          testID="catalog-whatsapp"
        >
          {sharingWa ? <ActivityIndicator color="#FFFFFF" /> : <>
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.waTxt}>Compartir por WhatsApp</Text>
          </>}
        </Pressable>
        <Pressable style={styles.cta} onPress={generate} disabled={generating || isLoading} testID="catalog-generate">
          {generating ? <ActivityIndicator color={colors.onBrandPrimary} /> : <>
            <Ionicons name="document-text" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.ctaTxt}>Generar y compartir PDF</Text>
          </>}
        </Pressable>
        <Text style={styles.waHint}>
          "Compartir por WhatsApp" sube el PDF a la nube y envía el enlace para que tus clientes lo abran desde cualquier dispositivo.
        </Text>
      </ScrollView>
    </View>
  );
}

function escape(s: string) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  card: { backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  heroTitle: { fontSize: 22, fontWeight: "700", color: colors.onSurface },
  heroSub: { fontSize: 14, color: colors.onBrandTertiary, marginTop: spacing.xs },
  heroInfo: { fontSize: 13, color: colors.muted, marginTop: spacing.md, lineHeight: 18 },
  cta: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center",
    backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.pill,
  },
  ctaTxt: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 16 },
  waBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center",
    backgroundColor: "#25D366", paddingVertical: spacing.md, borderRadius: radius.pill, marginBottom: spacing.sm,
  },
  waTxt: { color: "#FFFFFF", fontWeight: "600", fontSize: 16 },
  waHint: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.md, lineHeight: 17 },
});
