import "server-only";

import type { PDFDocument, PDFImage } from "pdf-lib";

import { COMPANY_SETTINGS } from "@/lib/company-settings";

import type { QuotePdfFonts } from "../document";
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
import { embedQrCode, quotePublicUrl } from "../primitives/qr-code";
import type { QuotePdfData } from "../types";

/**
 * Faz 3 — Yeni cover sayfası
 *
 * Stripe / Linear / Vercel receipt kalitesinde, endüstriyel-minimal.
 *
 * Yapı:
 *   [Üst sağ 3 aksent çubuk] — accent yellow, restraint ile (Soylu kimliği)
 *   [Sol] Logo 56-70px + ALFA SOYLU wordmark + tagline
 *   ────── ince accent şerit (4px) ──────
 *   [Sol] "Mart 2026" eyebrow + "Fiyat Teklifi" 32px H1 + quote # 14px mono
 *   [Müşteri kartı] — beyaz card, accent yellow şerit üstte
 *   [Cover note opsiyonel] — ön söz kartı
 *   ──────── ayraç ─────────
 *   [Sol] QR kod 80px + dijital sürüm URL
 *   [Sağ] KAPSAM (kalem sayısı + toplam) + GEÇERLİLİK
 *   ──── alt iletişim şeridi ────
 */

const PW = 595;
const PH = 842;
const ML = 40;
const MR = 40;
const CW = PW - ML - MR;

export interface CoverInput {
  pdf: PDFDocument;
  fonts: QuotePdfFonts;
  logo: PDFImage | null;
  quote: QuotePdfData;
}

