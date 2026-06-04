import "server-only";

import type { PDFDocument } from "pdf-lib";

import type { QuotePdfFonts } from "../document";
import { COLORS as C } from "./colors";
import { TYPE, drawStyled, measureWidth } from "./typography";

/**
 * Faz 4 — İki-geçişli "Sayfa X / Y" footer
 *
 * PDF tamamen render edildikten sonra çağrılır. O ana kadar total page
 * count bilinir; tüm sayfaların footer'ına "Sayfa X / Y" eklenir.
 *
 * Cover sayfası (page 0) atlanır — kendi footer'ı vardır.
 * Sadece içerik sayfaları (page 1+) numaralandırılır.
 */

const PW = 595;
const MR = 40;
const FOOTER_Y = 24;

export function stampPageNumbers(pdf: PDFDocument, fonts: QuotePdfFonts): void {
  const pages = pdf.getPages();
  if (pages.length <= 1) return; // sadece cover varsa numaralandırma yok

  // İçerik sayfaları (cover hariç) → 1..N
  const contentPageCount = pages.length - 1;

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    const contentIdx = i; // 1-based
    const stamp = `Sayfa ${contentIdx} / ${contentPageCount}`;
    const w = measureWidth(fonts, stamp, TYPE.chromeMeta);
    // Sağ alt köşe — content page chrome footer ile aynı baseline (FOOTER_Y)
    drawStyled(
      page, fonts, stamp,
      PW - MR - w, FOOTER_Y, TYPE.chromeMeta, C.textMuted,
    );
  }
}
