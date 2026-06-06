/**
 * Faz 1 — Katalog PDF Üretici
 *
 * pdf-lib + Geist font ile USD net (KDV hariç) sektörel ürün kataloğu üretir.
 * Mevcut quote PDF generator pattern'ini paylaşır.
 *
 * Sayfa yapısı:
 * 1. Kapak — logo, sektör başlığı, müşteri adı, sales rep notu (opsiyonel)
 * 2. İçindekiler (kısa)
 * 3. Kategori bölümleri — her kategoriden ürünler (görsel + ad + SKU + USD net fiyat)
 * 4. Ödeme & Teslimat şartları
 * 5. Kapanış — CTA + iletişim
 */

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb, type PDFImage } from "pdf-lib";

import {
  COMPANY_SETTINGS,
  type CompanyBranding,
  type CompanySettingsData,
} from "@/lib/company-settings";
import type { CatalogPriceMode, CatalogProfile } from "@/lib/catalog-mapping";
import { loadCatalogImages } from "@/lib/catalog-image-loader";

const PW = 595;
const PH = 842;
const ML = 40;
const MR = 40;
const CW = PW - ML - MR;

const C = {
  charcoal: rgb(0.067, 0.094, 0.153),
  orange: rgb(0.976, 0.451, 0.086),
  orangeLight: rgb(1.0, 0.969, 0.929),
  slate900: rgb(0.1, 0.13, 0.2),
  slate700: rgb(0.22, 0.26, 0.34),
  slate500: rgb(0.4, 0.44, 0.52),
  slate300: rgb(0.67, 0.71, 0.78),
  slate200: rgb(0.84, 0.87, 0.92),
  slate50: rgb(0.97, 0.97, 0.99),
  white: rgb(1, 1, 1),
  emerald: rgb(0.05, 0.46, 0.31),
};

export interface CatalogPdfProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  stockQuantity: number;
  priceUsd: number | null; // chosen price (wholesale or retail or null)
  imageUrl: string | null;
}

export interface CatalogPdfCategorySection {
  categoryName: string;
  products: CatalogPdfProduct[];
}

export interface CatalogPdfOptions {
  customer: {
    name: string;
    company: string | null;
    city: string | null;
    industryName: string | null;
  };
  salesRepName: string | null;
  profile: CatalogProfile;
  priceMode: CatalogPriceMode;
  coverNote: string | null;
  sections: CatalogPdfCategorySection[];
  generatedAt: Date;
  validityDate: Date;
  /**
   * Şirket bilgileri — DB'den okunduysa caller `getCompanySettings()` ile
   * doldurur. Verilmezse module-level static `COMPANY_SETTINGS` (fallback) kullanılır.
   */
  companySettings?: CompanySettingsData & CompanyBranding;
}

