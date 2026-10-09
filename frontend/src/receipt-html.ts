// HTML for a sale receipt (A5 PDF), in the same look as the catalog: the business band with its
// logo, a white card with the items, totals and payments, and the contact details at the foot.
// Kept free of app imports so it can also be rendered outside the app to check the layout.
import { GRAIN, brandColor, businessContacts, esc } from "./catalog-html";
import type { CatalogBusiness } from "./catalog-html";

export type ReceiptSale = {
  id: string; created_at: string; customer_name?: string; note?: string;
  items: { name: string; quantity: number; unit_price: number }[];
  total: number; paid: number;
  payments?: { amount: number; method: string; note?: string; created_at: string }[];
};

/** Labels for the payment methods the server records. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  venta: "Al registrar la venta",
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  otro: "Otro",
  paypal: "PayPal",
};

/** A5 in PDF points (148 × 210 mm). */
export const RECEIPT_PAGE = { width: 420, height: 595 };

export const receiptNumber = (sale: { id: string }) => sale.id.slice(0, 8).toUpperCase();

type Options = {
  business: CatalogBusiness;
  sale: ReceiptSale;
  customerPhone?: string;
  formatPrice: (amount: number) => string;
  /** "9 de octubre de 2026" and "1:51 p. m." for an ISO date. */
  formatDay: (iso: string) => string;
  formatTime: (iso: string) => string;
  resolveUrl: (pathOrUrl: string) => string;
  fontCss?: string;
};

const INK = "#3B3936";
const MUTED = "#77716A";
const STONE = "#ECEAE6";
const OK = "#16884A";
const WARN = "#B86E00";

