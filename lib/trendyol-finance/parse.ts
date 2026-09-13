/**
 * Faz 91 — Trendyol finans dosyası tanıma ve ayrıştırma.
 *
 * Trendyol partner panelinden inen dosyalar tek tip değil; bugüne kadar
 * görülen 9 varyant burada tanınır. Dosya adı güvenilir değil (tarayıcı
 * " (1)" ekliyor, kullanıcı başına rakam yapıştırabiliyor), bu yüzden
 * **tanıma sütun başlıklarından** yapılır; dosya adı yalnız Trendyol'un iç
 * belge numarasını (sourceRef) çıkarmak için kullanılır.
 */

import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { extractPdfText } from "./pdf-text";
import { fold } from "./cost-groups";

export type TrendyolFileKind =
  | "INVOICE_LIST" // Faturalar_*.xlsx — tüm faturaların başlık listesi
  | "INVOICE_PDF" // Tekil e-fatura PDF (KDV kırılımı buradan gelir)
  | "SETTLEMENT" // SaticiFatura_<id>_*.xlsx — hakediş satırları
  | "LINE_CARGO" // Kargo fatura detay
  | "LINE_SERVICE_FEE" // İşlem Bedeli Detay
  | "LINE_DEDUCTION" // Kesinti_Detay
  | "LINE_PENALTY" // Ceza faturası detay (Kusurlu / Eksik ürün)
  | "LINE_MICRO_EXPORT" // Micro Export Fees
  | "LINE_RETURN_FEE"; // Mikro ihracat iade bedeli

export const FILE_KIND_LABEL: Record<TrendyolFileKind, string> = {
  INVOICE_LIST: "Fatura listesi",
  INVOICE_PDF: "e-Fatura (PDF)",
  SETTLEMENT: "Hakediş detayı",
  LINE_CARGO: "Kargo fatura detayı",
  LINE_SERVICE_FEE: "İşlem bedeli detayı",
  LINE_DEDUCTION: "Kesinti detayı",
  LINE_PENALTY: "Ceza faturası detayı",
  LINE_MICRO_EXPORT: "Mikro ihracat bedeli",
  LINE_RETURN_FEE: "Mikro ihracat iade bedeli",
};

// ── Değer dönüştürücüler ────────────────────────────────────────────────────

/**
 * Tutar ayrıştırıcı. Aynı dosya ailesinde üç ayrı biçim var:
 *   • sayısal hücre            → -1000, 833.33
 *   • nokta ondalık metin      → "1079.0"
 *   • virgül ondalık metin     → "47,495"  (= 47.495 TL)
 * Kural: son görülen ayırıcı ondalıktır. Yalnızca 3'lü gruplama varsa
 * ("1.058.400" gibi) ayırıcı binlik sayılır.
 */
