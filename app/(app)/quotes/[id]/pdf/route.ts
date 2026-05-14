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
const ML = 40;
const MR = 40;
const CW = PW - ML - MR; // 515 usable width

// ── Colour palette ──────────────────────────────────────────────
const C = {
  charcoal:    rgb(0.067, 0.094, 0.153), // #111827
  orange:      rgb(0.976, 0.451, 0.086), // #F97316
  orangeLight: rgb(1.000, 0.969, 0.929), // #FFF7ED
  slate900:    rgb(0.100, 0.130, 0.200),
  slate700:    rgb(0.220, 0.260, 0.340),
  slate500:    rgb(0.400, 0.440, 0.520),
  slate300:    rgb(0.670, 0.710, 0.780),
  slate200:    rgb(0.840, 0.870, 0.920),
  slate50:     rgb(0.970, 0.970, 0.990),
  white:       rgb(1, 1, 1),
};

// ── Column layout ────────────────────────────────────────────────
// NO | ÜRÜN / AÇIKLAMA (merged) | ADET | BİRİM FİYAT | KDV | TOPLAM
const COLS = [
  { key: "num",   x: ML + 6,   w: 18,  label: "NO" },
  { key: "item",  x: ML + 26,  w: 224, label: "ÜRÜN / AÇIKLAMA" },
  { key: "qty",   x: ML + 252, w: 28,  label: "ADET" },
  { key: "price", x: ML + 282, w: 88,  label: "BİRİM FİYAT" },
  { key: "tax",   x: ML + 372, w: 32,  label: "KDV" },
  { key: "total", x: ML + 406, w: 109, label: "TOPLAM" },
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

  // ── Currency context ──────────────────────────────────────────
  const quoteCurrency = quote.items[0]?.currency ?? "TRY";
  const mode = quote.currencyMode ?? "TRY";
  const rate = quote.exchangeRate != null ? Number(quote.exchangeRate) : null;
  const isBoth = mode === "BOTH";

  function pdfAmt(value: number, currency: string): string {
    const n = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return `${currency.toUpperCase() === "USD" ? "USD" : "TL"} ${n}`;
  }

  // Returns 1 string for TRY/USD mode; 2 strings (stacked) for BOTH mode.
  function pdfLines(value: number, itemCurrency: string): string[] {
    const isUsd = itemCurrency.toUpperCase() === "USD";
    const r = rate && rate > 0 ? rate : null;
    if (mode === "USD") {
      return [pdfAmt(isUsd ? value : r ? value / r : value, "USD")];
    }
    if (mode === "TRY") {
      return [pdfAmt(isUsd && r ? value * r : value, "TRY")];
    }
    // BOTH — two independent lines
    if (isUsd && r) return [pdfAmt(value, "USD"), pdfAmt(value * r, "TRY")];
    if (!isUsd && r) return [pdfAmt(value, itemCurrency), pdfAmt(value / r, "USD")];
    return [pdfAmt(value, itemCurrency)];
  }

  // ── Page state ────────────────────────────────────────────────
  let page = pdf.addPage([PW, PH]);
  let y = PH;

  function ensureSpace(needed: number) {
    if (y - needed < 56) {
      page = pdf.addPage([PW, PH]);
      page.drawRectangle({ x: 0, y: PH - 24, width: PW, height: 24, color: C.charcoal });
      page.drawText(safe(COMPANY_SETTINGS.companyName), {
        x: ML, y: PH - 16, size: 8, font, color: C.white,
      });
      page.drawText(safe(`${quote!.quoteNumber} — devam`), {
        x: PW - ML - 90, y: PH - 16, size: 8, font, color: C.slate300,
      });
      y = PH - 38;
    }
  }

  // ── SECTION 1: Header ─────────────────────────────────────────
  const HEADER_H = 100;
  // Orange accent stripe at very top
  page.drawRectangle({ x: 0, y: PH - 3, width: PW, height: 3, color: C.orange });
  // Dark charcoal header body
  page.drawRectangle({ x: 0, y: PH - HEADER_H, width: PW, height: HEADER_H - 3, color: C.charcoal });

  // Orange vertical brand mark (logo placeholder)
  page.drawRectangle({ x: ML, y: PH - 85, width: 4, height: 60, color: C.orange });

  // Company info — left, offset from brand mark
  drawTxt(page, font, safe(COMPANY_SETTINGS.companyName), ML + 10, PH - 26, 16, C.white);
  drawTxt(page, font, safe(COMPANY_SETTINGS.tagline), ML + 10, PH - 44, 8, C.slate300);
  drawTxt(page, font, safe(COMPANY_SETTINGS.address), ML + 10, PH - 57, 8, C.slate300);
  drawTxt(page, font, safe(COMPANY_SETTINGS.phone), ML + 10, PH - 70, 8, C.slate300);
  drawTxt(page, font, safe(`${COMPANY_SETTINGS.email}  |  ${COMPANY_SETTINGS.website}`), ML + 10, PH - 83, 8, C.slate300);

  // "FİYAT TEKLİFİ" — right
  drawTxt(page, font, "FİYAT TEKLİFİ", PW - ML - 116, PH - 28, 13, C.white);
  drawTxt(page, font, safe(quote.quoteNumber), PW - ML - 116, PH - 46, 9, C.slate300);

  y = PH - HEADER_H - 10;

  // ── SECTION 2: Metadata strip ─────────────────────────────────
  const META_H = 44;
  page.drawRectangle({
    x: ML, y: y - META_H, width: CW, height: META_H,
    color: C.orangeLight, borderColor: C.slate200, borderWidth: 0.5,
  });

  const metaCols = [
    ["TEKLİF NO", safe(quote.quoteNumber)],
    ["TARİH", fmtDate(quote.createdAt)],
    ["GEÇERLİLİK", quote.validityDate ? fmtDate(quote.validityDate) : "Belirtilmedi"],
    ["DURUM", safe(formatQuoteStatus(quote.status))],
  ] as const;
  const metaColW = CW / 4;
  metaCols.forEach(([label, value], i) => {
    const mx = ML + 10 + i * metaColW;
    drawTxt(page, font, label, mx, y - 15, 7, C.slate500);
    drawTxt(page, font, safe(value), mx, y - 29, 9, C.slate900);
  });

  y -= META_H + 12;

  // ── SECTION 3: Customer block ─────────────────────────────────
  const CUST_H = 88;
  page.drawRectangle({
    x: ML, y: y - CUST_H, width: CW, height: CUST_H,
    color: C.white, borderColor: C.slate200, borderWidth: 0.5,
  });
  // "ALICI" section label at top of box
  drawTxt(page, font, "ALICI", ML + 10, y - 14, 7, C.slate500);

  const custRows = [
    ["Firma / Müşteri", safe(limitTxt(quote.customer.company ?? quote.customer.name, 40))],
    ["Yetkili", safe(limitTxt(quote.customer.name, 36))],
    ["Telefon", safe(quote.customer.phone ?? "-")],
    ["E-posta", safe(limitTxt(quote.customer.email ?? "-", 36))],
  ];
  // Start first data row at y-36 to leave clear gap below "ALICI" title
  custRows.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = ML + 10 + col * (CW / 2);
    const cy = y - 36 - row * 26;
    drawTxt(page, font, safe(label), cx, cy + 11, 7, C.slate500);
    drawTxt(page, font, safe(value), cx, cy, 9, C.slate900);
  });

  y -= CUST_H + 12;

  // ── SECTION 4: Items table ────────────────────────────────────
  const TH_H = 24;
  const ROW_H = 54;

  function drawTableHeader() {
    page.drawRectangle({ x: ML, y: y - TH_H, width: CW, height: TH_H, color: C.charcoal });
    COLS.forEach((col) => {
      drawTxt(page, font, col.label, col.x, y - 15, 7, C.white);
    });
    y -= TH_H;
  }

  drawTableHeader();

  quote.items.forEach((item, idx) => {
    ensureSpace(ROW_H + 4);
    if (y === PH - 38) drawTableHeader();

    const shaded = idx % 2 === 1;
    page.drawRectangle({
      x: ML, y: y - ROW_H, width: CW, height: ROW_H,
      color: shaded ? C.slate50 : C.white,
      borderColor: C.slate200, borderWidth: 0.5,
    });

    const unitLines = pdfLines(Number(item.unitPrice), item.currency);
    const totalLines = pdfLines(Number(item.total), item.currency);
    const taxRateDisplay =
      getStoredTaxRateDisplay(
        item.quantity,
        item.unitPrice.toString(),
        item.discount.toString(),
        item.tax.toString(),
      ) ?? `%${Math.round(Number(item.tax))}`;

    // Vertical anchors within the row
    const yCellTop = y - 12; // product name / primary text
    const yCellSku  = y - 23; // sku / hint line
    const yCellD1   = y - 35; // description line 1
    const yCellD2   = y - 46; // description line 2
    const tyR  = isBoth ? y - 14 : y - 26; // right columns primary anchor
    const tyR2 = tyR - 12;                  // right columns secondary (BOTH mode)

    // Row number
    drawTxt(page, font, String(idx + 1), COLS[0].x, yCellTop, 8, C.slate500);

    // Merged item column: product name + SKU + description (2 lines)
    if (item.product) {
      drawTxt(page, font, safe(limitTxt(item.product.name, 40)), COLS[1].x, yCellTop, 9, C.slate900);
      drawTxt(page, font, safe(item.product.sku), COLS[1].x, yCellSku, 7, C.slate500);
      const descLines = wrapTxt(safe(item.description), 50).slice(0, 2);
      if (descLines[0]) drawTxt(page, font, descLines[0], COLS[1].x, yCellD1, 8, C.slate700);
      if (descLines[1]) drawTxt(page, font, descLines[1], COLS[1].x, yCellD2, 8, C.slate700);
    } else {
      // Manual item — description is the primary text
      drawTxt(page, font, safe(limitTxt(item.description, 40)), COLS[1].x, yCellTop, 9, C.slate900);
      drawTxt(page, font, "Manuel kalem", COLS[1].x, yCellSku, 7, C.slate500);
    }

    // Right columns
    drawTxt(page, font, String(item.quantity), COLS[2].x, tyR, 8, C.slate700);
    drawTxt(page, font, safe(unitLines[0] ?? ""), COLS[3].x, tyR, 8, C.slate700);
    if (unitLines[1]) drawTxt(page, font, safe(unitLines[1]), COLS[3].x, tyR2, 7, C.slate500);
    drawTxt(page, font, safe(taxRateDisplay), COLS[4].x, tyR, 8, C.slate700);
    drawTxt(page, font, safe(totalLines[0] ?? ""), COLS[5].x, tyR, 8, C.slate900);
    if (totalLines[1]) drawTxt(page, font, safe(totalLines[1]), COLS[5].x, tyR2, 7, C.slate700);

    y -= ROW_H;
  });

  y -= 10;

  // ── SECTION 5: Totals ─────────────────────────────────────────
  const TX = PW - MR - 200;
  const TOTALS_W = 200;
  const SUB_ROW_H = isBoth ? 32 : 18;
  const GT_H = isBoth ? 52 : 38;
  ensureSpace(8 + 3 * SUB_ROW_H + 8 + GT_H + (rate ? 20 : 8) + 10);

  const subRows: Array<[string, string[]]> = [
    ["Ara Toplam", pdfLines(Number(quote.subtotal), quoteCurrency)],
    ["İndirim",   pdfLines(Number(quote.discountTotal), quoteCurrency)],
    ["KDV",       pdfLines(Number(quote.taxTotal), quoteCurrency)],
  ];

  const rightEdge = TX + TOTALS_W - 8;
  let sy = y - 8;
  subRows.forEach(([label, lines]) => {
    const line0 = safe(lines[0] ?? "");
    const line0W = font.widthOfTextAtSize(line0, 9);
    drawTxt(page, font, safe(label), TX + 6, sy, 9, C.slate500);
    drawTxt(page, font, line0, rightEdge - line0W, sy, 9, C.slate700);
    if (lines[1]) {
      const line1 = safe(lines[1]);
      const line1W = font.widthOfTextAtSize(line1, 8);
      drawTxt(page, font, line1, rightEdge - line1W, sy - 14, 8, C.slate500);
    }
    sy -= SUB_ROW_H;
  });

  y = sy - 8;

  // Grand total — charcoal box, orange label, white amount
  page.drawRectangle({ x: TX, y: y - GT_H, width: TOTALS_W, height: GT_H, color: C.charcoal });
  drawTxt(page, font, "GENEL TOPLAM", TX + 8, y - 13, 7, C.orange);

  const grandLines = pdfLines(Number(quote.total), quoteCurrency);
  const grand0 = safe(grandLines[0] ?? "");
  const grand0W = font.widthOfTextAtSize(grand0, 12);
  drawTxt(page, font, grand0, rightEdge - grand0W, y - 28, 12, C.white);
  if (grandLines[1]) {
    const grand1 = safe(grandLines[1]);
    const grand1W = font.widthOfTextAtSize(grand1, 9);
    drawTxt(page, font, grand1, rightEdge - grand1W, y - 42, 9, C.slate300);
  }

  y -= GT_H + 12;

  if (rate && rate > 0) {
    const rateN = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rate);
    drawTxt(page, font, safe(`Kur: 1 USD = TL ${rateN}`), ML, y, 8, C.slate500);
    y -= 18;
  }

  y -= 8;

  // ── SECTION 6: Commercial terms & notes ──────────────────────
  const noteLines = quote.notes
    ? wrapTxt(safe(`Not: ${quote.notes}`), 90).slice(0, 8)
    : [];
  const payText = quote.paymentTerms ?? COMPANY_SETTINGS.paymentTerms;
  const delText = quote.deliveryTerms ?? COMPANY_SETTINGS.deliveryTerms;
  const warText = quote.warrantyTerms ?? COMPANY_SETTINGS.warrantyTerms;
  const payLines = payText ? wrapTxt(safe(`Ödeme: ${payText}`), 90).slice(0, 4) : [];
  const delLines = delText ? wrapTxt(safe(`Teslimat: ${delText}`), 90).slice(0, 4) : [];
  const warLines = warText ? wrapTxt(safe(`Garanti: ${warText}`), 90).slice(0, 4) : [];

  const allTermLines = [...noteLines, ...payLines, ...delLines, ...warLines];
  const TERM_LINE_H = 14;
  const TERMS_H = 22 + allTermLines.length * TERM_LINE_H + 10;

  ensureSpace(TERMS_H + 16);

  page.drawRectangle({
    x: ML, y: y - TERMS_H, width: CW, height: TERMS_H,
    color: C.slate50, borderColor: C.slate200, borderWidth: 0.5,
  });
  drawTxt(page, font, "TİCARİ KOŞULLAR VE NOTLAR", ML + 10, y - 14, 7, C.slate500);

  let termsY = y - 28;
  for (const line of allTermLines) {
    drawTxt(page, font, line, ML + 10, termsY, 8, C.slate700);
    termsY -= TERM_LINE_H;
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
    const vText = safe(`Geçerlilik: ${fmtDate(quote.validityDate)}`);
    drawTxt(page, font, vText, PW - MR - 110, FY, 8, C.slate500);
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
