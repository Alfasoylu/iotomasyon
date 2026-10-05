/**
 * Financial Memory Step 1F — TCMB aylık USD/TRY referans kuru.
 *
 * Kural (kesin): her ay için ayın 15'inde yayımlanan TCMB bülteninin USD **ForexBuying (Döviz Alış)** değeri;
 * 15'i için bülten yoksa (hafta sonu/resmî tatil) ONDAN ÖNCEKİ son TCMB bülteni.
 * Kaynak yalnız TCMB'nin resmî günlük bülten arşividir (https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml).
 * TCMB olmayan hiçbir kur sessiz fallback olarak kullanılmaz: bülten bulunamazsa ay "missing" kalır (kalite = U).
 */

export interface FetchResponseLike { status: number; text(): Promise<string> }
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface FxReference {
  status: "ok";
  month: string;            // YYYY-MM-01
  refDate: string;          // YYYY-MM-DD (bülten tarihi)
  rate: number;             // USD ForexBuying
  bulletinNo: string;
  isFallbackDay: boolean;   // 15'i değil, önceki iş günü kullanıldı
  sourceUrl: string;
}
export interface FxMissing { status: "missing" | "pending"; month: string; reason: string; tried: string[] }
export type FxResult = FxReference | FxMissing;

const pad = (n: number) => String(n).padStart(2, "0");
export function isoDate(y: number, m: number, d: number): string { return `${y}-${pad(m)}-${pad(d)}`; }
/** Saf UTC tarih aritmetiği (yerel saat dilimi etkisi yok). */
export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export function bulletinUrl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `https://www.tcmb.gov.tr/kurlar/${y}${m}/${d}${m}${y}.xml`;
}

/** Bülten XML'inden USD ForexBuying; Tarih bayrağı istenen gün değilse veya değer geçersizse null. */
export function parseUsdForexBuying(xml: string, expectedIso: string): { rate: number; bulletinNo: string } | null {
  const [y, m, d] = expectedIso.split("-");
  const header = /<Tarih_Date\s+Tarih="(\d{2})\.(\d{2})\.(\d{4})"[^>]*Bulten_No="([^"]+)"/.exec(xml);
  if (!header || header[1] !== d || header[2] !== m || header[3] !== y) return null;
  const usd = /<Currency\b[^>]*\bKod="USD"[^>]*>([\s\S]*?)<\/Currency>/.exec(xml);
  if (!usd) return null;
  const unit = /<Unit>\s*(\d+)\s*<\/Unit>/.exec(usd[1]);
  const buying = /<ForexBuying>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/ForexBuying>/.exec(usd[1]);
  if (!buying || (unit && unit[1] !== "1")) return null;
  const rate = Number(buying[1]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { rate, bulletinNo: header[4] };
}

/**
 * Bir ayın referans kuru. 404 = "o gün bülten yok" (hafta sonu/tatil) → bir gün geri; diğer her HTTP/ağ hatası
 * veya bozuk içerik HATA fırlatır (eksik veriyi "tatil" sanıp yanlış güne düşmemek için).
 */
export async function referenceRateForMonth(month: string, fetchLike: FetchLike, today: string, maxLookbackDays = 10): Promise<FxResult> {
  const [y, m] = month.split("-").map(Number);
  const target = isoDate(y, m, 15);
  const monthKey = `${isoDate(y, m, 1)}`;
  if (target > today) return { status: "pending", month: monthKey, reason: "ayın 15'i henüz gelmedi", tried: [] };
  const tried: string[] = [];
  for (let back = 0; back <= maxLookbackDays; back++) {
    const day = addDays(target, -back);
    const url = bulletinUrl(day);
    tried.push(day);
    const res = await fetchLike(url);
    if (res.status === 404) continue;
    if (res.status !== 200) throw new Error(`TCMB bülteni alınamadı (${res.status}) ${url}`);
    const parsed = parseUsdForexBuying(await res.text(), day);
    if (!parsed) throw new Error(`TCMB bülteni ayrıştırılamadı veya tarih uyuşmuyor: ${url}`);
    return { status: "ok", month: monthKey, refDate: day, rate: parsed.rate, bulletinNo: parsed.bulletinNo, isFallbackDay: back > 0, sourceUrl: url };
  }
  return { status: "missing", month: monthKey, reason: `15'inden geriye ${maxLookbackDays} günde TCMB bülteni bulunamadı`, tried };
}

export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** Yalnız doğrulanmış referanslar için idempotent upsert SQL'i (eksik/bekleyen aylar yazılmaz). */
export function fxUpsertSql(refs: FxResult[], runId: string | null): string {
  const rows = refs.filter((r): r is FxReference => r.status === "ok");
  if (rows.length === 0) return "";
  const values = rows.map(r =>
    `(${q(r.month)}, ${r.rate.toFixed(4)}, ${q(r.refDate)}, ${q(r.bulletinNo)}, ${r.isFallbackDay}, ${q(r.sourceUrl)}, ${runId ? q(runId) : "NULL"})`).join(",\n");
  return `INSERT INTO public.fm_fx_monthly (month, usd_try_forex_buying, ref_date, bulletin_no, is_fallback_day, source_url, ingest_run_id)
VALUES
${values}
ON CONFLICT (month) DO UPDATE SET usd_try_forex_buying = EXCLUDED.usd_try_forex_buying, ref_date = EXCLUDED.ref_date,
  bulletin_no = EXCLUDED.bulletin_no, is_fallback_day = EXCLUDED.is_fallback_day, source_url = EXCLUDED.source_url,
  ingest_run_id = EXCLUDED.ingest_run_id, fetched_at = now();`;
}
