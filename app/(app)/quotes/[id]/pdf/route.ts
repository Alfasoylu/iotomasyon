import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { NextResponse } from "next/server";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";

import { getCurrentSession } from "@/lib/auth";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { formatQuoteStatus, getStoredTaxRateDisplay } from "@/lib/quote-utils";
import { getQuoteById } from "@/services/quote-service";

export const dynamic = "force-dynamic";
export const dynamicParams = true;
export const revalidate = 0;
export const runtime = "nodejs";

// ── Page constants ──────────────────────────────────────────────
const PW = 595;
const PH = 842;
const ML = 40; // margin left
const MR = 40; // margin right
const CW = PW - ML - MR; // 515 usable width

// ── Colour palette ──────────────────────────────────────────────
const C = {
  navy: rgb(0.05, 0.08, 0.16),
  accent: rgb(0.13, 0.56, 0.95),
  slate900: rgb(0.1, 0.13, 0.2),
  slate700: rgb(0.22, 0.26, 0.34),
  slate500: rgb(0.4, 0.44, 0.52),
  slate300: rgb(0.67, 0.71, 0.78),
  slate200: rgb(0.84, 0.87, 0.92),
  slate100: rgb(0.93, 0.94, 0.96),
  slate50: rgb(0.97, 0.97, 0.99),
  white: rgb(1, 1, 1),
  emerald50: rgb(0.94, 0.99, 0.97),
  emerald200: rgb(0.6, 0.91, 0.8),
};

