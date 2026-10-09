import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Platform, Linking, Share } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api";
import { useBusiness, formatMoney } from "@/src/business-context";
import { toRemoteUrl, uploadAnyFile } from "@/src/image-utils";
import { SubHeader } from "@/src/components/top-header";
import { SectionHead, formStyles } from "@/src/components/form-screen";
import { colors, radius, spacing } from "@/src/theme";

export default function Catalog() {
  const router = useRouter();
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
    const headerColor = b?.color || colors.brandPrimary;
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
      body { margin: 0; padding: 24px; color: ${colors.onSurface}; }
      .header { padding: 20px; background: ${headerColor}; color: white; border-radius: 8px; margin-bottom: 24px; }
      .bname { font-size: 28px; font-weight: 700; margin: 0; }
      .bsub { font-size: 14px; opacity: 0.9; margin-top: 4px; }
      .bcontact { font-size: 12px; margin-top: 10px; opacity: 0.95; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
      .card { border: 1px solid ${colors.border}; border-radius: 8px; overflow: hidden; }
      .card img { width: 100%; height: 200px; object-fit: cover; display: block; background: ${colors.surfaceSecondary}; }
      .noimg { height: 200px; background: ${colors.surfaceSecondary}; display: flex; align-items: center; justify-content: center; color: ${colors.muted}; font-size: 12px; }
      .info { padding: 10px 12px 12px; }
      .pname { font-size: 15px; font-weight: 600; }
      .pcat { font-size: 11px; color: ${colors.muted}; margin-top: 2px; }
      .pdesc { font-size: 11px; color: ${colors.muted}; margin-top: 4px; }
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
      <div class="grid">${items || `<div style="padding:40px;text-align:center;color:${colors.muted}">Sin productos</div>`}</div>
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

  const publicUrl = activeBusiness && activeId
    ? `${(process.env.EXPO_PUBLIC_BACKEND_URL as string || "").replace(/\/$/, "")}/api/public/catalog/${activeId}`
    : "";

  const shareOnline = async () => {
    if (!publicUrl) return;
    const text = `Mira el catálogo de ${activeBusiness?.name || "nuestro negocio"} 🛍️\n${publicUrl}`;
    try {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else if (Platform.OS === "web" && (navigator as any).share) {
        await (navigator as any).share({ title: "Catálogo online", text, url: publicUrl });
      } else {
        await Share.share({ message: text });
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo compartir");
    }
  };

  const openOnline = async () => {
    if (!publicUrl) return;
    try { await Linking.openURL(publicUrl); } catch (e: any) { Alert.alert("Error", e?.message); }
  };

  const previews = products.filter((p: any) => p.photos?.[0]).slice(0, 4);
  const busy = generating || sharingWa || isLoading;

  return (
    <View style={styles.wrap}>
      <SubHeader title="Catálogo" subtitle={activeBusiness?.name} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <View style={[formStyles.card, styles.hero]}>
          <View style={styles.previews}>
            {isLoading ? (
              <View style={[styles.preview, styles.previewEmpty]}><ActivityIndicator color={colors.brandPrimary} /></View>
            ) : previews.length > 0 ? (
              previews.map((p: any) => (
                <Image key={p.id} source={{ uri: toRemoteUrl(p.photos[0]) }} style={styles.preview} contentFit="cover" />
              ))
            ) : (
              <View style={[styles.preview, styles.previewEmpty]}>
                <Ionicons name="images-outline" size={22} color={colors.muted} />
              </View>
            )}
          </View>
          <Text style={styles.heroTitle}>
            {isLoading ? "Cargando productos…" : `${products.length} ${products.length === 1 ? "producto" : "productos"} en tu catálogo`}
          </Text>
          <Text style={styles.heroSub}>
            Comparte tu catálogo con tus clientes como página web o como archivo PDF. Incluye foto, categoría, descripción y precio de cada producto.
          </Text>
          {!isLoading && products.length === 0 && (
            <Pressable style={styles.emptyCta} onPress={() => router.push("/product-form")} testID="catalog-add-product">
              <Ionicons name="add" size={18} color={colors.onBrandSecondary} />
              <Text style={styles.emptyCtaTxt}>Añade tu primer producto</Text>
            </Pressable>
          )}
        </View>

        <SectionHead title="Catálogo online" />
        <View style={[formStyles.card, styles.block]}>
          <View style={styles.urlBox}>
            <Ionicons name="link" size={16} color={colors.muted} />
            <Text style={styles.urlTxt} numberOfLines={1} selectable>{publicUrl}</Text>
            <Pressable onPress={openOnline} hitSlop={8} style={styles.openBtn} testID="catalog-open-online">
              <Text style={styles.openTxt}>Abrir</Text>
              <Ionicons name="open-outline" size={14} color={colors.onBrandSecondary} />
            </Pressable>
          </View>
          <Pressable style={[styles.btn, styles.btnWa]} onPress={shareOnline} testID="catalog-share-online">
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.btnWaTxt}>Compartir enlace por WhatsApp</Text>
          </Pressable>
          <Text style={styles.hint}>
            Tus clientes abren el enlace en el navegador, ven las fotos ampliadas y piden cada producto con un toque.
          </Text>
        </View>

        <SectionHead title="Archivo PDF" />
        <View style={[formStyles.card, styles.block]}>
          <Pressable
            style={[styles.btn, styles.btnOutline, busy && { opacity: 0.6 }]}
            onPress={shareWhatsapp}
            disabled={busy}
            testID="catalog-whatsapp"
          >
            {sharingWa ? <ActivityIndicator color={colors.onSurface} /> : <>
              <Ionicons name="logo-whatsapp" size={20} color={WHATSAPP_DARK} />
              <Text style={styles.btnOutlineTxt}>Enviar PDF por WhatsApp</Text>
            </>}
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]} onPress={generate} disabled={busy} testID="catalog-generate">
            {generating ? <ActivityIndicator color={colors.onBrandPrimary} /> : <>
              <Ionicons name="document-text-outline" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.btnPrimaryTxt}>Generar PDF</Text>
            </>}
          </Pressable>
          <Text style={styles.hint}>
            El PDF usa el color y los datos de contacto de tu negocio. Puedes cambiarlos en Perfil del negocio.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function escape(s: string) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// WhatsApp's own brand greens, so the share option is recognizable.
const WHATSAPP = "#25D366";
const WHATSAPP_DARK = "#128C7E";

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceSecondary },
  hero: { padding: spacing.lg, gap: spacing.sm },
  previews: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  preview: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  previewEmpty: { justifyContent: "center", alignItems: "center" },
  heroTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  heroSub: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  emptyCta: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.brandSecondary,
  },
  emptyCtaTxt: { fontSize: 13, fontWeight: "700", color: colors.onBrandSecondary },
  block: { padding: spacing.md, gap: spacing.md },
  urlBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingLeft: spacing.md, paddingRight: spacing.xs, height: 44,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  urlTxt: { flex: 1, fontSize: 12, color: colors.onSurface },
  openBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.brandSecondary,
  },
  openTxt: { fontSize: 12, fontWeight: "700", color: colors.onBrandSecondary },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    paddingVertical: 14, borderRadius: radius.md,
  },
  btnWa: { backgroundColor: WHATSAPP },
  btnWaTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  btnOutline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  btnOutlineTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 15 },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryTxt: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 15 },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});
