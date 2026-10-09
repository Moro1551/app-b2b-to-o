import { Linking } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatMoney } from "./business-context";

/** Digits for wa.me. Honduran numbers saved without the country code (8 digits) get 504. */
export function waNumber(phone?: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length === 8 ? `504${digits}` : digits;
}

/** Opens a WhatsApp chat with the number (or the contact picker without one), optionally with text. */
export function openWhatsapp(phone: string | undefined, text?: string) {
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return Linking.openURL(`https://wa.me/${waNumber(phone)}${query}`);
}

const dueOf = (s: any) => Math.max(0, (s.total || 0) - (s.paid || 0));

function itemsSummary(items: any[] = []): string {
  const names = items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name));
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} y ${names.length - 3} más` : names.join(", ");
}

/**
 * A friendly payment reminder listing each sale with a balance, e.g.
 * "Hola María 👋 Te saluda Bisutería Luna. Te recordamos tu saldo pendiente de *L 650.00*: …".
 */
export function paymentReminder({ customerName, businessName, sales, currency }: {
  customerName?: string; businessName?: string; sales: any[]; currency: string;
}): string {
  const pending = sales.filter((s) => dueOf(s) > 0.005)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const total = pending.reduce((sum, s) => sum + dueOf(s), 0);
  const firstName = (customerName || "").trim().split(/\s+/)[0];
  const lines = pending.map((s) => {
    const when = format(new Date(s.created_at), "d 'de' MMMM", { locale: es });
    const what = itemsSummary(s.items);
    return `• ${when}${what ? ` · ${what}` : ""}: ${formatMoney(dueOf(s), currency)}`;
  });
  return [
    `Hola${firstName ? ` ${firstName}` : ""} 👋`,
    `Te saluda ${businessName || "nuestro negocio"}. Te recordamos con cariño tu saldo pendiente de *${formatMoney(total, currency)}*${pending.length > 1 ? ":" : "."}`,
    pending.length > 1 ? lines.join("\n") : lines[0] || "",
    "Puedes pagar en efectivo o por transferencia. Si ya realizaste el pago, no tomes en cuenta este mensaje. ¡Gracias por tu preferencia!",
  ].filter(Boolean).join("\n\n");
}