export async function buildCatalogPdf(options: CatalogPdfOptions): Promise<Uint8Array> {
  // DB'den gelen taze değerler varsa onları kullan, yoksa static fallback
  const CS = options.companySettings ?? COMPANY_SETTINGS;
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

  let logoImage: PDFImage | null = null;
  try {
    // ASCII-only — UTF-8 NFC/NFD farkları için (public/soylu-logo.png aynı dosya)
    const logoBytes = await readFile(path.join(process.cwd(), "public", "soylu-logo.png"));
    logoImage = await pdf.embedPng(logoBytes);
  } catch {
    logoImage = null;
  }

  // Prefetch all product images in parallel — cache per-generation.
  const imageUrls = options.sections.flatMap((s) => s.products.map((p) => p.imageUrl));
  const imageCache = await loadCatalogImages(pdf, imageUrls);

  pdf.setTitle(`Katalog - ${options.customer.name}`);
  pdf.setAuthor(options.salesRepName ?? CS.companyName);
  pdf.setSubject(options.profile.title);

  let page = pdf.addPage([PW, PH]);
  let pageNumber = 1;
  let y = PH;

  function newPage() {
    page = pdf.addPage([PW, PH]);
    pageNumber++;
    y = PH;
    // Header strip
    page.drawRectangle({ x: 0, y: PH - 3, width: PW, height: 3, color: C.orange });
    page.drawRectangle({ x: 0, y: PH - 26, width: PW, height: 23, color: C.charcoal });
    drawTxt(page, font, safe(CS.companyName), ML, PH - 18, 8, C.white);
    drawTxt(page, font, safe(options.profile.title), PW - ML - 200, PH - 18, 8, C.orange);
    // Footer
    drawPageFooter();
    y = PH - 38;
  }

  function ensureSpace(needed: number) {
    if (y - needed < 60) {
      newPage();
    }
  }

  function drawPageFooter() {
    drawTxt(
      page,
      font,
      safe(
        `${CS.phone}  |  ${CS.email}  |  ${CS.website}`,
      ),
      ML,
      24,
      7,
      C.slate500,
    );
    drawTxt(page, font, `Sayfa ${pageNumber}`, PW - ML - 40, 24, 7, C.slate500);
  }

  // ── Cover page — Editorial / Annual Report stili ──────────────────────────
  //
  // Tasarım dili: Hermès / Stripe Press / Bloomberg / Apple annual report.
  //   - Bol negative space (sayfanın %50+'sı boş)
  //   - Tek aksan rengi (orange) — sadece bir aksan ipinde ve eyebrow'da
  //   - Mono mini etiketler (UPPERCASE tracking-widest 7px)
  //   - Büyük tek hiyerarşi (36px başlık, multi-line)
  //   - Dekoratif öğe SIFIR (diagonal çubuk yok, beyaz kart yok)
  //   - Yatay ince ayraç çizgileri (0.5px slate700) → bilgi bantlarını ayırır
  //
  // Anatomi (yukarıdan aşağıya):
  //   1. Top brand band  (logo + wordmark — sol, edition no — sağ)
  //   2. Eyebrow + DEV başlık + subtitle
  //   3. Cover note (opsiyonel, başlık-grid arası)
  //   4. Negatif boşluk
  //   5. Müşteri bloku
  //   6. Alt 4-sütun data grid (HAZIRLAYAN / GEÇERLİLİK / İLETİŞİM / WEB)

  // Full-bleed charcoal background
  page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: C.charcoal });

  // ── 1) Üst brand band (logo + wordmark sol, edition sağ) ─────────
  const BRAND_BAND_Y = PH - 56;
  const LOGO_H = 28;
  if (logoImage) {
    const ratio = logoImage.width / logoImage.height;
    const logoW = LOGO_H * ratio;
    page.drawImage(logoImage, {
      x: ML,
      y: BRAND_BAND_Y - 6,
      width: logoW,
      height: LOGO_H,
    });
    drawTxt(page, font, safe(CS.companyName.toUpperCase()), ML + logoW + 12, BRAND_BAND_Y + 7, 9, C.white);
  } else {
    drawTxt(page, font, safe(CS.companyName.toUpperCase()), ML, BRAND_BAND_Y + 7, 11, C.white);
  }

  // Sağ üst — edition (mono, küçük)
  const editionStr = new Intl.DateTimeFormat("tr-TR", { year: "numeric" }).format(options.generatedAt);
  const editionLabel = `EDITION ${editionStr}`;
  const editionWidth = font.widthOfTextAtSize(editionLabel, 7);
  drawTxt(page, font, editionLabel, PW - MR - editionWidth, BRAND_BAND_Y + 9, 7, C.slate500);

  // İnce ayraç çizgisi brand band'ın altında (tüm genişlik, 0.5px)
  page.drawRectangle({ x: ML, y: BRAND_BAND_Y - 18, width: CW, height: 0.5, color: C.slate700 });

  // ── 2) Aksan ipi (sadece bu kullanılır — diğer dekorasyon yok) ────
  const ACCENT_Y = PH - 152;
  page.drawRectangle({ x: ML, y: ACCENT_Y, width: 32, height: 2, color: C.orange });

  // ── 3) Eyebrow (ay + B2B KATALOG) ──────────────────────────────────
  const monthYear = new Intl.DateTimeFormat("tr-TR", { year: "numeric", month: "long" })
    .format(options.generatedAt)
    .toLocaleUpperCase("tr-TR");
  drawTxt(page, font, safe(`${monthYear} · B2B KATALOG`), ML, ACCENT_Y - 18, 8, C.slate300);

  // ── 4) DEV başlık (36pt, multi-line OK, beyaz) ─────────────────────
  const titleLines = wrapTxt(safe(options.profile.title), 22).slice(0, 3);
  let ty = ACCENT_Y - 52;
  for (const line of titleLines) {
    drawTxt(page, font, line, ML, ty, 36, C.white);
    ty -= 44;
  }

  // ── 5) Subtitle (accent orange, 13px) ───────────────────────────────
  drawTxt(page, font, safe(options.profile.subtitle), ML, ty - 6, 13, C.orange);
  const subtitleEndY = ty - 6;

  // ── 6) Cover note (opsiyonel, başlık ile data grid arasında) ────────
  let dataTopY = 260; // Default: müşteri bloku 260'tan başlar
  if (options.coverNote && options.coverNote.trim().length > 0) {
    const noteLines = wrapTxt(safe(options.coverNote.trim()), 80).slice(0, 4);
    const noteH = 18 + noteLines.length * 14;
    const noteY = Math.min(subtitleEndY - 40, 360 + noteH); // başlık altında belli boşluk bırak

    // Sol border (2px accent çizgi) — tek dekorasyon olarak izin verildi
    page.drawRectangle({ x: ML, y: noteY - noteH, width: 2, height: noteH, color: C.orange });
    drawTxt(page, font, "ÖN SÖZ", ML + 14, noteY - 12, 7, C.slate300);
    let ny = noteY - 28;
    for (const line of noteLines) {
      drawTxt(page, font, line, ML + 14, ny, 10, C.white);
      ny -= 14;
    }
    // Data grid'i ön sözün altına çek
    dataTopY = Math.min(dataTopY, noteY - noteH - 40);
  }

  // ── 7) Müşteri bloku ────────────────────────────────────────────────
  // Üst ayraç çizgisi
  page.drawRectangle({ x: ML, y: dataTopY, width: CW, height: 0.5, color: C.slate700 });

  drawTxt(page, font, "HAZIRLANAN MÜŞTERİ", ML, dataTopY - 18, 7, C.orange);
  const customerLabel = safe(limitTxt(options.customer.company ?? options.customer.name, 60));
  const customerLines = wrapTxt(customerLabel, 38).slice(0, 2);
  let cy = dataTopY - 42;
  for (const line of customerLines) {
    drawTxt(page, font, line, ML, cy, 17, C.white);
    cy -= 22;
  }

  // Müşteri sub-meta (yetkili + şehir + sektör)
  const subParts: string[] = [];
  if (options.customer.company && options.customer.name !== options.customer.company) {
    subParts.push(options.customer.name);
  }
  if (options.customer.city) subParts.push(options.customer.city);
  if (options.customer.industryName) subParts.push(options.customer.industryName);
  if (subParts.length > 0) {
    drawTxt(page, font, safe(subParts.join("  ·  ")), ML, cy - 2, 10, C.slate300);
  }

  // ── 8) Alt 4-sütun data grid ────────────────────────────────────────
  // Üst ayraç + 4 eşit kolon: HAZIRLAYAN | GEÇERLİLİK | İLETİŞİM | WEB
  const GRID_TOP = 88;
  page.drawRectangle({ x: ML, y: GRID_TOP + 28, width: CW, height: 0.5, color: C.slate700 });

  const colWidth = CW / 4;
  const validDateStr = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(options.validityDate);

  const dataCols = [
    {
      label: "HAZIRLAYAN",
      value: safe(limitTxt(options.salesRepName ?? CS.salesContact, 22)),
    },
    {
      label: "GEÇERLİLİK",
      value: safe(validDateStr),
    },
    {
      label: "İLETİŞİM",
      value: safe(CS.phone),
    },
    {
      label: "WEB",
      value: safe(CS.website),
    },
  ];
  dataCols.forEach((c, i) => {
    const cx = ML + i * colWidth;
    drawTxt(page, font, c.label, cx, GRID_TOP + 12, 7, C.orange);
    drawTxt(page, font, c.value, cx, GRID_TOP - 8, 10, C.white);
  });

  // En alt — tek satır legal/note
  if (options.priceMode !== "hidden") {
    drawTxt(
      page,
      font,
      "Tüm fiyatlar USD bazında ve KDV hariçtir. Faturada TCMB kuru üzerinden TL hesaplanır.",
      ML,
      GRID_TOP - 36,
      7,
      C.slate500,
    );
  }

  // ── Category sections ──────────────────────────────────────────────────────
  for (const section of options.sections) {
    if (section.products.length === 0) continue;
    newPage();

    // Section title
    page.drawRectangle({
      x: ML,
      y: y - 28,
      width: CW,
      height: 28,
      color: C.charcoal,
    });
    page.drawRectangle({ x: ML, y: y - 32, width: CW, height: 3, color: C.orange });
    drawTxt(
      page,
      font,
      safe(section.categoryName.toUpperCase()),
      ML + 14,
      y - 18,
      12,
      C.white,
    );
    drawTxt(
      page,
      font,
      `${section.products.length} ürün`,
      PW - MR - 80,
      y - 18,
      8,
      C.orange,
    );

    y -= 44;

    // 2-column product grid
    const COL_W = (CW - 10) / 2;
    const ROW_H = 110;
    let colIdx = 0;

    for (const product of section.products) {
      ensureSpace(ROW_H + 4);
      const col = colIdx % 2;
      const rowY = y;
      const cardX = ML + col * (COL_W + 10);

      // Card border
      page.drawRectangle({
        x: cardX,
        y: rowY - ROW_H,
        width: COL_W,
        height: ROW_H,
        color: C.white,
        borderColor: C.slate200,
        borderWidth: 0.6,
      });

      // Image — fetched + embedded; falls back to placeholder if unavailable
      const slot = { x: cardX + 6, y: rowY - 88, w: 80, h: 80 };
      page.drawRectangle({
        x: slot.x,
        y: slot.y,
        width: slot.w,
        height: slot.h,
        color: C.slate50,
        borderColor: C.slate200,
        borderWidth: 0.4,
      });
      const productImage = product.imageUrl ? imageCache.get(product.imageUrl) ?? null : null;
      if (productImage) {
        // Aspect-fit inside slot
        const r = productImage.width / productImage.height;
        let w = slot.w - 4;
        let h = w / r;
        if (h > slot.h - 4) {
          h = slot.h - 4;
          w = h * r;
        }
        page.drawImage(productImage, {
          x: slot.x + (slot.w - w) / 2,
          y: slot.y + (slot.h - h) / 2,
          width: w,
          height: h,
        });
      } else {
        drawTxt(page, font, "Görsel", slot.x + 22, slot.y + 36, 7, C.slate300);
      }

      // Right side text
      const tx = cardX + 92;
      const nameLines = wrapTxt(safe(product.name), 28).slice(0, 2);
      drawTxt(page, font, nameLines[0] ?? "", tx, rowY - 16, 9, C.slate900);
      if (nameLines[1]) drawTxt(page, font, nameLines[1], tx, rowY - 28, 9, C.slate900);

      drawTxt(page, font, safe(`SKU: ${product.sku}`), tx, rowY - 44, 7, C.slate500);
      if (product.brand) {
        drawTxt(page, font, safe(product.brand), tx, rowY - 56, 7, C.slate500);
      }

      // Stock badge
      if (product.stockQuantity > 0) {
        drawTxt(page, font, "● Stokta", tx, rowY - 70, 7, C.emerald);
      } else {
        drawTxt(page, font, "○ Sipariş üzerine", tx, rowY - 70, 7, C.slate500);
      }

      // Price (USD net)
      if (options.priceMode !== "hidden" && product.priceUsd != null) {
        const priceTxt = fmtUsd(product.priceUsd);
        drawTxt(page, font, priceTxt, tx, rowY - 90, 14, C.charcoal);
        const priceW = font.widthOfTextAtSize(priceTxt, 14);
        drawTxt(page, font, "+KDV", tx + priceW + 4, rowY - 86, 8, C.slate500);
      } else {
        drawTxt(page, font, "Fiyat için iletişime geçin", tx, rowY - 90, 8, C.slate500);
      }

      if (col === 1) {
        y -= ROW_H + 6;
      }
      colIdx++;
    }
    // If ended on left column, advance row
    if (colIdx % 2 === 1) {
      y -= ROW_H + 6;
    }
  }

  // ── Terms & CTA page ───────────────────────────────────────────────────────
  newPage();

  // Terms section
  page.drawRectangle({
    x: ML,
    y: y - 28,
    width: CW,
    height: 28,
    color: C.charcoal,
  });
  drawTxt(page, font, "TİCARİ KOŞULLAR", ML + 14, y - 18, 11, C.white);
  y -= 40;

  const terms: Array<[string, string]> = [
    ["Ödeme", CS.paymentTerms],
    ["Teslimat", CS.deliveryTerms],
    ["Garanti", CS.warrantyTerms],
    [
      "Fiyat / KDV",
      "Tüm fiyatlar USD bazında ve KDV hariçtir. Faturada TCMB kuru üzerinden TL hesaplanır.",
    ],
  ];
  for (const [label, value] of terms) {
    drawTxt(page, font, safe(label.toUpperCase()), ML, y - 12, 7, C.orange);
    const lines = wrapTxt(safe(value), 95).slice(0, 4);
    let ly = y - 26;
    for (const line of lines) {
      drawTxt(page, font, line, ML, ly, 8, C.slate700);
      ly -= 12;
    }
    y = ly - 8;
    ensureSpace(40);
  }

  y -= 16;
  ensureSpace(140);

  // Bank info
  const BANK_H = 64;
  page.drawRectangle({
    x: ML,
    y: y - BANK_H,
    width: CW,
    height: BANK_H,
    color: C.white,
    borderColor: C.orange,
    borderWidth: 0.8,
  });
  page.drawRectangle({ x: ML, y: y - BANK_H, width: 3, height: BANK_H, color: C.orange });
  drawTxt(page, font, "ÖDEME BİLGİLERİ", ML + 12, y - 14, 7, C.orange);
  drawTxt(
    page,
    font,
    safe(`Banka: ${CS.bankName}  |  Hesap: ${CS.bankAccountType}`),
    ML + 12,
    y - 30,
    8,
    C.slate700,
  );
  drawTxt(page, font, safe(`IBAN: ${CS.bankIban}`), ML + 12, y - 44, 9, C.slate900);
  drawTxt(
    page,
    font,
    safe(`Hesap Sahibi: ${limitTxt(CS.bankAccountHolder, 80)}`),
    ML + 12,
    y - 58,
    7,
    C.slate500,
  );

  y -= BANK_H + 20;
  ensureSpace(80);

  // CTA
  page.drawRectangle({
    x: ML,
    y: y - 70,
    width: CW,
    height: 70,
    color: C.orange,
  });
  drawTxt(page, font, "HEMEN SİPARİŞ İÇİN", ML + 16, y - 22, 10, C.white);
  drawTxt(
    page,
    font,
    safe(
      `Telefon: ${CS.phone}  ·  WhatsApp: ${CS.phoneSecondary}`,
    ),
    ML + 16,
    y - 42,
    11,
    C.white,
  );
  drawTxt(
    page,
    font,
    safe(`E-posta: ${CS.email}`),
    ML + 16,
    y - 58,
    9,
    C.white,
  );

  // useObjectStreams=true → PDF nesnelerini stream'lere paketler, %20-40 boyut düşürür
  const bytes = await pdf.save({ useObjectStreams: true });
  return bytes;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function drawCentered(
  page: PDFPage,
  font: PDFFont,
  text: string,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PW - w) / 2, y, size, font, color });
}

function safe(value: string): string {
  return Array.from(value)
    .filter((c) => c.charCodeAt(0) > 31)
    .join("");
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

function fmtUsd(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