export function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim().replace(/\s|TL|₺/gi, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    // İki ayırıcı da var → sondaki ondalık, diğeri binlik.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // Saf binlik gruplama: "1.058.400"
    s = s.replace(/\./g, "");
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Tarih ayrıştırıcı. Görülen biçimler:
 *   "09.09.2026 13:08" · "24.07.2026" · "09-09-2026" ·
 *   "2026-08-30 13:14:36.546000" · Excel Date hücresi
 */
export function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;

  const s = String(v).trim();
  if (!s) return null;

  // ISO benzeri: 2026-08-30 13:14:36.546000
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (iso) {
    return new Date(
      Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0)),
    );
  }

  // Türkçe: 09.09.2026 13:08  /  24-07-2026
  const tr = s.match(/^(\d{1,2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (tr) {
    return new Date(Date.UTC(+tr[3], +tr[2] - 1, +tr[1], +(tr[4] ?? 0), +(tr[5] ?? 0)));
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** "209161.0" gibi sayıya kaçmış kimlikleri temiz metne çevirir. */
function idStr(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return s.replace(/\.0+$/, "");
}

function intOf(v: unknown): number | null {
  const n = parseAmount(v);
  return n == null ? null : Math.round(n);
}

// ── Dosya adından Trendyol iç belge numarası ────────────────────────────────

/**
 * Detay dosyaları fatura numarasını (DDF…) içermez; Trendyol'un iç belge
 * id'si yalnız dosya adında geçer. Örnekler:
 *   prod_cargo-invoice_209161_TR_TRY_85005834_detaylar.xlsx        → 85005834
 *   prod_209161_TR_TRY_DamagedItem_12219221_detaylar (1).xlsx      → 12219221
 *   20456prod_cargo-invoice_..._84778497_detaylar.xlsx             → 84778497
 *   prod_deduction-invoices_<uuid>_Kesintiler.xlsx                 → <uuid>
 *   SaticiFatura_44169107_08.09.2026-12.21.xlsx                    → 44169107
 * Bulunamazsa dosya adının kendisi kullanılır — dedup yine çalışır.
 */
export function extractSourceRef(fileName: string): string {
  const base = fileName.replace(/\.(xlsx|xls|csv|pdf)$/i, "").replace(/\s*\(\d+\)$/, "");

  const uuid = base.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];

  const settlement = base.match(/SaticiFatura[_-](\d{5,})/i);
  if (settlement) return settlement[1];

  // "_<id>_detaylar" kalıbı — en güvenilir konum.
  const detay = base.match(/[_-](\d{5,})[_-]detaylar/i);
  if (detay) return detay[1];

  // Aksi halde en uzun rakam dizisi (satıcı id 209161'i eleyerek).
  const nums = [...base.matchAll(/\d{5,}/g)].map((m) => m[0]).filter((n) => n !== "209161");
  if (nums.length) return nums.reduce((a, b) => (b.length >= a.length ? b : a));

  return base;
}

// ── Tanıma ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function headerSet(rows: Row[]): Set<string> {
  return new Set(Object.keys(rows[0] ?? {}).map(fold));
}

/** Başlık kümesinden dosya türünü belirler. Sıra: en spesifik önce. */
export function detectKind(rows: Row[], sheetName: string): TrendyolFileKind | null {
  const h = headerSet(rows);
  const sheet = fold(sheetName);
  const has = (...cols: string[]) => cols.every((c) => h.has(c));

  if (has("fatura no", "fatura tipi", "kategori")) return "INVOICE_LIST";
  if (has("kayit no", "satici hakedis")) return "SETTLEMENT";
  if (has("kesilen bedel")) return "LINE_PENALTY";
  if (has("gonderi ucreti (kdv dahil)") || sheet === "kargo fatura detay") return "LINE_CARGO";
  if (has("ek ucret", "iade onay tarihi")) return "LINE_RETURN_FEE";
  if (has("ek ucret", "affiliate") || sheet === "micro export fees") return "LINE_MICRO_EXPORT";
  if (has("ek ucret") || sheet === "islem bedeli detay") return "LINE_SERVICE_FEE";
  if (has("tutar", "storefront id") || sheet === "kesinti_detay") return "LINE_DEDUCTION";

  return null;
}

// ── Ayrıştırma sonuçları ────────────────────────────────────────────────────

export type ParsedInvoice = {
  invoiceNo: string;
  invoiceDate: Date;
  invoiceType: string;
  category: string | null;
  country: string | null;
  status: string | null;
  amountTry: number;
};

export type ParsedLine = {
  rowHash: string;
  orderNumber: string | null;
  shipmentType: string | null;
  shipmentCode: string | null;
  cargoCompany: string | null;
  orderDate: Date | null;
  shipDate: Date | null;
  amountTry: number;
  orderAmountTry: number | null;
  desi: number | null;
  quantity: number | null;
  description: string | null;
};

export type ParsedSettlement = {
  recordNo: string;
  transactionType: string;
  orderNumber: string;
  orderDate: Date | null;
  transactionDate: Date | null;
  country: string | null;
  productName: string | null;
  barcode: string | null;
  commissionPct: number | null;
  trendyolShareTry: number | null;
  sellerShareTry: number | null;
  totalTry: number | null;
  termDays: number | null;
  deliveryDate: Date | null;
  dueDate: Date | null;
};

export type ParsedPdfInvoice = {
  invoiceNo: string;
  invoiceDate: Date | null;
  netTry: number | null;
  vatTry: number | null;
  grossTry: number | null;
  vatRatePct: number | null;
  ettn: string | null;
  description: string | null;
  itemName: string | null;
};

export type LineFileKind =
  | "LINE_CARGO"
  | "LINE_SERVICE_FEE"
  | "LINE_DEDUCTION"
  | "LINE_PENALTY"
  | "LINE_MICRO_EXPORT"
  | "LINE_RETURN_FEE";

export type ParseResult =
  | { kind: "INVOICE_LIST"; invoices: ParsedInvoice[]; skipped: number }
  | { kind: "SETTLEMENT"; settlements: ParsedSettlement[]; skipped: number }
  | { kind: "INVOICE_PDF"; pdf: ParsedPdfInvoice }
  | { kind: LineFileKind; lines: ParsedLine[]; skipped: number };

// ── Satır ayrıştırıcılar ────────────────────────────────────────────────────

/** Satırın deterministik özeti — aynı dosya tekrar yüklendiğinde dedup anahtarı. */
function hashRow(parts: Array<string | number | null | undefined>): string {
  return createHash("sha1")
    .update(parts.map((p) => p ?? "").join("|"))
    .digest("hex")
    .slice(0, 24);
}

/** Excel başlıkları dosyadan dosyaya küçük farklarla geliyor; katlanmış adla eriş. */
function pick(row: Row, ...names: string[]): unknown {
  for (const [k, v] of Object.entries(row)) {
    const fk = fold(k);
    if (names.some((n) => fk === fold(n))) return v;
  }
  return undefined;
}

/** Başlığın bir parçasını içeren ilk sütun (uzun/kesilmiş başlıklar için). */
function pickLike(row: Row, ...fragments: string[]): unknown {
  for (const [k, v] of Object.entries(row)) {
    const fk = fold(k);
    if (fragments.some((f) => fk.includes(fold(f)))) return v;
  }
  return undefined;
}

function parseInvoiceList(rows: Row[]): { invoices: ParsedInvoice[]; skipped: number } {
  const invoices: ParsedInvoice[] = [];
  let skipped = 0;

  for (const r of rows) {
    const invoiceNo = idStr(pick(r, "Fatura No"));
    const date = parseDate(pick(r, "Fatura Tarihi"));
    const amount = parseAmount(pick(r, "Tutar"));
    const type = str(pick(r, "Fatura Tipi"));

    if (!invoiceNo || !date || amount == null || !type) {
      skipped++;
      continue;
    }

    invoices.push({
      invoiceNo,
      invoiceDate: date,
      invoiceType: type,
      category: str(pick(r, "Kategori")),
      country: str(pick(r, "Ülke")),
      status: str(pick(r, "Statü")),
      amountTry: amount,
    });
  }
  return { invoices, skipped };
}

function parseSettlements(rows: Row[]): { settlements: ParsedSettlement[]; skipped: number } {
  const settlements: ParsedSettlement[] = [];
  let skipped = 0;

  for (const r of rows) {
    const recordNo = idStr(pick(r, "Kayıt No"));
    const orderNumber = idStr(pick(r, "Sipariş No"));
    const transactionType = str(pick(r, "İşlem Tipi"));

    if (!recordNo || !orderNumber || !transactionType) {
      skipped++;
      continue;
    }

    settlements.push({
      recordNo,
      transactionType,
      orderNumber,
      orderDate: parseDate(pick(r, "Sipariş Tarihi")),
      transactionDate: parseDate(pick(r, "İşlem Tarihi")),
      country: str(pick(r, "Ülke")),
      productName: str(pick(r, "Ürün Adı")),
      barcode: idStr(pick(r, "Barkod")),
      commissionPct: parseAmount(pick(r, "Komisyon Oranı")),
      trendyolShareTry: parseAmount(pick(r, "Trendyol Hakediş")),
      sellerShareTry: parseAmount(pick(r, "Satıcı Hakediş")),
      totalTry: parseAmount(pick(r, "Toplam Tutar")),
      termDays: intOf(pick(r, "Vade Süresi")),
      deliveryDate: parseDate(pick(r, "Teslim Tarihi")),
      dueDate: parseDate(pick(r, "Vade tarihi", "Vade Tarihi")),
    });
  }
  return { settlements, skipped };
}

/**
 * Tüm detay/kesinti dosyaları aynı hedefe yazılır; sütun adları türden türe
 * değiştiği için tutar ve sipariş alanları alternatifleriyle aranır.
 * Tutar daima **pozitif gider** olarak normalize edilir.
 */
function parseLines(rows: Row[], kind: LineFileKind): { lines: ParsedLine[]; skipped: number } {
  const lines: ParsedLine[] = [];
  let skipped = 0;

  for (const r of rows) {
    const rawAmount = parseAmount(
      pick(r, "Ek Ücret", "Tutar", "Kesilen Bedel", "Gönderi Ücreti (KDV Dahil)"),
    );

    if (rawAmount == null || rawAmount === 0) {
      skipped++;
      continue;
    }

    const orderNumber = idStr(pick(r, "Sipariş No"));
    const orderDate = parseDate(pick(r, "Sipariş Tarihi"));
    const shipDate = parseDate(pick(r, "Sevk Tarihi", "İade Onay Tarihi", "Vade Tarihi"));
    const shipmentCode = idStr(pick(r, "Gönderi/İade Kodu", "Gönderi Kodu", "İade Kodu"));
    const shipmentType = str(pick(r, "Gönderi/İade", "İşlem Tipi", "Fatura Tipi"));
    const description = str(pick(r, "Açıklama", "Description", "Not"));
    const orderAmount = parseAmount(
      pickLike(r, "Sipariş Tutarı", "Ürün Tutarı", "Net Satış Tutarı", "NMV"),
    );

    lines.push({
      rowHash: hashRow([
        kind,
        orderNumber,
        shipmentCode,
        rawAmount,
        orderDate?.toISOString(),
        description,
      ]),
      orderNumber,
      shipmentType,
      shipmentCode,
      cargoCompany: str(pick(r, "Kargo Firması")),
      orderDate,
      shipDate,
      amountTry: Math.abs(rawAmount),
      orderAmountTry: orderAmount,
      desi: parseAmount(pick(r, "Desi")),
      quantity: intOf(pickLike(r, "Ürün Adedi")),
      description,
    });
  }
  return { lines, skipped };
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/**
 * e-Fatura PDF'inden KDV kırılımını çıkarır.
 *
 * Etiket ve değer ayrı satırlara düştüğü için desenlerde `\s` newline'ı da
 * kapsar. İki şablon var: kesinti faturaları "Belge No:", tedarikçi (SYL)
 * faturaları "Fatura No:" der.
 *
 * KDV tutarı sayfada toplam bloğunun *üstünde* serbest duruyor; güvenilir
 * olması için brüt−net farkından hesaplanır, bulunamazsa kalem KDV'si alınır.
 */
export function parsePdfInvoice(text: string): ParsedPdfInvoice | null {
  const invoiceNo = text.match(/(?:Belge|Fatura)\s*No\s*:?\s*([A-Z]{2,4}\d{6,})/i)?.[1] ?? null;
  if (!invoiceNo) return null;

  const money = (label: string): number | null => {
    const m = text.match(new RegExp(label + "\\s*:?\\s*([\\d.,]+)\\s*TL", "i"));
    return m ? parseAmount(m[1]) : null;
  };

  const net = money("Mal\\s*/\\s*Hizmet\\s*Toplam\\s*Tutarı");
  const gross = money("Vergiler\\s*Dahil\\s*Toplam\\s*Tutar") ?? money("Ödenecek\\s*Tutar");

  // Kalem satırındaki KDV tutarı — brüt/net yoksa yedek kaynak.
  const lineVat = text.match(/%\s*\d+[.,]\d+\s*\n?([\d.,]+)\s*TL/)?.[1] ?? null;
  const vat =
    net != null && gross != null ? Math.round((gross - net) * 100) / 100 : parseAmount(lineVat);

  const rateRaw =
    text.match(/KDV[^%\n]{0,20}%\s*(\d+(?:[.,]\d+)?)/i)?.[1] ??
    text.match(/%\s*(\d+(?:[.,]\d+)?)/)?.[1] ??
    null;

  const dateRaw = text
    .match(/Fatura\s*Tarihi\s*:?\s*(\d{2}\s*-\s*\d{2}\s*-\s*\d{4})/i)?.[1]
    ?.replace(/\s/g, "");

  return {
    invoiceNo,
    invoiceDate: parseDate(dateRaw),
    netTry: net,
    vatTry: vat,
    grossTry: gross,
    vatRatePct: parseAmount(rateRaw),
    ettn: text.match(/ETTN\s*:?\s*([0-9a-f-]{36})/i)?.[1]?.toUpperCase() ?? null,
    description: text.match(/Genel\s*Açıklamalar\s*\n([^\n]+)/i)?.[1]?.trim() ?? null,
    itemName: extractItemName(text),
  };
}

/** Kalem adı: "… Malzeme / Hizmet Tutarı" başlığından sonraki ilk metin satırı. */
function extractItemName(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim());
  const headIdx = lines.findIndex((l) => /Hizmet\s*Tutarı$/i.test(l));
  if (headIdx < 0) return null;

  for (let i = headIdx + 1; i < Math.min(headIdx + 8, lines.length); i++) {
    const l = lines[i];
    if (!l) continue;
    if (/^\d+([.,]\d+)?$/.test(l)) continue; // sıra no / miktar
    if (/^(Adet|Miktar|Kg)$/i.test(l)) continue;
    if (/TL$/i.test(l) || /^%/.test(l)) continue;
    return l;
  }
  return null;
}

// ── Giriş noktası ───────────────────────────────────────────────────────────

export class UnsupportedFileError extends Error {}

/** Dosya içeriğini türüne göre ayrıştırır. Tanınmayan dosyada hata fırlatır. */
export function parseFile(fileName: string, buf: Buffer): ParseResult {
  if (/\.pdf$/i.test(fileName)) {
    const text = extractPdfText(buf);
    if (!text) {
      throw new UnsupportedFileError(
        "PDF'ten metin çıkarılamadı (taranmış/görüntü PDF olabilir).",
      );
    }
    const pdf = parsePdfInvoice(text);
    if (!pdf) {
      throw new UnsupportedFileError(
        "PDF bir Trendyol e-faturası gibi görünmüyor (belge no bulunamadı).",
      );
    }
    return { kind: "INVOICE_PDF", pdf };
  }

  const wb = XLSX.read(buf, { type: "buffer", cellDates: true, codepage: 65001 });

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true });
    if (rows.length === 0) continue;

    const kind = detectKind(rows, sheetName);
    if (!kind) continue;

    if (kind === "INVOICE_LIST") return { kind, ...parseInvoiceList(rows) };
    if (kind === "SETTLEMENT") return { kind, ...parseSettlements(rows) };
    if (kind === "INVOICE_PDF") continue; // xlsx içinden PDF türü çıkmaz
    return { kind, ...parseLines(rows, kind) };
  }

  throw new UnsupportedFileError(
    "Dosya tanınmadı. Trendyol Finans → Faturalar ekranından indirilen " +
      "fatura listesi, detay (.xlsx) veya e-fatura (.pdf) dosyası yükleyin.",
  );
}
