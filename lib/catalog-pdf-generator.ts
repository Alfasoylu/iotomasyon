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

import { COMPANY_SETTINGS } from "@/lib/company-settings";
import type { CatalogPriceMode, CatalogProfile } from "@/lib/catalog-mapping";

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
}

export async function buildCatalogPdf(options: CatalogPdfOptions): Promise<Uint8Array> {
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
    const logoBytes = await readFile(path.join(process.cwd(), "public", "Soylu logo şeffaf.png"));
    logoImage = await pdf.embedPng(logoBytes);
  } catch {
    logoImage = null;
  }

  pdf.setTitle(`Katalog - ${options.customer.name}`);
  pdf.setAuthor(options.salesRepName ?? COMPANY_SETTINGS.companyName);
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
    drawTxt(page, font, safe(COMPANY_SETTINGS.companyName), ML, PH - 18, 8, C.white);
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
        `${COMPANY_SETTINGS.phone}  |  ${COMPANY_SETTINGS.email}  |  ${COMPANY_SETTINGS.website}`,
      ),
      ML,
      24,
      7,
      C.slate500,
    );
    drawTxt(page, font, `Sayfa ${pageNumber}`, PW - ML - 40, 24, 7, C.slate500);
  }

  // ── Cover page ─────────────────────────────────────────────────────────────
  // Orange top stripe
  page.drawRectangle({ x: 0, y: PH - 3, width: PW, height: 3, color: C.orange });
  // Dark hero
  const HERO_H = 320;
  page.drawRectangle({ x: 0, y: PH - HERO_H, width: PW, height: HERO_H - 3, color: C.charcoal });

  // Logo centered
  if (logoImage) {
    const ratio = logoImage.width / logoImage.height;
    const targetH = 90;
    const w = targetH * ratio;
    page.drawImage(logoImage, {
      x: (PW - w) / 2,
      y: PH - 160,
      width: w,
      height: targetH,
    });
  } else {
    page.drawRectangle({
      x: (PW - 60) / 2,
      y: PH - 150,
      width: 60,
      height: 80,
      color: C.orange,
    });
  }

  // Company name
  drawCentered(page, font, safe(COMPANY_SETTINGS.companyName), PH - 190, 18, C.white);
  drawCentered(page, font, safe(COMPANY_SETTINGS.tagline), PH - 210, 9, C.slate300);

  // Sector title
  drawCentered(page, font, safe(options.profile.title), PH - 250, 22, C.orange);
  drawCentered(page, font, safe(options.profile.subtitle), PH - 272, 10, C.slate300);

  // Year/date
  const yearStr = new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "long",
  }).format(options.generatedAt);
  drawCentered(page, font, safe(yearStr), PH - 300, 10, C.slate300);

  y = PH - HERO_H - 30;

  // Customer block
  page.drawRectangle({
    x: ML,
    y: y - 70,
    width: CW,
    height: 70,
    color: C.orangeLight,
    borderColor: C.orange,
    borderWidth: 0.8,
  });
  drawTxt(page, font, "HAZIRLANAN MÜŞTERİ", ML + 16, y - 18, 7, C.orange);
  drawTxt(
    page,
    font,
    safe(limitTxt(options.customer.company ?? options.customer.name, 60)),
    ML + 16,
    y - 36,
    14,
    C.slate900,
  );
  const subParts: string[] = [];
  if (options.customer.company && options.customer.name !== options.customer.company) {
    subParts.push(`Yetkili: ${options.customer.name}`);
  }
  if (options.customer.city) subParts.push(options.customer.city);
  if (options.customer.industryName) subParts.push(options.customer.industryName);
  if (subParts.length > 0) {
    drawTxt(page, font, safe(subParts.join("  ·  ")), ML + 16, y - 54, 8, C.slate700);
  }
  if (options.salesRepName) {
    drawTxt(
      page,
      font,
      safe(`Hazırlayan: ${options.salesRepName}`),
      PW - MR - 200,
      y - 54,
      8,
      C.slate700,
    );
  }

  y -= 90;

  // Cover note (optional)
  if (options.coverNote && options.coverNote.trim().length > 0) {
    const noteLines = wrapTxt(safe(options.coverNote.trim()), 90).slice(0, 8);
    const noteH = 20 + noteLines.length * 14;
    page.drawRectangle({
      x: ML,
      y: y - noteH,
      width: CW,
      height: noteH,
      color: C.white,
      borderColor: C.slate200,
      borderWidth: 0.5,
    });
    drawTxt(page, font, "ÖN SÖZ", ML + 12, y - 14, 7, C.slate500);
    let ny = y - 30;
    for (const line of noteLines) {
      drawTxt(page, font, line, ML + 12, ny, 9, C.slate700);
      ny -= 14;
    }
    y -= noteH + 10;
  }

  // Validity strip
  const validStr = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(
    options.validityDate,
  );
  drawTxt(
    page,
    font,
    safe(`Bu katalog ${validStr} tarihine kadar geçerlidir.`),
    ML,
    y - 14,
    8,
    C.slate500,
  );
  y -= 24;

  // KDV/USD notice
  if (options.priceMode !== "hidden") {
    drawTxt(
      page,
      font,
      "Tüm fiyatlar USD bazında ve KDV hariçtir. Faturada TCMB kuru üzerinden TL hesaplanır.",
      ML,
      y - 12,
      7,
      C.slate500,
    );
    y -= 22;
  }

  drawPageFooter();

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

      // Image placeholder (no remote fetch — costly; show placeholder block)
      page.drawRectangle({
        x: cardX + 6,
        y: rowY - 88,
        width: 80,
        height: 80,
        color: C.slate50,
        borderColor: C.slate200,
        borderWidth: 0.4,
      });
      drawTxt(page, font, "Görsel", cardX + 26, rowY - 52, 7, C.slate300);

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
    ["Ödeme", COMPANY_SETTINGS.paymentTerms],
    ["Teslimat", COMPANY_SETTINGS.deliveryTerms],
    ["Garanti", COMPANY_SETTINGS.warrantyTerms],
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
    safe(`Banka: ${COMPANY_SETTINGS.bankName}  |  Hesap: ${COMPANY_SETTINGS.bankAccountType}`),
    ML + 12,
    y - 30,
    8,
    C.slate700,
  );
  drawTxt(page, font, safe(`IBAN: ${COMPANY_SETTINGS.bankIban}`), ML + 12, y - 44, 9, C.slate900);
  drawTxt(
    page,
    font,
    safe(`Hesap Sahibi: ${limitTxt(COMPANY_SETTINGS.bankAccountHolder, 80)}`),
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
      `Telefon: ${COMPANY_SETTINGS.phone}  ·  WhatsApp: ${COMPANY_SETTINGS.phoneSecondary}`,
    ),
    ML + 16,
    y - 42,
    11,
    C.white,
  );
  drawTxt(
    page,
    font,
    safe(`E-posta: ${COMPANY_SETTINGS.email}`),
    ML + 16,
    y - 58,
    9,
    C.white,
  );

  const bytes = await pdf.save();
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
