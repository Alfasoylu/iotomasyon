import "server-only";

import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";

import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { formatQuoteStatus, getStoredTaxRateDisplay } from "@/lib/quote-utils";

import { makeCurrencyContext, pdfLines } from "../currency";
import { COLORS as C } from "../primitives/colors";
import {
  drawText,
  formatDate,
  sanitize as safe,
  truncate as limitTxt,
  wrapText as wrapTxt,
} from "../primitives/typography";
import type { QuotePdfData } from "../types";

/**
 * Faz 1 — Mevcut PDF layout'unun extract'i
 *
 * Bu dosya, eski route.ts'teki çizim mantığının birebir taşınmış halidir.
 * Görsel çıktı eskisiyle identical olmalı — sadece kod organizasyonu değişti.
 *
 * Faz 2-4'te bu dosyanın yerini şu modüller alacak:
 *  - layout/cover-page.ts
 *  - layout/line-items.ts
 *  - layout/totals-page.ts
 *  - layout/page-chrome.ts
 */

// ── Page constants ──────────────────────────────────────────────
const PW = 595;
const PH = 842;
const ML = 40;
const MR = 40;
const CW = PW - ML - MR; // 515 usable width

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

export interface RenderInput {
  pdf: import("pdf-lib").PDFDocument;
  font: PDFFont;
  logo: PDFImage | null;
  quote: QuotePdfData;
}

