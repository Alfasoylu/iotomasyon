import "server-only";

import type { PDFDocument, PDFImage } from "pdf-lib";

import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { formatQuoteStatus, getStoredTaxRateDisplay } from "@/lib/quote-utils";

import type { QuotePdfFonts } from "../document";
import { makeCurrencyContext, pdfLines } from "../currency";
import { COLORS as C } from "../primitives/colors";
import {
  TYPE,
  drawStyled,
  drawText,
  formatDate,
  measureWidth,
  sanitize as safe,
  truncate as limitTxt,
  wrapText as wrapTxt,
} from "../primitives/typography";
import type { QuotePdfData } from "../types";

/**
 * Faz 2 — Tipografi + renk yenilenmiş layout (yapı/yerleşim aynı)
 *
 * Değişen: Geist Sans + Geist Mono, TYPE token sistemi, neutral palet.
 * Aynı kalan: section sıralaması, boyutlar, page break davranışı.
 *
 * Numerikler (tutarlar, IBAN, miktarlar) artık mono. Section başlıkları
 * uppercase tracking-widest. Eski orange → ink (siyah), restraint amaçlı
 * accent yellow bu fazda KULLANILMIYOR (Faz 3'te cover'da, Faz 4'te totals).
 */

// ── Page constants ──────────────────────────────────────────────
const PW = 595;
const PH = 842;
const ML = 40;
const MR = 40;
const CW = PW - ML - MR;

// ── Column layout — aynı ─────────────────────────────────────────
const COLS = [
  { key: "num",   x: ML + 6,   w: 18,  label: "NO" },
  { key: "item",  x: ML + 26,  w: 224, label: "ÜRÜN / AÇIKLAMA" },
  { key: "qty",   x: ML + 252, w: 28,  label: "ADET" },
  { key: "price", x: ML + 282, w: 88,  label: "BİRİM FİYAT" },
  { key: "tax",   x: ML + 372, w: 32,  label: "KDV" },
  { key: "total", x: ML + 406, w: 109, label: "TOPLAM" },
] as const;

export interface RenderInput {
  pdf: PDFDocument;
  fonts: QuotePdfFonts;
  logo: PDFImage | null;
  quote: QuotePdfData;
}

