// HTML for the printable catalog (PDF): letter-size pages with the business band on top, a 3×3 grid
// of framed product cards on a light stone background, and the contact details at the foot.
// Kept free of app imports so it can also be rendered outside the app to check the layout.

export type CatalogBusiness = {
  name?: string; subtitle?: string; logo?: string; color?: string;
  phone?: string; email?: string; address?: string; website?: string;
  instagram?: string; facebook?: string; tiktok?: string;
};

export type CatalogProduct = {
  name?: string; category?: string; material?: string; sku?: string; description?: string;
  sale_price?: number; stock?: number; photos?: string[];
};

type Options = {
  business: CatalogBusiness;
  products: CatalogProduct[];
  formatPrice: (amount: number) => string;
  /** Turns a stored photo/logo path into a URL the print engine can load. */
  resolveUrl: (pathOrUrl: string) => string;
  /** @font-face rules for "Montserrat"; without them the system sans-serif is used. */
  fontCss?: string;
  date?: Date;
};

const PER_PAGE = 9;
const MAX_CATEGORIES_SHOWN = 5;
const DEFAULT_COLOR = "#00183F";

const INK = "#3B3936";
const MUTED = "#77716A";
const STONE = "#ECEAE6";
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Fine grain over the background and the band, like the stone paper of a printed lookbook.
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.3  0 0 0 0 0.28  0 0 0 0 0.25  0 0 0 0.10 0'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>")`;

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** "@luna", "luna" or "https://instagram.com/luna/" → "@luna". */
function handle(value?: string): string {
  const v = (value || "").trim().replace(/^https?:\/\/(www\.)?[^/]+\//i, "").replace(/[/?#].*$/, "").replace(/^@/, "");
  return v ? `@${v}` : "";
}

function bareUrl(value?: string): string {
  return (value || "").trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length ? out : [[]];
}

export function buildCatalogHtml({ business: b, products, formatPrice, resolveUrl, fontCss = "", date = new Date() }: Options): string {
  const brand = /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color! : DEFAULT_COLOR;

  // Products grouped by category (alphabetical, uncategorized last), keeping their order inside each.
  const catOf = (p: CatalogProduct) => (p.category || "").trim();
  const categories = [...new Set(products.map(catOf).filter(Boolean))].sort((x, y) => x.localeCompare(y, "es"));
  const rank = (p: CatalogProduct) => (catOf(p) ? categories.indexOf(catOf(p)) : categories.length);
  const ordered = products.map((p, i) => ({ p, i })).sort((x, y) => rank(x.p) - rank(y.p) || x.i - y.i).map((x) => x.p);

  const catLine = categories.slice(0, MAX_CATEGORIES_SHOWN).map((c) => esc(c.toUpperCase())).join("<i>|</i>")
    + (categories.length > MAX_CATEGORIES_SHOWN ? "<i>|</i>Y MÁS" : "");

  // The most useful link goes in the pill; the rest of the contact details on the line above it.
  const ig = handle(b.instagram);
  const pill = bareUrl(b.website) || ig || (b.phone ? `Pedidos: ${b.phone}` : "");
  const contacts = [
    b.phone && !pill.includes(b.phone) && `Tel. / WhatsApp ${b.phone}`,
    b.email,
    ig && ig !== pill && `Instagram ${ig}`,
    handle(b.facebook) && `Facebook ${handle(b.facebook).slice(1)}`,
    handle(b.tiktok) && `TikTok ${handle(b.tiktok)}`,
    b.address,
  ].filter(Boolean).map(esc).join("<i>·</i>");

  const logoUrl = b.logo ? resolveUrl(b.logo) : "";
  const initial = esc((b.name || "?").trim().charAt(0).toUpperCase());
  const band = `
    <div class="band">
      <div class="logo">${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : `<span>${initial}</span>`}</div>
      <h1>${esc(b.name || "Catálogo")}</h1>
      <p class="tagline">${esc(b.subtitle || "Catálogo de productos")}</p>
      ${catLine ? `<p class="cats">${catLine}</p>` : ""}
    </div>`;

  const card = (p: CatalogProduct) => {
    const photo = p.photos?.[0] ? resolveUrl(p.photos[0]) : "";
    const ref = p.sku ? `Referencia: ${p.sku}` : catOf(p);
    const detail = p.material || (p.sku ? catOf(p) : "") || p.description || "";
    const soldOut = (p.stock ?? 1) <= 0;
    return `
      <article class="card">
        <div class="photo">${photo ? `<img src="${esc(photo)}" alt="">` : `<span>${esc((p.name || "?").charAt(0).toUpperCase())}</span>`}</div>
        <h2>${esc(p.name)}</h2>
        <div class="meta">
          <p class="ref">${esc(ref)}</p>
          <p class="detail">${esc(detail)}</p>
          <p class="price"><u>${esc(formatPrice(p.sale_price || 0))}</u>${soldOut ? `<span class="out">Agotado</span>` : ""}</p>
        </div>
      </article>`;
  };

  const pages = chunk(ordered, PER_PAGE);
  const when = `${titleCase(MONTHS[date.getMonth()])} ${date.getFullYear()}`;
  const body = pages.map((list, i) => `
    <section class="page">
      ${band}
      <div class="grid">${list.length ? list.map(card).join("") : `<p class="empty">Aún no hay productos en el catálogo.</p>`}</div>
      <footer>
        ${contacts ? `<p class="contacts">${contacts}</p>` : ""}
        <div class="foot">
          <span>${esc(when)}</span>
          ${pill ? `<b class="pill">${esc(pill)}</b>` : "<b></b>"}
          <span>${pages.length > 1 ? `${i + 1} / ${pages.length}` : ""}</span>
        </div>
      </footer>
    </section>`).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(b.name || "Catálogo")} · Catálogo</title><style>
${fontCss}
@page { size: 8.5in 11in; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: ${STONE}; }
body { font-family: "Montserrat", "Helvetica Neue", Roboto, Arial, sans-serif; color: ${INK}; }
i { font-style: normal; opacity: .55; margin: 0 .7em; }

/* Letter page, 816×1056 CSS px. 2px shorter so rounding never spills onto an extra sheet. */
.page {
  position: relative; width: 816px; height: 1054px; overflow: hidden;
  break-after: page; page-break-after: always;
  background:
    radial-gradient(ellipse at 18% 42%, rgba(255,255,255,.55), transparent 46%),
    radial-gradient(ellipse at 84% 78%, rgba(120,110,100,.06), transparent 50%),
    ${GRAIN}, ${STONE};
}
.page:last-child { break-after: auto; page-break-after: auto; }

.band {
  position: absolute; top: 0; left: 0; right: 0; height: 212px; padding-top: 20px;
  text-align: center; color: #fff; background: ${GRAIN}, ${brand};
}
.logo {
  width: 50px; height: 50px; margin: 0 auto; border-radius: 8px; background: #fff; overflow: hidden;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,.18);
}
.logo img { width: 100%; height: 100%; object-fit: contain; }
.logo span { font-size: 24px; font-weight: 700; color: ${brand}; }
h1 { margin-top: 12px; font-size: 29px; line-height: 34px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 48px; }
.tagline { margin-top: 4px; font-size: 14px; line-height: 18px; font-weight: 600; opacity: .92;
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 64px; }
.cats { margin-top: 12px; font-size: 10.5px; line-height: 14px; font-weight: 400; letter-spacing: .34em; opacity: .9; }

.grid {
  position: absolute; top: 176px; left: 66px; right: 66px;
  display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 28px; row-gap: 18px;
}
.card {
  background: #fff; padding: 9px 9px 0; height: 256px;
  box-shadow: 0 4px 12px rgba(45,38,30,.13), 0 1px 2px rgba(45,38,30,.10);
}
.photo { height: 145px; background: #F1EEEA; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.photo span { font-size: 40px; font-weight: 700; color: #D5CFC7; }
h2 { margin-top: 8px; height: 29px; font-size: 11.5px; line-height: 14.5px; font-weight: 700; color: ${INK};
     display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { margin: 8px -9px 0; padding: 7px 9px 0; height: 57px; background: #F4F2EF; border-top: 1px solid #E8E4DF; }
.ref, .detail { font-size: 8px; line-height: 11.5px; color: ${MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ref { text-transform: uppercase; letter-spacing: .05em; }
.price { margin-top: 4px; font-size: 13px; line-height: 16px; font-weight: 700; color: ${INK}; white-space: nowrap; }
.price u { text-decoration-thickness: 1px; text-underline-offset: 3px; }
.out { margin-left: 8px; font-size: 7.5px; letter-spacing: .08em; text-transform: uppercase; color: #A0473C; font-weight: 600; }
.empty { grid-column: 1 / -1; margin-top: 120px; text-align: center; font-size: 14px; color: ${MUTED}; }

footer { position: absolute; left: 66px; right: 66px; bottom: 14px; text-align: center; }
.contacts { font-size: 9px; line-height: 13px; color: ${MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.foot { margin-top: 8px; display: flex; align-items: center; justify-content: space-between; }
.foot span { width: 120px; font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase; color: ${MUTED}; }
.foot span:last-child { text-align: right; }
.pill { padding: 6px 22px; background: ${GRAIN}, ${brand}; color: #fff; font-size: 10px; letter-spacing: .14em;
        text-transform: uppercase; font-weight: 700; max-width: 380px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head><body>${body}</body></html>`;
}