export async function renderCoverPage({
  pdf,
  fonts: f,
  logo,
  quote,
}: CoverInput): Promise<void> {
  const page = pdf.addPage([PW, PH]);

  // ── 1) Üst sağ 3 aksent çubuk — Soylu kimliği (restraint) ─────────
  // Cover'da ilk kez accent yellow görünür. Faz 4'te totals'ta da olacak.
  page.drawRectangle({ x: PW - 110, y: PH - 4, width: 110, height: 4, color: C.accent });
  page.drawRectangle({ x: PW - 60,  y: PH - 12, width: 60,  height: 4, color: C.accent });
  page.drawRectangle({ x: PW - 30,  y: PH - 20, width: 30,  height: 4, color: C.accent });

  // ── 2) Sol üst — Logo + Brand mark ─────────────────────────────────
  let logoY = PH - 80;
  const LOGO_TARGET_W = 56;
  if (logo) {
    const ratio = logo.width / logo.height;
    const w = LOGO_TARGET_W;
    const h = w / ratio;
    page.drawImage(logo, { x: ML, y: PH - 40 - h, width: w, height: h });
    logoY = PH - 40 - h;
  }
  const wordmarkY = PH - 56;
  drawStyled(
    page, f,
    safe(COMPANY_SETTINGS.companyName),
    ML + (logo ? LOGO_TARGET_W + 14 : 0),
    wordmarkY, TYPE.brandWordmark, C.textPrimary,
  );
  drawStyled(
    page, f,
    safe(COMPANY_SETTINGS.tagline),
    ML + (logo ? LOGO_TARGET_W + 14 : 0),
    wordmarkY - 14, TYPE.caption, C.textSecondary,
  );

  // Use logoY to position the divider below the logo, regardless of which side is taller
  const dividerY = Math.min(logoY - 16, wordmarkY - 32);

  // Heavy accent strip (4px wide × 64px) — divider between brand and title
  page.drawRectangle({ x: ML, y: dividerY, width: 64, height: 4, color: C.accent });

  // ── 3) Eyebrow + Document title + Quote number ────────────────────
  const eyebrowText = new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "long",
  }).format(quote.createdAt).toLocaleUpperCase("tr-TR");
  drawStyled(page, f, safe(eyebrowText), ML, dividerY - 22, TYPE.sectionLabel, C.textMuted);

  // H1 — "Fiyat Teklifi" 32px semibold
  const titleY = dividerY - 56;
  drawStyled(page, f, "Fiyat Teklifi", ML, titleY, TYPE.documentTitle, C.textPrimary);

  // Quote number — mono medium 14px, slightly under the title
  drawStyled(page, f, safe(quote.quoteNumber), ML, titleY - 24, TYPE.quoteNumberLarge, C.textBody);

  // ── 4) Müşteri kartı ──────────────────────────────────────────────
  const CARD_Y = titleY - 50;
  const CARD_H = 92;
  // Top accent strip on customer card
  page.drawRectangle({
    x: ML, y: CARD_Y - 3, width: CW, height: 3, color: C.accent,
  });
  page.drawRectangle({
    x: ML, y: CARD_Y - 3 - CARD_H, width: CW, height: CARD_H,
    color: C.paper, borderColor: C.borderDefault, borderWidth: 0.5,
  });

  drawStyled(page, f, "HAZIRLANAN MÜŞTERİ", ML + 16, CARD_Y - 22, TYPE.sectionLabel, C.textMuted);

  // Customer name — 22px semibold
  const customerLabel = safe(limitTxt(quote.customer.company ?? quote.customer.name, 50));
  drawStyled(page, f, customerLabel, ML + 16, CARD_Y - 48, TYPE.customerName, C.textPrimary);

  // Meta line: Yetkili · şehir/adres · telefon
  const metaParts: string[] = [];
  if (quote.customer.company && quote.customer.name !== quote.customer.company) {
    metaParts.push(`Yetkili: ${quote.customer.name}`);
  }
  if (quote.customer.phone) metaParts.push(quote.customer.phone);
  if (quote.customer.email) metaParts.push(quote.customer.email);
  if (metaParts.length > 0) {
    drawText(
      page, f.sansRegular,
      safe(metaParts.join("  ·  ")),
      ML + 16, CARD_Y - 72, 9, C.textSecondary,
    );
  }

  let nextY = CARD_Y - CARD_H - 14;

  // ── 5) Cover note (opsiyonel) ──────────────────────────────────────
  if (quote.notes && quote.notes.trim().length > 0) {
    const noteLines = wrapTxt(safe(quote.notes.trim()), 90).slice(0, 6);
    const NOTE_H = 28 + noteLines.length * 13;
    page.drawRectangle({
      x: ML, y: nextY - NOTE_H, width: CW, height: NOTE_H,
      color: C.surface1, borderColor: C.borderSubtle, borderWidth: 0.5,
    });
    drawStyled(page, f, "ÖN SÖZ", ML + 16, nextY - 18, TYPE.sectionLabel, C.textMuted);
    let ny = nextY - 36;
    for (const line of noteLines) {
      drawText(page, f.sansRegular, line, ML + 16, ny, 9, C.textBody);
      ny -= 13;
    }
    nextY -= NOTE_H + 14;
  }

  // ── 6) Alt yarım: QR kod + KAPSAM/GEÇERLİLİK stat sütunları ──────
  // QR kod sol altta
  const QR_SIZE = 80;
  const QR_X = ML;
  const QR_Y = 170;
  const url = quotePublicUrl(quote.quoteNumber);
  const qrImage = await embedQrCode(pdf, { url, size: 240 });
  if (qrImage) {
    page.drawImage(qrImage, { x: QR_X, y: QR_Y, width: QR_SIZE, height: QR_SIZE });
    drawStyled(page, f, "DİJİTAL SÜRÜM", QR_X, QR_Y - 14, TYPE.sectionLabel, C.textMuted);
    drawText(page, f.sansRegular, safe(url.replace(/^https?:\/\//, "")), QR_X, QR_Y - 26, 7.5, C.textMuted);
  }

  // KAPSAM stat (orta)
  const STAT_X = ML + QR_SIZE + 32;
  drawStyled(page, f, "KAPSAM", STAT_X, QR_Y + QR_SIZE - 8, TYPE.sectionLabel, C.textMuted);
  drawStyled(
    page, f,
    `${quote.items.length} kalem`,
    STAT_X, QR_Y + QR_SIZE - 28, TYPE.sectionTitle, C.textPrimary,
  );
  const totalLabel = `Toplam: ${formatTryShort(Number(quote.total))}`;
  drawStyled(page, f, safe(totalLabel), STAT_X, QR_Y + QR_SIZE - 46, TYPE.monoMoney, C.textBody);
  drawStyled(page, f, "KDV dahil", STAT_X, QR_Y + QR_SIZE - 60, TYPE.tinyCaption, C.textMuted);

  // GEÇERLİLİK stat (sağ)
  const VAL_X = STAT_X + 200;
  drawStyled(page, f, "GEÇERLİLİK", VAL_X, QR_Y + QR_SIZE - 8, TYPE.sectionLabel, C.textMuted);
  const validUntil = quote.validityDate ? formatDate(quote.validityDate) : "Belirtilmedi";
  drawStyled(page, f, safe(validUntil), VAL_X, QR_Y + QR_SIZE - 28, TYPE.sectionTitle, C.textPrimary);
  if (quote.validityDate) {
    const days = Math.max(0, Math.round((quote.validityDate.getTime() - quote.createdAt.getTime()) / 86_400_000));
    drawStyled(page, f, `${days} gün`, VAL_X, QR_Y + QR_SIZE - 46, TYPE.monoMoney, C.textBody);
  }

  // ── 7) Alt iletişim şeridi ─────────────────────────────────────────
  const FOOTER_Y = 56;
  page.drawLine({
    start: { x: ML, y: FOOTER_Y + 28 },
    end: { x: PW - MR, y: FOOTER_Y + 28 },
    thickness: 0.5,
    color: C.borderSubtle,
  });
  drawStyled(page, f, "İLETİŞİM", ML, FOOTER_Y + 14, TYPE.sectionLabel, C.textMuted);
  drawStyled(
    page, f,
    safe(`${COMPANY_SETTINGS.phone}  ·  ${COMPANY_SETTINGS.email}  ·  www.${COMPANY_SETTINGS.website}`),
    ML, FOOTER_Y, TYPE.body, C.textBody,
  );

  // Hazırlayan (varsa) — sağ alt
  // Şu an quote'ta createdBy.name yok, eklenebilir Faz 4'te.

  // ── 8) Revision watermark (opsiyonel — version > 1) ───────────────
  // Faz 3 scope dışı — quote model'inde `version` alanı yoksa atla.
}

/**
 * Kapaktaki KAPSAM stat'ında kullanılan kısa TL formatı.
 * 125,436 TL gibi gösterim (currency mode'undan bağımsız özet).
 */
function formatTryShort(amount: number): string {
  const n = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  return `TL ${n}`;
}
