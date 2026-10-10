import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";
import { revenueRange, shiftDay } from "../cfo/revenue";
import type { SqlQuery } from "../cfo/capital-efficiency-data";

// ALFASHOME kanalı (2026-10-07): alfashome.com siparişleri Entegra'ya DÜŞMEZ (kullanıcı), stok XML'den elle düşülür →
// ürün hızı zaten XML'de; eksik olan CİRO. Bu modül alfashome_order'dan (lib/alfashome/sync.ts) sipariş toplamı bazında
// ciro kanıtı üretir. Kalemlerde SKU/fiyat olmadığından ürün bazlı değildir. Kişisel veri okunmaz. Salt-okunur.
// CFO-008 (2026-10-10): ciro ve sipariş sayısı TEK ciro kaynağından (lib/cfo/revenue.ts — Goal Engine satırları, source_system ALFASHOME;
// kural migration 200000: iptal/taslak/arşiv hariç, sipariş durumuna göre). Önceden ödeme durumu (captured/authorized) arandı; kaynakta
// payment_status hiç dolu değil → ciro hep 0 görünüyordu (Ekim'de 3 sipariş 14.865 TL). Ödeme bekleyen yalnız bilgi: durum yoksa BİLİNMİYOR.

export const SYNC_STALE_DAYS = 2;
export type AlfasAgg = { n30: number; rev30: number | null; mtd: number | null; pending30: number | null; lastOrder: string | null; lastSync: string | null };

export function alfashomeEvidence(a: AlfasAgg, at: string): Evidence[] {
  const ageDays = a.lastSync ? Math.floor((new Date(at).getTime() - new Date(a.lastSync).getTime()) / 86400000) : null;
  const fresh = ageDays != null && ageDays <= SYNC_STALE_DAYS;
  const src = "alfashome_order";
  return [
    evidence(src, "alfashome.senkron (ayrı kanal; Entegra'da yok, stok XML'de)", a.lastSync ? `son senkron ${a.lastSync.slice(0, 10)}${fresh ? "" : " — BAYAT"}` : "hiç senkron yok", "state", at, fresh),
    evidence(src, "alfashome.ciro_son_30_gun_try (tek ciro kaynağı: iptal/taslak/arşiv hariç)", a.rev30 ?? 0, "TRY", at, fresh),
    evidence(src, "alfashome.siparis_son_30_gun", a.n30, "orders", at, fresh),
    evidence(src, "alfashome.ay_basindan_ciro_try", a.mtd ?? 0, "TRY", at, fresh),
    evidence(src, "alfashome.odeme_bekleyen_son_30_gun_try", a.pending30 ?? "bilinmiyor (ödeme durumu kaynakta yok)", a.pending30 == null ? "state" : "TRY", at, fresh && a.pending30 != null),
    evidence(src, "alfashome.son_siparis", a.lastOrder ? a.lastOrder.slice(0, 10) : "yok", "date", at, fresh),
  ];
}

export async function loadAlfashomeSales(db: ReadSource, at: string): Promise<Evidence[]> {
  const [t] = await db.query<{ t: string | null }>(`select to_regclass('public.alfashome_order')::text as t`);
  if (!t?.t) return [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(at));
  const q = (<T,>(sql: string) => db.query(sql) as Promise<T[]>) as SqlQuery;
  const [r30, mtd] = await Promise.all([revenueRange(q, shiftDay(today, -29), today, new Date(at)), revenueRange(q, `${today.slice(0, 8)}01`, today, new Date(at))]);
  const [r] = await db.query(`select sum(amount) filter (where coalesce(payment_status,'') in ('awaiting','not_paid') and coalesce(status,'') not in ('canceled','draft','archived')
        and (ordered_at at time zone 'Europe/Istanbul')::date > $1::text::date - 30)::float8 as pending30,
      count(payment_status)::int as with_payment, max(ordered_at)::text as last_order, max(synced_at)::text as last_sync from alfashome_order`, today);
  if (!r) return [];
  return alfashomeEvidence({ n30: r30.alfashomeOrders, rev30: r30.alfashomeInclTry, mtd: mtd.alfashomeInclTry,
    pending30: Number(r.with_payment ?? 0) > 0 ? Number(r.pending30 ?? 0) : null,
    lastOrder: r.last_order == null ? null : new Date(String(r.last_order)).toISOString(), lastSync: r.last_sync == null ? null : new Date(String(r.last_sync)).toISOString() }, at);
}