// ── Column layout for product table ────────────────────────────
const COLS = [
  { key: "num", x: ML + 6, w: 18, label: "NO" },
  { key: "product", x: ML + 26, w: 106, label: "URUN / SKU" },
  { key: "desc", x: ML + 134, w: 118, label: "ACIKLAMA" },
  { key: "qty", x: ML + 254, w: 28, label: "ADET" },
  { key: "price", x: ML + 284, w: 88, label: "BIRIM FIYAT" },
  { key: "tax", x: ML + 374, w: 32, label: "KDV" },
  { key: "total", x: ML + 408, w: 107, label: "TOPLAM" },
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentSession();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) return new NextResponse("Not Found", { status: 404 });

  // ── Font ─────────────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontPath = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "compiled",
    "@vercel",
    "og",
    "Geist-Regular.ttf",
  );
  const fontBytes = await readFile(fontPath);
  const font = await pdf.embedFont(fontBytes, { subset: true });

  // ── Quote currency context ────────────────────────────────────
  const quoteCurrency = quote.items[0]?.currency ?? "TRY";
  const mode = quote.currencyMode ?? "TRY";
  const rate = quote.exchangeRate != null ? Number(quote.exchangeRate) : null;

  // Currency formatter that avoids ₺ — uses "TL" prefix instead
  function pdfAmt(value: number, currency: string): string {
    const n = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return `${currency.toUpperCase() === "USD" ? "USD" : "TL"} ${n}`;
  }

  function pdfPair(value: number, itemCurrency: string): string {
    const isUsd = itemCurrency.toUpperCase() === "USD";
    const r = rate && rate > 0 ? rate : null;
    if (mode === "USD") {
      return pdfAmt(isUsd ? value : r ? value / r : value, "USD");
    }
    if (mode === "TRY") {
      return pdfAmt(isUsd && r ? value * r : value, "TRY");
    }
    // BOTH
    if (isUsd && r) return `${pdfAmt(value, "USD")} / ${pdfAmt(value * r, "TRY")}`;
    if (!isUsd && r) return `${pdfAmt(value, itemCurrency)} / ${pdfAmt(value / r, "USD")}`;
    return pdfAmt(value, itemCurrency);
  }

  // ── Page state ────────────────────────────────────────────────
  let page = pdf.addPage([PW, PH]);
  let y = PH; // cursor: top edge of next element (decrements downward)

  function ensureSpace(needed: number) {
    if (y - needed < 56) {
      page = pdf.addPage([PW, PH]);
      y = PH - 40;
      // Continuation strip
      page.drawRectangle({ x: 0, y: PH - 24, width: PW, height: 24, color: C.navy });
      page.drawText(safe(COMPANY_SETTINGS.companyName), {
        x: ML, y: PH - 16, size: 8, font, color: C.white,
      });
      page.drawText(safe(`${quote!.quoteNumber} — devam`), {
        x: PW - ML - 90, y: PH - 16, size: 8, font, color: C.slate300,
      });
      y = PH - 38;
    }
  }

  // ── SECTION 1: Header bar ─────────────────────────────────────
  const HEADER_H = 84;
  // Accent stripe at very top
  page.drawRectangle({ x: 0, y: PH - 3, width: PW, height: 3, color: C.accent });
  // Dark header
  page.drawRectangle({ x: 0, y: PH - HEADER_H, width: PW, height: HEADER_H - 3, color: C.navy });

  // Company info — left
  drawTxt(page, font, safe(COMPANY_SETTINGS.companyName), ML, PH - 26, 15, C.white);
  drawTxt(page, font, safe(COMPANY_SETTINGS.tagline), ML, PH - 42, 8, C.slate300);
  drawTxt(page, font, safe(`${COMPANY_SETTINGS.email}  |  ${COMPANY_SETTINGS.phone}`), ML, PH - 55, 8, C.slate300);
  drawTxt(page, font, safe(COMPANY_SETTINGS.website), ML, PH - 67, 8, C.slate300);

  // "FİYAT TEKLİFİ" — right
  drawTxt(page, font, "FIYAT TEKLİFİ", PW - ML - 116, PH - 26, 13, C.white);
  drawTxt(page, font, safe(quote.quoteNumber), PW - ML - 116, PH - 42, 9, C.slate300);

  y = PH - HEADER_H - 10;

  // ── SECTION 2: Metadata strip ─────────────────────────────────
  const META_H = 42;
  page.drawRectangle({
    x: ML, y: y - META_H, width: CW, height: META_H,
    color: C.slate50, borderColor: C.slate200, borderWidth: 0.5,
  });

  const metaCols = [
    ["TEKLIF NO", safe(quote.quoteNumber)],
    ["TARİH", fmtDate(quote.createdAt)],
    ["GECERLİLİK", quote.validityDate ? fmtDate(quote.validityDate) : "Belirtilmedi"],
    ["DURUM", safe(formatQuoteStatus(quote.status))],
  ] as const;
  const metaColW = CW / 4;
  metaCols.forEach(([label, value], i) => {
    const mx = ML + 10 + i * metaColW;
    drawTxt(page, font, label, mx, y - 14, 7, C.slate500);
    drawTxt(page, font, safe(value), mx, y - 28, 9, C.slate900);
  });

  y -= META_H + 12;

  // ── SECTION 3: Customer block ─────────────────────────────────
  const CUST_H = 74;
  page.drawRectangle({
    x: ML, y: y - CUST_H, width: CW, height: CUST_H,
    color: C.white, borderColor: C.slate200, borderWidth: 0.5,
  });
  drawTxt(page, font, "ALICI", ML + 10, y - 13, 7, C.slate500);

  const custRows = [
    ["Firma / Müsteri", safe(limitTxt(quote.customer.company ?? quote.customer.name, 40))],
    ["Yetkili", safe(limitTxt(quote.customer.name, 36))],
    ["Telefon", safe(quote.customer.phone ?? "-")],
    ["E-posta", safe(limitTxt(quote.customer.email ?? "-", 36))],
  ];
  custRows.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = ML + 10 + col * (CW / 2);
    const cy = y - 27 - row * 24;
    drawTxt(page, font, safe(label), cx, cy + 10, 7, C.slate500);
    drawTxt(page, font, safe(value), cx, cy, 9, C.slate900);
  });

  y -= CUST_H + 12;

  // ── SECTION 4: Table ──────────────────────────────────────────
  const TH_H = 22;
  const ROW_H = 30;

  function drawTableHeader() {
    page.drawRectangle({ x: ML, y: y - TH_H, width: CW, height: TH_H, color: C.navy });
    COLS.forEach((col) => {
      drawTxt(page, font, col.label, col.x, y - 14, 7, C.white);
    });
    y -= TH_H;
  }

  drawTableHeader();

  quote.items.forEach((item, idx) => {
    ensureSpace(ROW_H + 4);
    if (y === PH - 38) drawTableHeader(); // redraw header on new page

    const shaded = idx % 2 === 1;
    page.drawRectangle({
      x: ML, y: y - ROW_H, width: CW, height: ROW_H,
      color: shaded ? C.slate50 : C.white,
      borderColor: C.slate200, borderWidth: 0.5,
    });

    const unitDisplay = pdfPair(Number(item.unitPrice), item.currency);
    const totalDisplay = pdfPair(Number(item.total), item.currency);
    const taxRateDisplay =
      getStoredTaxRateDisplay(
        item.quantity,
        item.unitPrice.toString(),
        item.discount.toString(),
        item.tax.toString(),
      ) ?? `%${Math.round(Number(item.tax))}`;
    const productLabel = item.product
      ? `${limitTxt(item.product.name, 20)} (${item.product.sku})`
      : "Manuel kalem";

    const ty = y - 12;
    drawTxt(page, font, String(idx + 1), COLS[0].x, ty, 8, C.slate500);
    drawTxt(page, font, safe(limitTxt(productLabel, 26)), COLS[1].x, ty, 8, C.slate900);
    drawTxt(page, font, safe(limitTxt(item.description, 30)), COLS[2].x, ty, 8, C.slate700);
    drawTxt(page, font, String(item.quantity), COLS[3].x, ty, 8, C.slate700);
    drawTxt(page, font, safe(limitTxt(unitDisplay, 18)), COLS[4].x, ty, 8, C.slate700);
    drawTxt(page, font, safe(taxRateDisplay), COLS[5].x, ty, 8, C.slate700);
    drawTxt(page, font, safe(limitTxt(totalDisplay, 22)), COLS[6].x, ty, 8, C.slate900);

    y -= ROW_H;
  });

  y -= 10;

  // ── SECTION 5: Totals ─────────────────────────────────────────
  ensureSpace(110);

  const TX = ML + CW - 192; // right-align totals block
  const subDisp = pdfPair(Number(quote.subtotal), quoteCurrency);
  const discDisp = pdfPair(Number(quote.discountTotal), quoteCurrency);
  const taxDisp = pdfPair(Number(quote.taxTotal), quoteCurrency);
  const grandDisp = pdfPair(Number(quote.total), quoteCurrency);

  const subRows: Array<[string, string]> = [
    ["Ara Toplam", subDisp],
    ["İndirim", discDisp],
    ["KDV", taxDisp],
  ];

  subRows.forEach(([label, value], i) => {
    const ry = y - 14 - i * 18;
    drawTxt(page, font, safe(label), TX, ry, 9, C.slate500);
    drawTxt(page, font, safe(value), TX + 96, ry, 9, C.slate700);
  });

  y -= 14 + 3 * 18 + 8;

  // Grand total — dark dominant box
  const GT_H = 38;
  page.drawRectangle({ x: TX - 4, y: y - GT_H, width: 196, height: GT_H, color: C.navy });
  drawTxt(page, font, "GENEL TOPLAM", TX + 2, y - 13, 7, C.slate300);
  drawTxt(page, font, safe(limitTxt(grandDisp, 26)), TX + 2, y - 28, 12, C.white);

  y -= GT_H + 12;

  // Exchange rate note
  if (rate && rate > 0) {
    const rateN = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rate);
    drawTxt(page, font, safe(`Kur: 1 USD = TL ${rateN}`), ML, y, 8, C.slate500);
    y -= 16;
  }

  y -= 6;

  // ── SECTION 6: Commercial terms & notes ──────────────────────
  ensureSpace(100);

  const termsLines = [
    quote.notes ? `Not: ${quote.notes}` : null,
    `Odeme: ${COMPANY_SETTINGS.paymentTerms}`,
    `Teslimat: ${COMPANY_SETTINGS.deliveryTerms}`,
    `Garanti: ${COMPANY_SETTINGS.warrantyTerms}`,
  ].filter((x): x is string => Boolean(x));

  const TERMS_H = Math.min(4 + termsLines.length * 22 + 24, 110);
  page.drawRectangle({
    x: ML, y: y - TERMS_H, width: CW, height: TERMS_H,
    color: C.slate50, borderColor: C.slate200, borderWidth: 0.5,
  });
  drawTxt(page, font, "TİCARİ KOSULLAR VE NOTLAR", ML + 10, y - 13, 7, C.slate500);

  let termsY = y - 27;
  for (const line of termsLines) {
    const wrapped = wrapTxt(safe(line), 98).slice(0, 1);
    for (const wl of wrapped) {
      drawTxt(page, font, wl, ML + 10, termsY, 8, C.slate700);
      termsY -= 16;
    }
  }

  y -= TERMS_H + 10;

  // ── SECTION 7: Footer ─────────────────────────────────────────
  const FY = 42;
  page.drawLine({
    start: { x: ML, y: FY + 16 },
    end: { x: PW - MR, y: FY + 16 },
    thickness: 0.5,
    color: C.slate200,
  });
  drawTxt(
    page,
    font,
    safe(`${COMPANY_SETTINGS.website}  |  ${COMPANY_SETTINGS.email}  |  ${COMPANY_SETTINGS.phone}`),
    ML,
    FY,
    8,
    C.slate500,
  );
  if (quote.validityDate) {
    const vText = safe(`Gecerlilik: ${fmtDate(quote.validityDate)}`);
    drawTxt(page, font, vText, PW - MR - 100, FY, 8, C.slate500);
  }

  const bytes = await pdf.save();
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quoteNumber}.pdf"`,
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────

function drawTxt(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(text, { x, y, size, font, color });
}

function safe(value: string): string {
  return Array.from(value).filter((c) => c.charCodeAt(0) > 31).join("");
}

function limitTxt(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function wrapTxt(value: string, maxChars: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fmtDate(value: Date): string {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(value);
}
