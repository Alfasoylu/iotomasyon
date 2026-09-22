/**
 * Entegra "sipariş dışa aktarım" dosyasını MarketplaceSalesRecord satırlarına çevirir.
 *
 * Bu dosya SAF: veritabanına dokunmaz, yalnız ayrıştırır ve eşler. Eşleştirme ve
 * yazma `lib/entegra/import.ts` içinde.
 *
 * ⚠️ Alan eşlemesi kullanıcı tarafından doğrulandı — tahminle değiştirilmez.
 */
import * as XLSX from "xlsx";
import { createHash } from "node:crypto";

/** Entegra "Entegrasyon" kolonu → MarketplaceSalesRecord.channel (BÜYÜK harf) */
const CHANNEL_MAP: Record<string, string> = {
  trendyol: "TRENDYOL",
  hepsiburada: "HEPSIBURADA",
  n11: "N11",
  ideasoft: "IDEASOFT",
  gg: "GG",
  pazarama: "PAZARAMA",
  eptt: "EPTT",
  mirakl_koctas: "MIRAKL_KOCTAS",
  idefix: "IDEFIX",
  amazon: "AMAZON",
  ciceksepeti: "CICEKSEPETI",
  temu: "TEMU",
  mirakl_teknosa: "MIRAKL_TEKNOSA",
  shopphp: "SHOPPHP",
  manual: "MANUAL",
};

export function normalizeChannel(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return CHANNEL_MAP[s.toLowerCase()] ?? s.toUpperCase();
}

/** "153936.0" → "153936" · 153936 → "153936" · "" → null */
export function toLineId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Excel sayıyı float'a çevirebiliyor; tam sayı kısmını al.
  const m = s.match(/^(-?\d+)(?:\.0*)?$/);
  if (m) return m[1];
  const n = Number(s);
  if (Number.isFinite(n) && Number.isInteger(n)) return String(n);
  return s;
}

/**
 * Tarihi SAATSİZ olarak UTC gece yarısına sabitler.
 * Kabul edilen: Date · Excel seri numarası · "M/d/yy" · "d.m.yyyy" · ISO.
 * ⚠️ Yerel saat kullanılmaz: sunucu saat dilimi tarihi bir gün kaydırabilirdi.
 */
export function toDateOnly(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Excel seri numarası (1900 tabanlı, 25569 = 1970-01-01)
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  const s = String(raw).trim();
  if (!s) return null;

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdy) return ymd(yr(mdy[3]), +mdy[1], +mdy[2]);

  const dmy = s.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{4})/);
  if (dmy) return ymd(+dmy[3], +dmy[2], +dmy[1]);

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return ymd(+iso[1], +iso[2], +iso[3]);

  return null;
}

function yr(v: string): number {
  const n = parseInt(v, 10);
  return v.length === 2 ? 2000 + n : n;
}

