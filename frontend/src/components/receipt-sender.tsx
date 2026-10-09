import { useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useBusiness, formatMoney } from "@/src/business-context";
import { toRemoteUrl } from "@/src/image-utils";
import { catalogFontCss } from "@/src/catalog-fonts";
import { RECEIPT_PAGE, buildReceiptHtml, receiptNumber } from "@/src/receipt-html";
import type { ReceiptSale } from "@/src/receipt-html";
import { PrintPreview } from "@/src/components/print-preview";

const A5_WIDTH_PX = 559;

/**
 * Builds a sale's receipt as a PDF and opens the share sheet, so it can go to the customer by
 * WhatsApp. On the web it shows a print preview instead. Render `preview` in the screen.
 */
export function useReceiptSender() {
  const { activeBusiness } = useBusiness();
  const [preview, setPreview] = useState<{ html: string; title: string } | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  const send = async (sale: ReceiptSale, customerPhone?: string) => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    try {
      const currency = activeBusiness?.currency || "L";
      const html = buildReceiptHtml({
        business: activeBusiness || {},
        sale,
        customerPhone,
        formatPrice: (n) => formatMoney(n, currency),
        formatDay: (iso) => format(new Date(iso), "d 'de' MMMM 'de' yyyy", { locale: es }),
        formatTime: (iso) => format(new Date(iso), "h:mm aaaa", { locale: es }),
        resolveUrl: toRemoteUrl,
        fontCss: await catalogFontCss(),
      });
      const title = `Recibo #${receiptNumber(sale)}`;
      if (Platform.OS === "web") {
        setPreview({ html, title });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, ...RECEIPT_PAGE, textZoom: 100 });
      // A readable name, since the customer sees it in the chat.
      const named = new File(Paths.cache, `Recibo-${receiptNumber(sale)}.pdf`);
      await new File(uri).move(named, { overwrite: true });
      if (!(await Sharing.isAvailableAsync())) throw new Error("Este teléfono no permite compartir archivos.");
      await Sharing.shareAsync(named.uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
    } catch (e: any) {
      Alert.alert("No se pudo crear el recibo", e?.message || "Inténtalo de nuevo.");
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const previewElement = Platform.OS === "web" ? (
    <PrintPreview html={preview?.html ?? null} title={preview?.title ?? ""} pageWidth={A5_WIDTH_PX} onClose={() => setPreview(null)} />
  ) : null;

  return { send, sending, preview: previewElement };
}
