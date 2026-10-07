import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// ALFASHOME kanalı (2026-10-07): alfashome.com siparişleri Entegra'ya DÜŞMEZ (kullanıcı), stok XML'den elle düşülür →
// ürün hızı zaten XML'de; eksik olan CİRO. Bu modül alfashome_order'dan (lib/alfashome/sync.ts) sipariş toplamı bazında
// ciro kanıtı üretir. Kalemlerde SKU/fiyat olmadığından ürün bazlı değildir. Kişisel veri okunmaz. Salt-okunur.
// Gerçekleşmiş sayılan: ödeme captured/authorized/partially_refunded ve sipariş iptal/arşiv değil. Ödeme bekleyen ayrı.

export const SYNC_STALE_DAYS = 2;
export type AlfasAgg = { n30: number; rev30: number | null; mtd: number | null; pending30: number | null; lastOrder: string | null; lastSync: string | null };

export function alfashomeEvidence(a: AlfasAgg, at: string): Evidence[] {
  const ageDays = a.lastSync ? Math.floor((new Date(at).getTime() - new Date(a.lastSync).getTime()) / 86400000) : null;
  const fresh = ageDays != null && ageDays <= SYNC_STALE_DAYS;
  const src = "alfashome_order";
  return [
    evidence(src, "alfashome.senkron (ayrı kanal; Entegra'da yok, stok XML'de)", a.lastSync ? `son senkron ${a.lastSync.slice(0, 10)}${fresh ? "" : " — BAYAT"}` : "hiç senkron yok", "state", at, fresh),
    evidence(src, "alfashome.ciro_son_30_gun_try (ödenmiş, iptal hariç)", a.rev30 ?? 0, "TRY", at, fresh),
    evidence(src, "alfashome.siparis_son_30_gun", a.n30, "orders", at, fresh),
    evidence(src, "alfashome.ay_basindan_ciro_try", a.mtd ?? 0, "TRY", at, fresh),
    evidence(src, "alfashome.odeme_bekleyen_son_30_gun_try", a.pending30 ?? 0, "TRY", at, fresh),
    evidence(src, "alfashome.son_siparis", a.lastOrder ? a.lastOrder.slice(0, 10) : "yok", "date", at, fresh),
  ];
}

export async function loadAlfashomeSales(db: ReadSource, at: string): Promise<Evidence[]> {
  const [t] = await db.query<{ t: string | null }>(`select to_regclass('public.alfashome_order')::text as t`);
  if (!t?.t) return [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(at));
  const [r] = await db.query(`with o as (select *, (ordered_at at time zone 'Europe/Istanbul')::date as d,
      coalesce(payment_status,'') in ('captured','authorized','partially_refunded') and coalesce(status,'') not in ('canceled','archived') as paid,
      coalesce(payment_status,'') in ('awaiting','not_paid') and coalesce(status,'') not in ('canceled','archived') as pending from alfashome_order)
    select count(*) filter (where paid and d > $1::text::date - 30)::int as n30,
      sum(amount) filter (where paid and d > $1::text::date - 30)::float8 as rev30,
      sum(amount) filter (where paid and d >= date_trunc('month', $1::text::date)::date)::float8 as mtd,
      sum(amount) filter (where pending and d > $1::text::date - 30)::float8 as pending30,
      max(ordered_at)::text as last_order, max(synced_at)::text as last_sync from o`, today);
  if (!r) return [];
  const n = (v: unknown) => (v == null ? null : Number(v));
  return alfashomeEvidence({ n30: Number(r.n30 ?? 0), rev30: n(r.rev30), mtd: n(r.mtd), pending30: n(r.pending30),
    lastOrder: r.last_order == null ? null : new Date(String(r.last_order)).toISOString(), lastSync: r.last_sync == null ? null : new Date(String(r.last_sync)).toISOString() }, at);
}
