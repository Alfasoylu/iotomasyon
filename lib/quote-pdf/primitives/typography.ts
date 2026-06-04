import "server-only";

import type { PDFFont, PDFPage, rgb } from "pdf-lib";

/**
 * Faz 1 — Tipografi primitivleri
 *
 * Mevcut route.ts'teki helper'lar buraya taşındı. Faz 2'de TYPE token
 * sistemi eklenecek (TYPE.body, TYPE.monoMoney, vb.).
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
 * PDF metnine güvenle yazılabilir karakterlere indir — control char'ları
 * (newline hariç) at, böylece pdf-lib'in WinAnsi encoder'ı patlamaz.
 */
export function sanitize(value: string): string {
  return Array.from(value).filter((c) => c.charCodeAt(0) > 31).join("");
}

/**
 * Maksimum karakter sayısına göre metni truncate et — fazlası ellipsis ile.
 */
export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Sözcükleri koruyarak satır wrap. PDF tablosunda açıklama gibi alanlar için.
 */
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

/**
 * Türkçe locale ile tarih formatla (medium).
 */
export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(value);
}