export function renderCurrentLayout({ pdf, fonts, logo, quote }: RenderInput): void {
  const f = fonts; // shorthand

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
      // Faz 2: üst aksan çubuk → ince ink çubuk (sarı yok henüz)
      page.drawRectangle({ x: 0, y: PH - 2, width: PW, height: 2, color: C.ink });
      // Dark mini header bar
      page.drawRectangle({ x: 0, y: PH - 28, width: PW, height: 25, color: C.ink });
      drawStyled(page, f, safe(COMPANY_SETTINGS.companyName), ML, PH - 19, TYPE.chromeBrand, C.textOnDark);
      drawStyled(page, f, safe(`${quote.quoteNumber} — devam`), PW - ML - 100, PH - 19, TYPE.chromeMeta, C.captionOnDark);
      y = PH - 42;
    }
  }

  // ── SECTION 1: Header ─────────────────────────────────────────
  const HEADER_H = 110;
  page.drawRectangle({ x: 0, y: PH - 2, width: PW, height: 2, color: C.ink });
  page.drawRectangle({ x: 0, y: PH - HEADER_H, width: PW, height: HEADER_H - 2, color: C.ink });

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
    page.drawRectangle({ x: ML, y: PH - 90, width: 4, height: 65, color: C.accent });
  }

  const COMP_X = ML + LOGO_BOX_W + 14;
  drawStyled(page, f, safe(COMPANY_SETTINGS.companyName), COMP_X, PH - 26, TYPE.sectionTitle, C.textOnDark);
  drawText(page, f.sansRegular, safe(COMPANY_SETTINGS.tagline), COMP_X, PH - 42, 7.5, C.captionOnDark);
  drawText(page, f.sansRegular, safe(limitTxt(COMPANY_SETTINGS.address, 90)), COMP_X, PH - 56, 7, C.captionOnDark);
  drawText(page, f.sansRegular, safe(`Tel: ${COMPANY_SETTINGS.phone}  |  ${COMPANY_SETTINGS.phoneSecondary}`), COMP_X, PH - 69, 7, C.captionOnDark);
  drawText(page, f.sansRegular, safe(`${COMPANY_SETTINGS.email}  |  www.${COMPANY_SETTINGS.website}`), COMP_X, PH - 82, 7, C.captionOnDark);
  drawText(page, f.sansRegular, safe(`VD: ${COMPANY_SETTINGS.taxOffice}  |  VN: ${COMPANY_SETTINGS.taxNumber}`), COMP_X, PH - 95, 7, C.captionOnDark);

  // Sağ üst — "FİYAT TEKLİFİ" + numara
  drawStyled(page, f, "FİYAT TEKLİFİ", PW - ML - 116, PH - 28, TYPE.sectionTitle, C.textOnDark);
  drawStyled(page, f, safe(quote.quoteNumber), PW - ML - 116, PH - 48, TYPE.quoteNumberLarge, C.textOnDark);
  drawStyled(page, f, safe(formatDate(quote.createdAt)), PW - ML - 116, PH - 64, TYPE.monoBody, C.captionOnDark);

  y = PH - HEADER_H - 10;

  // ── SECTION 2: Metadata strip ─────────────────────────────────
  const META_H = 44;
  page.drawRectangle({
    x: ML, y: y - META_H, width: CW, height: META_H,
    color: C.surface1, borderColor: C.borderSubtle, borderWidth: 0.5,
  });

  const metaCols = [
    ["TEKLİF NO", safe(quote.quoteNumber), true],   // mono
    ["TARİH", formatDate(quote.createdAt), true],
    ["GEÇERLİLİK", quote.validityDate ? formatDate(quote.validityDate) : "Belirtilmedi", true],
    ["DURUM", safe(formatQuoteStatus(quote.status as Parameters<typeof formatQuoteStatus>[0])), false],
  ] as const;
  const metaColW = CW / 4;
  metaCols.forEach(([label, value, mono], i) => {
    const mx = ML + 10 + i * metaColW;
    drawStyled(page, f, label, mx, y - 15, TYPE.sectionLabel, C.textMuted);
    drawStyled(page, f, safe(value), mx, y - 31, mono ? TYPE.monoMoney : TYPE.bodyEmphasis, C.textPrimary);
  });

  y -= META_H + 12;

  // ── SECTION 3: Customer block ─────────────────────────────────
  const CUST_H = 88;
  page.drawRectangle({
    x: ML, y: y - CUST_H, width: CW, height: CUST_H,
    color: C.paper, borderColor: C.borderSubtle, borderWidth: 0.5,
  });
  drawStyled(page, f, "ALICI", ML + 10, y - 14, TYPE.sectionLabel, C.textMuted);

  const custRows: Array<readonly [string, string, boolean]> = [
    ["Firma / Müşteri", safe(limitTxt(quote.customer.company ?? quote.customer.name, 40)), false],
    ["Yetkili", safe(limitTxt(quote.customer.name, 36)), false],
    ["Telefon", safe(quote.customer.phone ?? "-"), true],   // mono
    ["E-posta", safe(limitTxt(quote.customer.email ?? "-", 36)), false],
  ];
  custRows.forEach(([label, value, mono], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = ML + 10 + col * (CW / 2);
    const cy = y - 36 - row * 26;
    drawText(page, f.sansRegular, safe(label), cx, cy + 11, 7, C.textMuted);
    drawStyled(page, f, value, cx, cy, mono ? TYPE.monoMoney : TYPE.bodyEmphasis, C.textPrimary);
  });

  y -= CUST_H + 12;

  // ── SECTION 4: Items table ────────────────────────────────────
  const TH_H = 24;
  const ROW_H = 54;

  function drawTableHeader(): void {
    page.drawRectangle({ x: ML, y: y - TH_H, width: CW, height: TH_H, color: C.ink });
    COLS.forEach((col) => {
      drawStyled(page, f, col.label, col.x, y - 15, TYPE.tableHeader, C.textOnDark);
    });
    y -= TH_H;
  }

  drawTableHeader();

  quote.items.forEach((item, idx) => {
    ensureSpace(ROW_H + 4);
    if (y === PH - 38) drawTableHeader();

    // Faz 2: zebra striping ince — sadece subtle border, hover'lı gibi
    page.drawRectangle({
      x: ML, y: y - ROW_H, width: CW, height: ROW_H,
      color: C.paper,
      borderColor: C.borderSubtle, borderWidth: 0.5,
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

    // Row number (mono)
    drawStyled(page, f, String(idx + 1), COLS[0].x, yCellTop, TYPE.monoBody, C.textMuted);

    if (item.product) {
      drawStyled(page, f, safe(limitTxt(item.product.name, 40)), COLS[1].x, yCellTop, TYPE.bodyEmphasis, C.textPrimary);
      drawStyled(page, f, safe(item.product.sku), COLS[1].x, yCellSku, TYPE.monoBody, C.textMuted);
      const descLines = wrapTxt(safe(item.description), 50).slice(0, 2);
      if (descLines[0]) drawText(page, f.sansRegular, descLines[0], COLS[1].x, yCellD1, 8, C.textBody);
      if (descLines[1]) drawText(page, f.sansRegular, descLines[1], COLS[1].x, yCellD2, 8, C.textBody);
    } else {
      drawStyled(page, f, safe(limitTxt(item.description, 40)), COLS[1].x, yCellTop, TYPE.bodyEmphasis, C.textPrimary);
      drawText(page, f.sansRegular, "Manuel kalem", COLS[1].x, yCellSku, 7, C.textMuted);
    }

    // Numeric kolonlar — mono + sağa hizalı için measure
    const qtyToken = TYPE.monoBody;
    const qtyStr = String(item.quantity);
    const qtyW = measureWidth(f, qtyStr, qtyToken);
    drawStyled(page, f, qtyStr, COLS[2].x + 18 - qtyW, tyR, qtyToken, C.textBody);

    const unitMonoToken = TYPE.monoBody;
    const unitW0 = measureWidth(f, safe(unitLines[0] ?? ""), unitMonoToken);
    drawStyled(page, f, safe(unitLines[0] ?? ""), COLS[3].x + 80 - unitW0, tyR, unitMonoToken, C.textBody);
    if (unitLines[1]) {
      const unitW1 = measureWidth(f, safe(unitLines[1]), TYPE.tinyCaption);
      drawStyled(page, f, safe(unitLines[1]), COLS[3].x + 80 - unitW1, tyR2, TYPE.tinyCaption, C.textMuted);
    }

    // KDV oranı — küçük, mono değil (oran metin gibi okunur)
    drawText(page, f.sansRegular, safe(taxRateDisplay), COLS[4].x, tyR, 8, C.textBody);

    // Toplam — biraz daha güçlü
    const totalToken = TYPE.monoMoney;
    const totalW0 = measureWidth(f, safe(totalLines[0] ?? ""), totalToken);
    drawStyled(page, f, safe(totalLines[0] ?? ""), COLS[5].x + 100 - totalW0, tyR, totalToken, C.textPrimary);
    if (totalLines[1]) {
      const totalW1 = measureWidth(f, safe(totalLines[1]), TYPE.tinyCaption);
      drawStyled(page, f, safe(totalLines[1]), COLS[5].x + 100 - totalW1, tyR2, TYPE.tinyCaption, C.textMuted);
    }

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
    const line0W = measureWidth(f, line0, TYPE.monoMoney);
    drawStyled(page, f, safe(label), TX + 6, sy, TYPE.body, C.textMuted);
    drawStyled(page, f, line0, rightEdge - line0W, sy, TYPE.monoMoney, C.textBody);
    if (lines[1]) {
      const line1 = safe(lines[1]);
      const line1W = measureWidth(f, line1, TYPE.monoBody);
      drawStyled(page, f, line1, rightEdge - line1W, sy - 14, TYPE.monoBody, C.textMuted);
    }
    sy -= SUB_ROW_H;
  });

  y = sy - 8;

  // Grand total — ink box (Faz 4'te sol accent şerit eklenecek)
  page.drawRectangle({ x: TX, y: y - GT_H, width: TOTALS_W, height: GT_H, color: C.ink });
  drawStyled(page, f, "GENEL TOPLAM", TX + 8, y - 13, TYPE.sectionLabel, C.captionOnDark);

  const grandLines = pdfLines(ctx, Number(quote.total), quoteCurrency);
  const grand0 = safe(grandLines[0] ?? "");
  // Faz 2: grand total mono medium 14px (Faz 4'te 28px'e büyüyecek)
  const grandToken = { ...TYPE.monoMoney, size: 14 };
  const grand0W = measureWidth(f, grand0, grandToken);
  drawStyled(page, f, grand0, rightEdge - grand0W, y - 28, grandToken, C.textOnDark);
  if (grandLines[1]) {
    const grand1 = safe(grandLines[1]);
    const grand1W = measureWidth(f, grand1, TYPE.monoBody);
    drawStyled(page, f, grand1, rightEdge - grand1W, y - 42, TYPE.monoBody, C.captionOnDark);
  }

  y -= GT_H + 12;

  if (ctx.rate && ctx.rate > 0) {
    const rateN = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(ctx.rate);
    drawStyled(page, f, safe(`Kur: 1 USD = TL ${rateN}`), ML, y, TYPE.monoBody, C.textMuted);
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
    color: C.surface1, borderColor: C.borderSubtle, borderWidth: 0.5,
  });
  drawStyled(page, f, "TİCARİ KOŞULLAR VE NOTLAR", ML + 10, y - 14, TYPE.sectionLabel, C.textMuted);

  let termsY = y - 28;
  for (const line of allTermLines) {
    drawText(page, f.sansRegular, line, ML + 10, termsY, 8, C.textBody);
    termsY -= TERM_LINE_H;
  }

  y -= TERMS_H + 10;

  // ── SECTION 6.5: Banka & Ödeme Bilgileri ─────────────────────
  const BANK_H = 56;
  ensureSpace(BANK_H + 8);
  page.drawRectangle({
    x: ML, y: y - BANK_H, width: CW, height: BANK_H,
    color: C.paper, borderColor: C.borderDefault, borderWidth: 0.5,
  });
  // Faz 2: sol accent şerit ink (Faz 4'te yellow accent olacak)
  page.drawRectangle({ x: ML, y: y - BANK_H, width: 3, height: BANK_H, color: C.ink });

  drawStyled(page, f, "ÖDEME BİLGİLERİ", ML + 10, y - 14, TYPE.sectionLabel, C.textMuted);
  drawText(page, f.sansRegular, safe(`Banka: ${COMPANY_SETTINGS.bankName}  |  Hesap Türü: ${COMPANY_SETTINGS.bankAccountType}`), ML + 10, y - 28, 8, C.textBody);
  // IBAN mono — 14px medium, kopyalanabilir görünür
  drawStyled(page, f, safe(`IBAN: ${COMPANY_SETTINGS.bankIban}`), ML + 10, y - 42, TYPE.quoteNumberLarge, C.textPrimary);
  drawText(page, f.sansRegular, safe(`Hesap Sahibi: ${limitTxt(COMPANY_SETTINGS.bankAccountHolder, 78)}`), ML + 10, y - 52, 7, C.textMuted);

  y -= BANK_H + 10;

  // ── SECTION 7: Footer ─────────────────────────────────────────
  const FY = 42;
  page.drawLine({
    start: { x: ML, y: FY + 24 },
    end: { x: PW - MR, y: FY + 24 },
    thickness: 0.5,
    color: C.borderSubtle,
  });
  drawText(
    page, f.sansRegular,
    safe(limitTxt(COMPANY_SETTINGS.legalName, 100)),
    ML, FY + 10, 7, C.textBody,
  );
  drawText(
    page, f.sansRegular,
    safe(`${COMPANY_SETTINGS.phone}  |  ${COMPANY_SETTINGS.email}  |  www.${COMPANY_SETTINGS.website}`),
    ML, FY - 2, 7, C.textMuted,
  );
  if (quote.validityDate) {
    drawStyled(page, f, safe(`Geçerlilik: ${formatDate(quote.validityDate)}`), PW - MR - 110, FY - 2, TYPE.monoBody, C.textMuted);
  }
}
