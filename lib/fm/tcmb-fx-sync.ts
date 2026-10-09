/**
 * TCMB aylık stratejik kurunun otomatik kaydı (CFO-003, 2026-10-09). Önceden `scripts/fm-fx-tcmb.ts` elle çalıştırılıyordu; Ekim satırı
 * boş kalınca Goal Engine ve stratejik kur "önceki ay"a düşüyordu. Günlük xml-sync'in after() adımı bu ay ve önceki ay için çağırır:
 *   - satır varsa dokunmaz (mevcut kayıt asla güncellenmez / silinmez);
 *   - yoksa ve ayın 15'i geldiyse TCMB resmî bülteninden (lib/fm/tcmb-fx.ts kuralı) çeker ve YALNIZ doğrulanmış değeri ekler
 *     (ON CONFLICT DO NOTHING); bülten yoksa / ağ hatasıysa hiçbir şey yazmaz (kur BİLİNMİYOR kalır, sabit yedek yok).
 */
import { referenceRateForMonth, type FetchLike, type FxResult } from "./tcmb-fx";

export type FxSyncDb = {
  query<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<unknown>;
};
export type FxSyncResult = { month: string; status: "present" | "inserted" | "pending" | "missing" | "error"; rate?: number; reason?: string };

/** İstanbul takvim günü (UTC+3, yaz saati yok). */
export const istanbulDate = (now: Date) => new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);

export async function ensureTcmbMonthlyFx(db: FxSyncDb, fetchLike: FetchLike, now: Date): Promise<FxSyncResult[]> {
  const today = istanbulDate(now);
  const [y, m] = today.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const out: FxSyncResult[] = [];
  for (const month of [prev, today.slice(0, 7)]) {
    const key = `${month}-01`;
    const [row] = await db.query<{ n: number }>(`select count(*)::int as n from fm_fx_monthly where month = $1::date and usd_try_forex_buying is not null`, key);
    if (Number(row?.n ?? 0) > 0) { out.push({ month: key, status: "present" }); continue; }
    let ref: FxResult;
    try { ref = await referenceRateForMonth(month, fetchLike, today); }
    catch (e) { out.push({ month: key, status: "error", reason: (e as Error).message.slice(0, 200) }); continue; }
    if (ref.status !== "ok") { out.push({ month: key, status: ref.status, reason: ref.reason }); continue; }
    await db.execute(`insert into fm_fx_monthly (month, usd_try_forex_buying, ref_date, bulletin_no, is_fallback_day, source_url)
      values ($1::date, $2::numeric, $3::date, $4, $5, $6) on conflict (month) do nothing`,
      ref.month, ref.rate.toFixed(4), ref.refDate, ref.bulletinNo, ref.isFallbackDay, ref.sourceUrl);
    out.push({ month: key, status: "inserted", rate: ref.rate });
  }
  return out;
}