function ymd(y: number, mo: number, d: number): Date | null {
  if (!Number.isFinite(y) || y < 2015 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** "1.234,56" / "1234.56" / 1234.56 → 1234.56 · boş → null */
export function toDecimal(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  // Binlik ayıracı: "1.234,56" → "1234.56"
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function toQuantity(raw: unknown): number {
  const n = toDecimal(raw);
  if (n == null) return 1;
  const i = Math.round(n);
  return i > 0 ? i : 1;
}

function str(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function round2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}

/** Bir dosya satırının eşlenmiş hâli (yazmaya hazır). */
export interface EntegraRecord {
  key: string; // channel|orderNumber|externalLineId
  id: string; // deterministik: 'ent' + md5(key)
  channel: string;
  orderNumber: string;
  platformRef: string | null;
  externalLineId: string;
  orderDate: Date;
  status: string;
  productName: string | null;
  productCode: string | null;
  modelNumber: string | null;
  storeStockName: string | null;
  quantity: number;
  grossAmountTry: number | null;
  vatAmountTry: number | null;
  totalAmountTry: number | null;
  commissionTry: number | null;
  commissionPct: number | null;
  platformPaymentTry: number | null;
  customerCode: string | null;
  customerFirma: string | null;
  customerInvoiceName: string | null;
  customerVergiNo: string | null;
  customerTcKimlik: string | null;
  customerVergiDairesi: string | null;
  customerCity: string | null;
  cargoCompany: string | null;
  cargoTrackingNo: string | null;
  desiTotal: number | null;
  productId: string | null; // parse aşamasında null, eşleştirme dolduruyor
}

export interface SkippedRow {
  satir: number; // 1 tabanlı dosya satırı (başlık hariç)
  sebep: string;
}

export interface ParseResult {
  kayitlar: EntegraRecord[];
  atlanan: SkippedRow[];
  dosyaIciMukerrer: number;
  eksikSutunlar: string[];
}

const ZORUNLU_SUTUNLAR = ["Entegrasyon", "Sipariş Numarası", "ID", "Tarih", "Durum Adı"];

export function fileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function recordId(channel: string, orderNumber: string, lineId: string): string {
  return "ent" + createHash("md5").update(`${channel}|${orderNumber}|${lineId}`).digest("hex");
}

/**
 * Metin dosyaları (CSV) için BOM'u atar ve doğru kod sayfasını seçer.
 *
 * ⚠️ İKİ GERÇEK TUZAK (22.09.2026'da ölçüldü):
 *  1) UTF-8 BOM'lu CSV, codepage 65001 ile okunduğunda SheetJS ilk başlığı
 *     kırpıyor ve Türkçe harfleri bozuyor: "Entegrasyon" → "tegrasyon",
 *     "Sipariş Numarası" → "Sipari_ Numaras1". Excel Türkçe Windows'ta CSV'yi
 *     BOM ile kaydeder, yani bu istisna değil olağan durum.
 *  2) Dosya geçerli UTF-8 DEĞİLSE büyük olasılıkla windows-1254 (Türkçe ANSI).
 *     65001 zorlanırsa Türkçe harfler yine bozulur.
 *
 * .xlsx bir zip'tir (PK\x03\x04) — kodlama içeride, dokunulmaz.
 */
function metinHazirla(buffer: Buffer): { buf: Buffer; codepage: number } {
  const zip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (zip) return { buf: buffer, codepage: 65001 };

  let buf = buffer;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
  }
  // Geçerli UTF-8 mi? Tur atınca bayt bayt aynı kalıyorsa evet.
  const gecerliUtf8 = Buffer.compare(Buffer.from(buf.toString("utf8"), "utf8"), buf) === 0;
  return { buf, codepage: gecerliUtf8 ? 65001 : 1254 };
}

/** Dosyayı okuyup satırları eşler. Veritabanına HİÇ dokunmaz. */
export function parseEntegraFile(buffer: Buffer): ParseResult {
  const { buf, codepage } = metinHazirla(buffer);
  const wb = XLSX.read(buf, { type: "buffer", codepage, cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Dosyada sayfa bulunamadı.");
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: "",
    raw: false,
    // cellDates ile tarih hücreleri Date döner; raw:false diğerlerini metin yapar.
  });

  if (raw.length === 0) throw new Error("Dosya boş.");

  const basliklar = new Set(Object.keys(raw[0]));
  const eksikSutunlar = ZORUNLU_SUTUNLAR.filter((c) => !basliklar.has(c));
  if (eksikSutunlar.length > 0) {
    return { kayitlar: [], atlanan: [], dosyaIciMukerrer: 0, eksikSutunlar };
  }

  const atlanan: SkippedRow[] = [];
  // Dosya içi mükerrer: aynı anahtar iki kez geçerse SON satır kazanır
  // (Entegra aynı siparişi güncellenmiş hâliyle tekrar yazabiliyor).
  const byKey = new Map<string, EntegraRecord>();
  let dosyaIciMukerrer = 0;

  raw.forEach((r, i) => {
    const satir = i + 1;

    const atla = (sebep: string) => {
      atlanan.push({ satir, sebep });
    };

    const channel = normalizeChannel(r["Entegrasyon"]);
    if (!channel) return atla("Entegrasyon (kanal) boş");

    const orderNumber = str(r["Sipariş Numarası"]);
    if (!orderNumber) return atla("Sipariş Numarası boş");

    // externalLineId benzersiz anahtarın parçası. Boşsa yazılmaz: NULL içeren
    // anahtar Postgres'te benzersizliği ZORLAMAZ, aynı satır tekrar tekrar
    // eklenirdi.
    const externalLineId = toLineId(r["ID"]);
    if (!externalLineId) return atla("ID boş — benzersiz anahtar kurulamaz");

    const orderDate = toDateOnly(r["Tarih"]);
    if (!orderDate) return atla(`Tarih okunamadı: "${String(r["Tarih"] ?? "")}"`);

    // status asla NULL yazılmaz; boşsa satır atlanır (uydurulmuş bir durum
    // iade/satış ayrımını bozardı).
    const status = str(r["Durum Adı"]);
    if (!status) return atla("Durum Adı boş");

    const key = `${channel}|${orderNumber}|${externalLineId}`;
    if (byKey.has(key)) dosyaIciMukerrer++;

    byKey.set(key, {
      key,
      id: recordId(channel, orderNumber, externalLineId),
      channel,
      orderNumber,
      platformRef: str(r["Platform Ref. No"]),
      externalLineId,
      orderDate,
      status,
      productName: str(r["Ürün Adı"]),
      productCode: str(r["Ürün Kodu"]),
      modelNumber: str(r["Model"]),
      storeStockName: str(r["store_stock_name"]),
      quantity: toQuantity(r["Toplam Miktar"]),
      grossAmountTry: round2(toDecimal(r["Toplam"])),
      vatAmountTry: round2(toDecimal(r["Vergi"])),
      totalAmountTry: round2(toDecimal(r["Genel Toplam"])),
      commissionTry: round2(toDecimal(r["Komisyon Tutarı"])),
      commissionPct: round2(toDecimal(r["Komisyon Oranı"])),
      platformPaymentTry: round2(toDecimal(r["PazaryerindenGelenOdemeTutar"])),
      customerCode: str(r["Müşteri Kodu"]),
      customerFirma: str(r["Firma"]),
      customerInvoiceName: str(r["Fatura Adı"]),
      customerVergiNo: str(r["Vergi No"]),
      customerTcKimlik: str(r["TC Kimlik"]),
      customerVergiDairesi: str(r["Vergi Dairesi"]),
      customerCity: str(r["Fatura Şehir"]),
      cargoCompany: str(r["Kargo Firması"]),
      cargoTrackingNo: str(r["Kargo Kodu"]),
      desiTotal: round2(toDecimal(r["Toplam Desi"])),
      productId: null,
    });
  });

  return { kayitlar: [...byKey.values()], atlanan, dosyaIciMukerrer, eksikSutunlar: [] };
}
