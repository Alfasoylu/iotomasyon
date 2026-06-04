import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFImage } from "pdf-lib";

/**
 * Faz 1 — PDF document kurulum helper'ları
 *
 * Mevcut route.ts'teki font/logo embed kodu buraya taşındı.
 *
 * Faz 2'de:
 *  - Geist Mono font eklenecek (`embedQuotePdfFonts` döneminde Mono da yüklenir)
 *  - Logo path company-settings'ten alınacak
 */

const GEIST_REGULAR_PATH = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "compiled",
  "@vercel",
  "og",
  "Geist-Regular.ttf",
);

const LOGO_PATH = path.join(process.cwd(), "public", "Soylu logo şeffaf.png");

export interface QuotePdfDocument {
  pdf: PDFDocument;
  /** Birincil sans font (Geist Regular) */
  font: PDFFont;
  /** Şirket logosu — yüklenemezse null (fallback bar çizilir) */
  logo: PDFImage | null;
}

/**
 * Boş PDF document, embed font ve logo (varsa) hazırlar.
 * Generator entry-point bunu çağırır, sonra sayfa-sayfa çizer.
 */
export async function createQuotePdfDocument(): Promise<QuotePdfDocument> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const fontBytes = await readFile(GEIST_REGULAR_PATH);
  const font = await pdf.embedFont(fontBytes, { subset: true });

  let logo: PDFImage | null = null;
  try {
    const logoBytes = await readFile(LOGO_PATH);
    logo = await pdf.embedPng(logoBytes);
  } catch {
    // Logo yoksa sessizce devam — renderer fallback çizecek
    logo = null;
  }

  return { pdf, font, logo };
}
