import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFImage } from "pdf-lib";

/**
 * Faz 2 — PDF document + font ailesi
 *
 * Geist Sans (Regular/Medium/SemiBold) + Geist Mono (Regular/Medium) yüklenir.
 * pdf-lib subset:true ile sadece kullanılan glyph'ler PDF'e gömülür — boyut
 * artışı minimum (~10-15KB / font).
 *
 * Font kaynağı: `geist` npm paketi (node_modules/geist/dist/fonts/...).
 * Bu paket Vercel'in resmi font ailesidir, MIT lisansı.
 */

const FONTS_BASE = path.join(process.cwd(), "node_modules", "geist", "dist", "fonts");

const FONT_PATHS = {
  sansRegular:  path.join(FONTS_BASE, "geist-sans", "Geist-Regular.ttf"),
  sansMedium:   path.join(FONTS_BASE, "geist-sans", "Geist-Medium.ttf"),
  sansSemibold: path.join(FONTS_BASE, "geist-sans", "Geist-SemiBold.ttf"),
  monoRegular:  path.join(FONTS_BASE, "geist-mono", "GeistMono-Regular.ttf"),
  monoMedium:   path.join(FONTS_BASE, "geist-mono", "GeistMono-Medium.ttf"),
} as const;

const LOGO_PATH = path.join(process.cwd(), "public", "Soylu logo şeffaf.png");

export interface QuotePdfFonts {
  sansRegular:  PDFFont;
  sansMedium:   PDFFont;
  sansSemibold: PDFFont;
  monoRegular:  PDFFont;
  monoMedium:   PDFFont;
}

export interface QuotePdfDocument {
  pdf: PDFDocument;
  fonts: QuotePdfFonts;
  /** Birincil sans font alias (eski API uyumu) */
  font: PDFFont;
  /** Şirket logosu — yüklenemezse null */
  logo: PDFImage | null;
}

async function embedFont(pdf: PDFDocument, fontPath: string): Promise<PDFFont> {
  const bytes = await readFile(fontPath);
  return pdf.embedFont(bytes, { subset: true });
}

export async function createQuotePdfDocument(): Promise<QuotePdfDocument> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  // 5 font'u paralel yükle ve embed et — IO + parse darboğazını minimize eder
  const [sansRegular, sansMedium, sansSemibold, monoRegular, monoMedium] =
    await Promise.all([
      embedFont(pdf, FONT_PATHS.sansRegular),
      embedFont(pdf, FONT_PATHS.sansMedium),
      embedFont(pdf, FONT_PATHS.sansSemibold),
      embedFont(pdf, FONT_PATHS.monoRegular),
      embedFont(pdf, FONT_PATHS.monoMedium),
    ]);

  const fonts: QuotePdfFonts = {
    sansRegular,
    sansMedium,
    sansSemibold,
    monoRegular,
    monoMedium,
  };

  let logo: PDFImage | null = null;
  try {
    const logoBytes = await readFile(LOGO_PATH);
    logo = await pdf.embedPng(logoBytes);
  } catch {
    logo = null;
  }

  return { pdf, fonts, font: sansRegular, logo };
}