export function buildReceiptHtml({ business: b, sale, customerPhone, formatPrice, formatDay, formatTime, resolveUrl, fontCss = "" }: Options): string {
  const brand = brandColor(b);
  const due = Math.max(0, (sale.total || 0) - (sale.paid || 0));
  const paidInFull = due <= 0.005;
  const payments = [...(sale.payments || [])].sort((x, y) => x.created_at.localeCompare(y.created_at));
  // Sales from before the payment history only know the paid total.
  const untracked = (sale.paid || 0) - payments.reduce((s, p) => s + (p.amount || 0), 0);
  const { pill, contacts } = businessContacts(b);
  const logoUrl = b.logo ? resolveUrl(b.logo) : "";

  const items = sale.items.map((it) => `
    <tr>
      <td class="qty">${esc(it.quantity)}</td>
      <td>${esc(it.name)}</td>
      <td class="r">${esc(formatPrice(it.unit_price))}</td>
      <td class="r b">${esc(formatPrice(it.quantity * it.unit_price))}</td>
    </tr>`).join("");

  const paymentRows = [
    ...(untracked > 0.005 ? [`<li><span>Pagos anteriores</span><b>${esc(formatPrice(untracked))}</b></li>`] : []),
    ...payments.map((p) => `
      <li>
        <span>${esc(formatDay(p.created_at))} · ${esc(PAYMENT_METHOD_LABELS[p.method] || "Otro")}${p.note ? ` · ${esc(p.note)}` : ""}</span>
        <b>${esc(formatPrice(p.amount))}</b>
      </li>`),
  ].join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Recibo #${esc(receiptNumber(sale))}</title><style>
${fontCss}
@page { size: 148mm 210mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* On html so the texture covers every page, also below the content of the last one. */
html { background: radial-gradient(ellipse at 20% 30%, rgba(255,255,255,.55), transparent 50%), ${GRAIN}, ${STONE}; }
body { width: 559px; min-height: 792px; font-family: "Montserrat", "Helvetica Neue", Roboto, Arial, sans-serif; color: ${INK}; }
.band { height: 170px; padding-top: 20px; text-align: center; color: #fff; background: ${GRAIN}, ${brand}; }
.logo {
  width: 44px; height: 44px; margin: 0 auto; border-radius: 8px; background: #fff; overflow: hidden;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,.18);
}
.logo img { width: 100%; height: 100%; object-fit: contain; }
.logo span { font-size: 21px; font-weight: 700; color: ${brand}; }
h1 { margin-top: 10px; padding: 0 40px; font-size: 20px; line-height: 24px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tagline { margin-top: 2px; font-size: 11px; font-weight: 600; opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 40px; }
.card {
  margin: -40px 36px 0; padding: 20px 22px 18px; background: #fff;
  box-shadow: 0 4px 12px rgba(45,38,30,.13), 0 1px 2px rgba(45,38,30,.10);
}
.label { font-size: 8px; letter-spacing: .14em; text-transform: uppercase; color: ${MUTED}; }
.head { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid #E8E4DF; }
.num { margin-top: 3px; font-size: 17px; font-weight: 700; letter-spacing: .04em; }
.when { text-align: right; font-size: 10.5px; }
.when p + p { color: ${MUTED}; margin-top: 1px; }
.when .label + p { margin-top: 3px; }
.customer { padding: 12px 0; border-bottom: 1px solid #E8E4DF; }
.cname { margin-top: 3px; font-size: 13px; font-weight: 700; }
.cphone { font-size: 10px; color: ${MUTED}; margin-top: 1px; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10.5px; }
th { padding: 0 0 6px; font-size: 8px; letter-spacing: .1em; text-transform: uppercase; color: ${MUTED}; font-weight: 600; text-align: left; border-bottom: 1px solid #E8E4DF; }
td { padding: 7px 0; border-bottom: 1px solid #F1EEEA; vertical-align: top; }
tr { break-inside: avoid; page-break-inside: avoid; }
td + td, th + th { padding-left: 8px; }
.qty { width: 30px; color: ${MUTED}; font-weight: 600; }
.r { text-align: right; white-space: nowrap; }
.b { font-weight: 700; }
.totals { margin-top: 12px; margin-left: auto; width: 62%; font-size: 11px; }
.totals div { display: flex; justify-content: space-between; padding: 3px 0; }
.totals .due { margin-top: 4px; padding-top: 8px; border-top: 1px solid #E8E4DF; font-size: 13px; font-weight: 700; }
.ok { color: ${OK}; }
.warn { color: ${WARN}; }
.stamp {
  display: inline-block; margin-top: 14px; padding: 5px 12px; border: 1.5px solid currentColor; font-size: 9px; font-weight: 700;
  letter-spacing: .18em; text-transform: uppercase;
}
.payments { margin-top: 16px; break-inside: avoid; page-break-inside: avoid; }
.payments ul { list-style: none; margin-top: 6px; }
.payments li { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 10px; border-bottom: 1px solid #F1EEEA; }
.payments li span { color: ${MUTED}; }
.note { margin-top: 14px; padding: 9px 11px; font-size: 10px; line-height: 1.45; color: #55504A; background: #F4F2EF; }
footer { padding: 22px 36px 26px; text-align: center; }
.thanks { font-size: 12px; font-weight: 700; letter-spacing: .06em; }
.contacts { margin-top: 8px; font-size: 8.5px; line-height: 1.6; color: ${MUTED}; }
.contacts i { font-style: normal; opacity: .55; margin: 0 .6em; }
.pill {
  display: inline-block; margin-top: 10px; padding: 5px 18px; background: ${GRAIN}, ${brand}; color: #fff; font-size: 9px; font-weight: 700;
  letter-spacing: .14em; text-transform: uppercase;
}
</style></head><body>
<header class="band">
  <div class="logo">${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : `<span>${esc((b.name || "?").trim().charAt(0).toUpperCase())}</span>`}</div>
  <h1>${esc(b.name || "Recibo")}</h1>
  ${b.subtitle ? `<p class="tagline">${esc(b.subtitle)}</p>` : ""}
</header>
<main class="card">
  <div class="head">
    <div>
      <p class="label">Recibo de venta</p>
      <p class="num">#${esc(receiptNumber(sale))}</p>
    </div>
    <div class="when">
      <p class="label">Fecha</p>
      <p>${esc(formatDay(sale.created_at))}</p>
      <p>${esc(formatTime(sale.created_at))}</p>
    </div>
  </div>
  ${sale.customer_name ? `
  <div class="customer">
    <p class="label">Cliente</p>
    <p class="cname">${esc(sale.customer_name)}</p>
    ${customerPhone ? `<p class="cphone">${esc(customerPhone)}</p>` : ""}
  </div>` : ""}
  <table>
    <thead><tr><th>Cant.</th><th>Producto</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead>
    <tbody>${items}</tbody>
  </table>
  <div class="totals">
    <div><span>Total</span><b>${esc(formatPrice(sale.total || 0))}</b></div>
    <div><span>Pagado</span><b class="ok">${esc(formatPrice(sale.paid || 0))}</b></div>
    <div class="due"><span>Saldo pendiente</span><span class="${paidInFull ? "ok" : "warn"}">${esc(formatPrice(due))}</span></div>
  </div>
  <p class="stamp ${paidInFull ? "ok" : "warn"}">${paidInFull ? "Pagado" : "Saldo pendiente"}</p>
  ${paymentRows ? `<div class="payments"><p class="label">Pagos recibidos</p><ul>${paymentRows}</ul></div>` : ""}
  ${sale.note ? `<p class="note">${esc(sale.note)}</p>` : ""}
</main>
<footer>
  <p class="thanks">¡Gracias por tu compra!</p>
  ${contacts.length ? `<p class="contacts">${contacts.join("<i>·</i>")}</p>` : ""}
  ${pill ? `<p class="pill">${pill}</p>` : ""}
</footer>
</body></html>`;
}
