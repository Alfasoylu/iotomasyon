import { getDocumentProxy } from "unpdf";
import { ALAN_ADAYLARI, normalizeHeader, otomatikEsle, zorunluEksik } from "./columns";
import type { HamAyristirma } from "./parse";

export class BankPdfError extends Error {}
export interface PdfText { text: string; x: number; y: number; width: number }
const headers = new Set(Object.values(ALAN_ADAYLARI).flat().map(normalizeHeader));
const MAX_PAGES = 100;

function lines(items: PdfText[]): PdfText[][] {
  const result: PdfText[][] = [];
  for (const item of [...items].filter(i => i.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    let line: PdfText[] | undefined = result.at(-1);
    if (line && Math.abs(line[0].y - item.y) > 2) line = undefined;
    if (!line) { line = []; result.push(line); }
    line.push(item);
  }
  return result.map(row => row.sort((a, b) => a.x - b.x));
}

function headerCells(line: PdfText[]) {
  const result: { text: string; x: number; right: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    let count = 1;
    for (let n = Math.min(4, line.length - i); n > 1; n--) {
      const part = line.slice(i, i + n);
      if (part.some((item, j) => j > 0 && item.x - (part[j - 1].x + part[j - 1].width) > 20)) continue;
      if (headers.has(normalizeHeader(part.map(item => item.text).join(" ")))) { count = n; break; }
    }
    result.push({ text: line.slice(i, i + count).map(item => item.text).join(" ").trim(), x: line[i].x, right: line[i + count - 1].x + line[i + count - 1].width });
    i += count - 1;
  }
  return result;
}

/** Recover positioned table columns; never guess transaction amounts from free-form text. */
export function pdfTable(pages: PdfText[][]): HamAyristirma {
  let names: string[] = [];
  const records: string[][] = [];
  let textCount = 0;
  let previousColumns: ReturnType<typeof headerCells> | null = null;
  for (const page of pages) {
    textCount += page.length;
    let columns: ReturnType<typeof headerCells> | null = previousColumns;
    for (const line of lines(page)) {
      const candidate = headerCells(line);
      const mapping = otomatikEsle(candidate.map(c => c.text));
      if (zorunluEksik(mapping.eslesen).length === 0) {
        const nextNames = candidate.map(c => c.text);
        if (new Set(nextNames.map(normalizeHeader)).size !== nextNames.length) throw new BankPdfError("PDF sütun başlıkları belirsiz. XLSX veya CSV ekstresini yükleyin.");
        if (names.length && JSON.stringify(nextNames.map(normalizeHeader)) !== JSON.stringify(names.map(normalizeHeader))) throw new BankPdfError("PDF sayfalarında farklı tablolar var. Her hesabın ekstresini ayrı yükleyin.");
        names = nextNames; columns = candidate; previousColumns = candidate; continue;
      }
      if (!columns) continue;
      const cells = columns.map(() => "");
      for (const item of line) {
        let col = 0;
        const numeric = /^[+\-−]?\s*[\d.,]+\s*(?:TL|TRY|₺)?-?$/i.test(item.text.trim());
        const position = numeric ? item.x + item.width : item.x;
        while (col + 1 < columns.length && position >= (numeric ? (columns[col].right + columns[col + 1].right) / 2 : (columns[col].x + columns[col + 1].x) / 2)) col++;
        cells[col] = `${cells[col]} ${item.text}`.trim();
      }
      const fields = otomatikEsle(names).eslesen;
      const dateIndex = names.indexOf(fields.tarih!);
      const date = cells[dateIndex];
      if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s|$)/.test(date) || /^\d{4}-\d{2}-\d{2}(?:\s|$)/.test(date)) {
        records.push(cells);
        if (records.length > 20000) throw new BankPdfError("PDF en fazla 20.000 hareket içerebilir.");
      } else if (records.length) {
        // Only an otherwise empty description column can continue a transaction.
        const descriptionIndex = names.indexOf(fields.aciklama!);
        if (cells[descriptionIndex] && cells.every((cell, index) => index === descriptionIndex || !cell)) {
          const previous = records[records.length - 1];
          previous[descriptionIndex] += ` ${cells[descriptionIndex]}`;
        }
      }
    }
  }
  if (!textCount) throw new BankPdfError("Bu PDF taranmış bir görüntü; metin okunamıyor. Bankadan metin içeren PDF, XLSX veya CSV indirin.");
  if (!names.length || !records.length) throw new BankPdfError("PDF'de okunabilir hesap hareketleri tablosu bulunamadı. Hesap hareketleri PDF'sini veya XLSX/CSV dosyasını yükleyin.");
  return { basliklar: names, ilkSatirlar: records.slice(0, 5), tumSatirlar: records, basliklarSatiriIndex: 0 };
}

export async function readBankPdf(buffer: Buffer): Promise<HamAyristirma> {
  if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new BankPdfError("Dosya geçerli bir PDF değil.");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0, isEvalSupported: false });
    if (pdf.numPages > MAX_PAGES) throw new BankPdfError("PDF en fazla 100 sayfa olabilir. Ekstreyi daha kısa dönemler halinde indirin.");
    const pages: PdfText[][] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const items: PdfText[] = [];
      for (const item of content.items) {
        if ("str" in item) items.push({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
      }
      if (!items.some(item => item.text.trim())) throw new BankPdfError("PDF'nin bir sayfasında okunabilir metin yok. Taranmış sayfa yerine bankadan metin içeren PDF veya XLSX/CSV indirin.");
      if (pages.reduce((total, p) => total + p.length, 0) + items.length > 250000) throw new BankPdfError("PDF içeriği çok büyük. Daha kısa dönemli ekstre yükleyin.");
      pages.push(items); page.cleanup();
    }
    return pdfTable(pages);
  } catch (error) {
    if (error instanceof BankPdfError) throw error;
    if (error instanceof Error && error.name === "PasswordException") throw new BankPdfError("PDF şifre korumalı. Bankadan şifresiz ekstre indirin veya şifreyi kaldırıp yeniden yükleyin.");
    throw new BankPdfError("PDF okunamadı. Geçerli bir banka ekstresi veya XLSX/CSV dosyası yükleyin.");
  } finally { await pdf?.destroy().catch(() => undefined); }
}