export function renderCurrentLayout({ pdf, font, logo, quote }: RenderInput): void {
  // ── Currency context ──────────────────────────────────────────
  const ctx = makeCurrencyContext(quote);
  const quoteCurrency = quote.items[0]?.currency ?? "TRY";
  const isBoth = ctx.mode === "BOTH";

  // ── Page state ────────────────────────────────────────────────
  let page = pdf.addPage([PW, PH]);
  let y = PH;

  function ensureSpace(needed: number): void {
    if (y - needed < 80) {
      page = pdf.addPage([PW, PH]);
      // Orange accent stripe
      page.drawRectangle({ x: 0, y: PH - 3, width: PW, height: 3, color: C.orange });
      // Dark mini header bar
      page.drawRectangle({ x: 0, y: PH - 28, width: PW, height: 25, color: C.charcoal });
      page.drawText(safe(COMPANY_SETTINGS.companyName), {
        x: ML, y: PH - 19, size: 9, font, color: C.white,
      });
      page.drawText(safe(`${quote.quoteNumber} — devam`), {
        x: PW - ML - 100, y: PH - 19, size: 8, font, color: C.orange,
      });
      y = PH - 42;
    }
  }

  // ── SECTION 1: Header ─────────────────────────────────────────
  const HEADER_H = 110;
  page.drawRectangle({ x: 0, y: PH - 3, width: PW, height: 3, color: C.orange });
  page.drawRectangle({ x: 0, y: PH - HEADER_H, width: PW, height: HEADER_H - 3, color: C.charcoal });

  const LOGO_BOX_W = 70;
  const LOGO_BOX_H = 70;
  const LOGO_X = ML;
  const LOGO_Y = PH - HEADER_H + 22;
  if (logo) {
    const ratio = logo.width / logo.height;
    let w = LOGO_BOX_W;
    let h = w / ratio;
    if (h > LOGO_BOX_H) {
      h = LOGO_BOX_H;
      w = h * ratio;
    }
    page.drawImage(logo, {
      x: LOGO_X + (LOGO_BOX_W - w) / 2,
      y: LOGO_Y + (LOGO_BOX_H - h) / 2,
      width: w,
      height: h,
    });
  } else {
    page.drawRectangle({ x: ML, y: PH - 90, width: 4, height: 65, color: C.orange });
  }

  const COMP_X = ML + LOGO_BOX_W + 14;
  drawText(page, font, safe(COMPANY_SETTINGS.companyName), COMP_X, PH - 26, 14, C.white);
  drawText(page, font, safe(COMPANY_SETTINGS.tagline), COMP_X, PH - 42, 7.5, C.slate300);
  drawText(page, font, safe(limitTxt(COMPANY_SETTINGS.address, 90)), COMP_X, PH - 56, 7, C.slate300);
  drawText(page, font, safe(`Tel: ${COMPANY_SETTINGS.phone}  |  ${COMPANY_SETTINGS.phoneSecondary}`), COMP_X, PH - 69, 7, C.slate300);
  drawText(page, font, safe(`${COMPANY_SETTINGS.email}  |  www.${COMPANY_SETTINGS.website}`), COMP_X, PH - 82, 7, C.slate300);
  drawText(page, font, safe(`VD: ${COMPANY_SETTINGS.taxOffice}  |  VN: ${COMPANY_SETTINGS.taxNumber}`), COMP_X, PH - 95, 7, C.slate300);

  drawText(page, font, "FİYAT TEKLİFİ", PW - ML - 116, PH - 28, 13, C.white);
  drawText(page, font, safe(quote.quoteNumber), PW - ML - 116, PH - 46, 9, C.orange);
  drawText(page, font, safe(formatDate(quote.createdAt)), PW - ML - 116, PH - 60, 8, C.slate300);

  y = PH - HEADER_H - 10;

  // ── SECTION 2: Metadata strip ─────────────────────────────────
  const META_H = 44;
  page.drawRectangle({
    x: ML, y: y - META_H, width: CW, height: META_H,
    color: C.orangeLight, borderColor: C.slate200, borderWidth: 0.5,
  });

  const metaCols = [
    ["TEKLİF NO", safe(quote.quoteNumber)],
    ["TARİH", formatDate(quote.createdAt)],
    ["GEÇERLİLİK", quote.validityDate ? formatDate(quote.validityDate) : "Belirtilmedi"],
    ["DURUM", safe(formatQuoteStatus(quote.status as Parameters<typeof formatQuoteStatus>[0]))],
  ] as const;
  const metaColW = CW / 4;
  metaCols.forEach(([label, value], i) => {
    const mx = ML + 10 + i * metaColW;
    drawText(page, font, label, mx, y - 15, 7, C.slate500);
    drawText(page, font, safe(value), mx, y - 29, 9, C.slate900);
  });

  y -= META_H + 12;

  // ── SECTION 3: Customer block ─────────────────────────────────
  const CUST_H = 88;
  page.drawRectangle({
    x: ML, y: y - CUST_H, width: CW, height: CUST_H,
    color: C.white, borderColor: C.slate200, borderWidth: 0.5,
  });
  drawText(page, font, "ALICI", ML + 10, y - 14, 7, C.slate500);

  const custRows = [
    ["Firma / Müşteri", safe(limitTxt(quote.customer.company ?? quote.customer.name, 40))],
    ["Yetkili", safe(limitTxt(quote.customer.name, 36))],
    ["Telefon", safe(quote.customer.phone ?? "-")],
    ["E-posta", safe(limitTxt(quote.customer.email ?? "-", 36))],
  ];
  custRows.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = ML + 10 + col * (CW / 2);
    const cy = y - 36 - row * 26;
    drawText(page, font, safe(label), cx, cy + 11, 7, C.slate500);
    drawText(page, font, safe(value), cx, cy, 9, C.slate900);
  });

  y -= CUST_H + 12;

  // ── SECTION 4: Items table ────────────────────────────────────
  const TH_H = 24;
  const ROW_H = 54;

  function drawTableHeader(): void {
    page.drawRectangle({ x: ML, y: y - TH_H, width: CW, height: TH_H, color: C.charcoal });
    COLS.forEach((col) => {
      drawText(page, font, col.label, col.x, y - 15, 7, C.white);
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

    const unitLines = pdfLines(ctx, Number(item.unitPrice), item.currency);
    const totalLines = pdfLines(ctx, Number(item.total), item.currency);
    const taxRateDisplay =
      getStoredTaxRateDisplay(
        item.quantity,
        item.unitPrice.toString(),
        item.discount.toString(),
        item.tax.toString(),
      ) ?? `%${Math.round(Number(item.tax))}`;

    const yCellTop = y - 12;
    const yCellSku  = y - 23;
    const yCellD1   = y - 35;
    const yCellD2   = y - 46;
    const tyR  = isBoth ? y - 14 : y - 26;
    const tyR2 = tyR - 12;

    drawText(page, font, String(idx + 1), COLS[0].x, yCellTop, 8, C.slate500);

    if (item.product) {
      drawText(page, font, safe(limitTxt(item.product.name, 40)), COLS[1].x, yCellTop, 9, C.slate900);
      drawText(page, font, safe(item.product.sku), COLS[1].x, yCellSku, 7, C.slate500);
      const descLines = wrapTxt(safe(item.description), 50).slice(0, 2);
      if (descLines[0]) drawText(page, font, descLines[0], COLS[1].x, yCellD1, 8, C.slate700);
      if (descLines[1]) drawText(page, font, descLines[1], COLS[1].x, yCellD2, 8, C.slate700);
    } else {
      drawText(page, font, safe(limitTxt(item.description, 40)), COLS[1].x, yCellTop, 9, C.slate900);
      drawText(page, font, "Manuel kalem", COLS[1].x, yCellSku, 7, C.slate500);
    }

    drawText(page, font, String(item.quantity), COLS[2].x, tyR, 8, C.slate700);
    drawText(page, font, safe(unitLines[0] ?? ""), COLS[3].x, tyR, 8, C.slate700);
    if (unitLines[1]) drawText(page, font, safe(unitLines[1]), COLS[3].x, tyR2, 7, C.slate500);
    drawText(page, font, safe(taxRateDisplay), COLS[4].x, tyR, 8, C.slate700);
    drawText(page, font, safe(totalLines[0] ?? ""), COLS[5].x, tyR, 8, C.slate900);
    if (totalLines[1]) drawText(page, font, safe(totalLines[1]), COLS[5].x, tyR2, 7, C.slate700);

    y -= ROW_H;
  });

  y -= 10;

  // ── SECTION 5: Totals ─────────────────────────────────────────
  const TX = PW - MR - 200;
  const TOTALS_W = 200;
  const SUB_ROW_H = isBoth ? 32 : 18;
  const GT_H = isBoth ? 52 : 38;
  ensureSpace(8 + 3 * SUB_ROW_H + 8 + GT_H + (ctx.rate ? 20 : 8) + 10);

  const subRows: Array<[string, string[]]> = [
    ["Ara Toplam", pdfLines(ctx, Number(quote.subtotal), quoteCurrency)],
    ["İndirim",   pdfLines(ctx, Number(quote.discountTotal), quoteCurrency)],
    ["KDV",       pdfLines(ctx, Number(quote.taxTotal), quoteCurrency)],
  ];

  const rightEdge = TX + TOTALS_W - 8;
  let sy = y - 8;
  subRows.forEach(([label, lines]) => {
    const line0 = safe(lines[0] ?? "");
    const line0W = font.widthOfTextAtSize(line0, 9);
    drawText(page, font, safe(label), TX + 6, sy, 9, C.slate500);
    drawText(page, font, line0, rightEdge - line0W, sy, 9, C.slate700);
    if (lines[1]) {
      const line1 = safe(lines[1]);
      const line1W = font.widthOfTextAtSize(line1, 8);
      drawText(page, font, line1, rightEdge - line1W, sy - 14, 8, C.slate500);
    }
    sy -= SUB_ROW_H;
  });

  y = sy - 8;

  // Grand total
  page.drawRectangle({ x: TX, y: y - GT_H, width: TOTALS_W, height: GT_H, color: C.charcoal });
  drawText(page, font, "GENEL TOPLAM", TX + 8, y - 13, 7, C.orange);

  const grandLines = pdfLines(ctx, Number(quote.total), quoteCurrency);
  const grand0 = safe(grandLines[0] ?? "");
  const grand0W = font.widthOfTextAtSize(grand0, 12);
  drawText(page, font, grand0, rightEdge - grand0W, y - 28, 12, C.white);
  if (grandLines[1]) {
    const grand1 = safe(grandLines[1]);
    const grand1W = font.widthOfTextAtSize(grand1, 9);
    drawText(page, font, grand1, rightEdge - grand1W, y - 42, 9, C.slate300);
  }

  y -= GT_H + 12;

  if (ctx.rate && ctx.rate > 0) {
    const rateN = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(ctx.rate);
    drawText(page, font, safe(`Kur: 1 USD = TL ${rateN}`), ML, y, 8, C.slate500);
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
  drawText(page, font, "TİCARİ KOŞULLAR VE NOTLAR", ML + 10, y - 14, 7, C.slate500);

  let termsY = y - 28;
  for (const line of allTermLines) {
    drawText(page, font, line, ML + 10, termsY, 8, C.slate700);
    termsY -= TERM_LINE_H;
  }

  y -= TERMS_H + 10;

  // ── SECTION 6.5: Banka & Ödeme Bilgileri ─────────────────────
  const BANK_H = 56;
  ensureSpace(BANK_H + 8);
  page.drawRectangle({
    x: ML, y: y - BANK_H, width: CW, height: BANK_H,
    color: C.white, borderColor: C.orange, borderWidth: 0.8,
  });
  page.drawRectangle({ x: ML, y: y - BANK_H, width: 3, height: BANK_H, color: C.orange });

  drawText(page, font, "ÖDEME BİLGİLERİ", ML + 10, y - 14, 7, C.orange);
  drawText(page, font, safe(`Banka: ${COMPANY_SETTINGS.bankName}  |  Hesap Türü: ${COMPANY_SETTINGS.bankAccountType}`), ML + 10, y - 28, 8, C.slate700);
  drawText(page, font, safe(`IBAN: ${COMPANY_SETTINGS.bankIban}`), ML + 10, y - 41, 9, C.slate900);
  drawText(page, font, safe(`Hesap Sahibi: ${limitTxt(COMPANY_SETTINGS.bankAccountHolder, 78)}`), ML + 10, y - 52, 7, C.slate500);

  y -= BANK_H + 10;

  // ── SECTION 7: Footer ─────────────────────────────────────────
  const FY = 42;
  page.drawLine({
    start: { x: ML, y: FY + 24 },
    end: { x: PW - MR, y: FY + 24 },
    thickness: 0.5,
    color: C.slate200,
  });
  drawText(
    page,
    font,
    safe(limitTxt(COMPANY_SETTINGS.legalName, 100)),
    ML, FY + 10, 7, C.slate700,
  );
  drawText(
    page,
    font,
    safe(`${COMPANY_SETTINGS.phone}  |  ${COMPANY_SETTINGS.email}  |  www.${COMPANY_SETTINGS.website}`),
    ML, FY - 2, 7, C.slate500,
  );
  if (quote.validityDate) {
    const vText = safe(`Geçerlilik: ${formatDate(quote.validityDate)}`);
    drawText(page, font, vText, PW - MR - 110, FY - 2, 7, C.slate500);
  }
}
