import "server-only";

import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";

import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { getStoredTaxRateDisplay } from "@/lib/quote-utils";

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
 * Faz 3 — Content pages (sayfa 2+)
 *
 * Cover (sayfa 1) artık ayrı (cover-page.ts). Bu modül kalan tüm içeriği
 * çizer: items table, totals, terms, bank info, footer.
 *
 * Her sayfada sticky chrome:
 *   [Üst] thin accent yellow line + ink mini header bar (brand + quote # + page hint)
 *   [Alt] footer (legal name + page hint)
 */

const PW = 595;
const PH = 842;
const ML = 40;
const MR = 40;
const CW = PW - ML - MR;

// Content area: between chrome top (Y=PH-40) and chrome bottom (Y=70)
const CONTENT_TOP = PH - 40;
const CONTENT_BOTTOM = 70;

const COLS = [
  { key: "num",   x: ML + 6,   w: 18,  label: "NO" },
  { key: "item",  x: ML + 26,  w: 224, label: "ÜRÜN / AÇIKLAMA" },
  { key: "qty",   x: ML + 252, w: 28,  label: "ADET" },
  { key: "price", x: ML + 282, w: 88,  label: "BİRİM FİYAT" },
  { key: "tax",   x: ML + 372, w: 32,  label: "KDV" },
  { key: "total", x: ML + 406, w: 109, label: "TOPLAM" },
] as const;

export interface ContentInput {
  pdf: PDFDocument;
  fonts: QuotePdfFonts;
  logo: PDFImage | null; // şimdilik kullanılmıyor, gelecekte chrome'da kullanılabilir
  quote: QuotePdfData;
}

export function renderContentPages({ pdf, fonts: f, quote }: ContentInput): void {
  const ctx = makeCurrencyContext(quote);
  const quoteCurrency = quote.items[0]?.currency ?? "TRY";
  const isBoth = ctx.mode === "BOTH";

  let page = pdf.addPage([PW, PH]);
  drawPageChrome(page, f, quote);
  let y = CONTENT_TOP;

  function newContentPage(): void {
    page = pdf.addPage([PW, PH]);
    drawPageChrome(page, f, quote);
    y = CONTENT_TOP;
  }

  function ensureSpace(needed: number): void {
    if (y - needed < CONTENT_BOTTOM) {
      newContentPage();
    }
  }

  // ── ITEMS TABLE ──────────────────────────────────────────────
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
    if (y === CONTENT_TOP) drawTableHeader(); // sayfa kırılması sonrası

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
    const yCellSku = y - 23;
    const yCellD1 = y - 35;
    const yCellD2 = y - 46;
    const tyR = isBoth ? y - 14 : y - 26;
    const tyR2 = tyR - 12;

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

    // Right-aligned mono numerics
    const qtyStr = String(item.quantity);
    const qtyW = measureWidth(f, qtyStr, TYPE.monoBody);
    drawStyled(page, f, qtyStr, COLS[2].x + 18 - qtyW, tyR, TYPE.monoBody, C.textBody);

    const unitW0 = measureWidth(f, safe(unitLines[0] ?? ""), TYPE.monoBody);
    drawStyled(page, f, safe(unitLines[0] ?? ""), COLS[3].x + 80 - unitW0, tyR, TYPE.monoBody, C.textBody);
    if (unitLines[1]) {
      const unitW1 = measureWidth(f, safe(unitLines[1]), TYPE.tinyCaption);
      drawStyled(page, f, safe(unitLines[1]), COLS[3].x + 80 - unitW1, tyR2, TYPE.tinyCaption, C.textMuted);
    }

    drawText(page, f.sansRegular, safe(taxRateDisplay), COLS[4].x, tyR, 8, C.textBody);

    const totalW0 = measureWidth(f, safe(totalLines[0] ?? ""), TYPE.monoMoney);
    drawStyled(page, f, safe(totalLines[0] ?? ""), COLS[5].x + 100 - totalW0, tyR, TYPE.monoMoney, C.textPrimary);
    if (totalLines[1]) {
      const totalW1 = measureWidth(f, safe(totalLines[1]), TYPE.tinyCaption);
      drawStyled(page, f, safe(totalLines[1]), COLS[5].x + 100 - totalW1, tyR2, TYPE.tinyCaption, C.textMuted);
    }

    y -= ROW_H;
  });

  y -= 10;

  // ── TOTALS ───────────────────────────────────────────────────
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

  // Grand total — Faz 4 DRAMATIC: ink box + sol accent yellow şerit + büyük mono
  // Tek boyut: BOTH mode'da 56px, tek currency mode'da 44px
  const GT_FAZ4_H = isBoth ? 56 : 44;
  // Ink box
  page.drawRectangle({ x: TX, y: y - GT_FAZ4_H, width: TOTALS_W, height: GT_FAZ4_H, color: C.ink });
  // Sol accent yellow şerit (4px)
  page.drawRectangle({ x: TX, y: y - GT_FAZ4_H, width: 4, height: GT_FAZ4_H, color: C.accent });

  // Label sol üst — uppercase tracking widest accent rengi
  drawStyled(page, f, "GENEL TOPLAM", TX + 14, y - 14, TYPE.sectionLabel, C.accent);

  const grandLines = pdfLines(ctx, Number(quote.total), quoteCurrency);
  const grand0 = safe(grandLines[0] ?? "");
  // Faz 4: 22px mono semibold — eski 14px → 22px (dramatic ama BOTH mode'da iki satır sığsın)
  const grandToken = isBoth
    ? { ...TYPE.monoMoney, size: 18 }
    : { ...TYPE.monoMoney, size: 22 };
  const grand0W = measureWidth(f, grand0, grandToken);
  drawStyled(page, f, grand0, rightEdge - grand0W, y - (isBoth ? 30 : 34), grandToken, C.textOnDark);
  if (grandLines[1]) {
    const grand1 = safe(grandLines[1]);
    const grand1Token = { ...TYPE.monoMoney, size: 13 };
    const grand1W = measureWidth(f, grand1, grand1Token);
    drawStyled(page, f, grand1, rightEdge - grand1W, y - 48, grand1Token, C.captionOnDark);
  }

  y -= GT_FAZ4_H + 12;

  if (ctx.rate && ctx.rate > 0) {
    const rateN = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(ctx.rate);
    drawStyled(page, f, safe(`Kur: 1 USD = TL ${rateN}`), ML, y, TYPE.monoBody, C.textMuted);
    y -= 18;
  }

  y -= 8;

  // ── COMMERCIAL TERMS ─────────────────────────────────────────
  // Cover'da ön söz olarak gösterildiyse notes tekrar gösterilmez — sadece
  // sözleşme şartları yer alır.
  const payText = quote.paymentTerms ?? COMPANY_SETTINGS.paymentTerms;
  const delText = quote.deliveryTerms ?? COMPANY_SETTINGS.deliveryTerms;
  const warText = quote.warrantyTerms ?? COMPANY_SETTINGS.warrantyTerms;
  const payLines = payText ? wrapTxt(safe(`Ödeme: ${payText}`), 90).slice(0, 4) : [];
  const delLines = delText ? wrapTxt(safe(`Teslimat: ${delText}`), 90).slice(0, 4) : [];
  const warLines = warText ? wrapTxt(safe(`Garanti: ${warText}`), 90).slice(0, 4) : [];

  const allTermLines = [...payLines, ...delLines, ...warLines];
  const TERM_LINE_H = 14;
  const TERMS_H = 22 + allTermLines.length * TERM_LINE_H + 10;

  ensureSpace(TERMS_H + 16);

  page.drawRectangle({
    x: ML, y: y - TERMS_H, width: CW, height: TERMS_H,
    color: C.surface1, borderColor: C.borderSubtle, borderWidth: 0.5,
  });
  drawStyled(page, f, "TİCARİ KOŞULLAR", ML + 10, y - 14, TYPE.sectionLabel, C.textMuted);

  let termsY = y - 28;
  for (const line of allTermLines) {
    drawText(page, f.sansRegular, line, ML + 10, termsY, 8, C.textBody);
    termsY -= TERM_LINE_H;
  }

  y -= TERMS_H + 10;

  // ── BANK INFO ────────────────────────────────────────────────
  const BANK_H = 56;
  ensureSpace(BANK_H + 8);
  page.drawRectangle({
    x: ML, y: y - BANK_H, width: CW, height: BANK_H,
    color: C.paper, borderColor: C.borderDefault, borderWidth: 0.5,
  });
  page.drawRectangle({ x: ML, y: y - BANK_H, width: 3, height: BANK_H, color: C.ink });

  drawStyled(page, f, "ÖDEME BİLGİLERİ", ML + 10, y - 14, TYPE.sectionLabel, C.textMuted);
  drawText(page, f.sansRegular, safe(`Banka: ${COMPANY_SETTINGS.bankName}  |  Hesap Türü: ${COMPANY_SETTINGS.bankAccountType}`), ML + 10, y - 28, 8, C.textBody);
  drawStyled(page, f, safe(`IBAN: ${COMPANY_SETTINGS.bankIban}`), ML + 10, y - 42, TYPE.quoteNumberLarge, C.textPrimary);
  drawText(page, f.sansRegular, safe(`Hesap Sahibi: ${limitTxt(COMPANY_SETTINGS.bankAccountHolder, 78)}`), ML + 10, y - 52, 7, C.textMuted);

  y -= BANK_H + 24;

  // ── ACCEPTANCE SECTION (Faz 4) ───────────────────────────────
  // Müşterinin imza/onay alanı + dijital onay link
  const ACCEPTANCE_H = 88;
  ensureSpace(ACCEPTANCE_H + 8);

  // Header
  drawStyled(page, f, "KABUL", ML, y - 8, TYPE.sectionLabel, C.textMuted);
  drawStyled(
    page, f,
    "Bu teklifi koşullarıyla birlikte kabul ediyorum.",
    ML, y - 26, TYPE.bodyEmphasis, C.textPrimary,
  );

  // İmza + tarih satırı
  const SIG_Y = y - 60;
  const SIG_LABEL_Y = SIG_Y - 12;

  // "Müşteri imzası: ________________________" — line via drawLine
  drawText(page, f.sansRegular, "Müşteri imzası:", ML, SIG_Y, 9, C.textSecondary);
  page.drawLine({
    start: { x: ML + 80, y: SIG_Y - 2 },
    end: { x: ML + 280, y: SIG_Y - 2 },
    thickness: 0.5,
    color: C.borderStrong,
  });

  drawText(page, f.sansRegular, "Tarih:", ML + 310, SIG_Y, 9, C.textSecondary);
  page.drawLine({
    start: { x: ML + 340, y: SIG_Y - 2 },
    end: { x: ML + 440, y: SIG_Y - 2 },
    thickness: 0.5,
    color: C.borderStrong,
  });
  // Date format hint — satırın altında, çakışmasın
  drawStyled(page, f, "GG / AA / YYYY", ML + 360, SIG_LABEL_Y, TYPE.tinyCaption, C.textMuted);

  // Online onay linki — kendi satırında, biraz daha alt
  const onlineUrl = `iotomasyon.com/q/${quote.quoteNumber}/accept`;
  drawStyled(
    page, f,
    safe(`Çevrimiçi onay: ${onlineUrl}`),
    ML, y - ACCEPTANCE_H + 4, TYPE.monoBody, C.textMuted,
  );
}

/**
 * Her content sayfasında çizilen sticky chrome — üst başlık + alt footer.
 * Cover (sayfa 1) bunu kullanmaz; cover'ın kendi tasarımı vardır.
 */
function drawPageChrome(page: PDFPage, f: QuotePdfFonts, quote: QuotePdfData): void {
  // Üst ince accent yellow line
  page.drawRectangle({ x: 0, y: PH - 2, width: PW, height: 2, color: C.accent });
  // Dark mini header bar
  page.drawRectangle({ x: 0, y: PH - 28, width: PW, height: 25, color: C.ink });
  drawStyled(
    page, f,
    safe(COMPANY_SETTINGS.companyName),
    ML, PH - 19, TYPE.chromeBrand, C.textOnDark,
  );
  // Quote # right-aligned in chrome
  const qNumberText = safe(quote.quoteNumber);
  const qNumberW = measureWidth(f, qNumberText, TYPE.chromeMeta);
  drawStyled(
    page, f,
    qNumberText,
    PW - MR - qNumberW, PH - 19, TYPE.chromeMeta, C.captionOnDark,
  );

  // Footer line + legal name
  const FY = 38;
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
