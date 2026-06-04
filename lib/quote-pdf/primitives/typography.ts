import "server-only";

import type { PDFFont, PDFPage, rgb } from "pdf-lib";

import type { QuotePdfFonts } from "../document";

/**
 * Faz 2 — TYPE token sistemi + tipografi primitivleri
 *
 * Spec'teki tipografi hiyerarşisi token olarak burada tanımlı. Her token:
 *   { font: "sansRegular|sansMedium|sansSemibold|monoRegular|monoMedium",
 *     size: number,
 *     letterSpacing?: number (opt — şu an pdf-lib desteklemiyor, doc amaçlı),
 *     uppercase?: boolean }
 *
 * Kullanım:
 *   drawStyledText(page, fonts, "Fiyat Teklifi", x, y, TYPE.documentTitle, COLORS.textPrimary)
 */

export type TypeFontKey = keyof QuotePdfFonts;

export interface TypeToken {
  font: TypeFontKey;
  size: number;
  /** Hint for designers; pdf-lib doesn't apply this automatically. */
  letterSpacing?: number;
  uppercase?: boolean;
}

export const TYPE = {
  // Cover page
  brandWordmark:    { font: "sansRegular",  size: 18 },
  documentTitle:    { font: "sansSemibold", size: 32, letterSpacing: -0.3 },
  customerName:     { font: "sansSemibold", size: 22, letterSpacing: -0.2 },

  // Section headers
  sectionLabel:     { font: "sansMedium", size: 9,  letterSpacing: 1.8, uppercase: true },
  sectionTitle:     { font: "sansSemibold", size: 13 },

  // Page chrome (sticky header on subsequent pages)
  chromeBrand:      { font: "sansMedium",  size: 9 },
  chromeMeta:       { font: "monoRegular", size: 8 },

  // Body
  body:             { font: "sansRegular", size: 10 },
  bodyEmphasis:     { font: "sansMedium",  size: 10 },
  caption:          { font: "sansRegular", size: 8 },
  tinyCaption:      { font: "sansRegular", size: 7 },

  // Numeric (mono)
  monoBody:         { font: "monoRegular", size: 9 },
  monoMoney:        { font: "monoMedium",  size: 10 },
  monoMoneyLarge:   { font: "monoMedium",  size: 28 },

  // Special
  quoteNumberLarge: { font: "monoMedium",  size: 14 },
  tableHeader:      { font: "sansMedium",  size: 7, letterSpacing: 1.5, uppercase: true },
} satisfies Record<string, TypeToken>;

export type TypeKey = keyof typeof TYPE;

// ── Drawing helpers ─────────────────────────────────────────────────

/**
 * Backward-compatible raw drawer — caller picks font and size directly.
 * Existing layout code uses this; new code should prefer `drawStyled`.
 */
export function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  page.drawText(text, { x, y, size, font, color });
}

/**
 * Token-aware drawer. Resolves the correct font from the family and applies
 * uppercase if the token requests it.
 */
export function drawStyled(
  page: PDFPage,
  fonts: QuotePdfFonts,
  text: string,
  x: number,
  y: number,
  token: TypeToken,
  color: ReturnType<typeof rgb>,
): void {
  const finalText = token.uppercase ? text.toLocaleUpperCase("tr-TR") : text;
  page.drawText(finalText, { x, y, size: token.size, font: fonts[token.font], color });
}

/**
 * Measure rendered width — useful for right-aligned numeric columns.
 */
export function measureWidth(
  fonts: QuotePdfFonts,
  text: string,
  token: TypeToken,
): number {
  const finalText = token.uppercase ? text.toLocaleUpperCase("tr-TR") : text;
  return fonts[token.font].widthOfTextAtSize(finalText, token.size);
}

// ── Text utilities (unchanged from Faz 1) ───────────────────────────

export function sanitize(value: string): string {
  return Array.from(value).filter((c) => c.charCodeAt(0) > 31).join("");
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function wrapText(value: string, maxCharsPerLine: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(value);
}
