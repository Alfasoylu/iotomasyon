import type { SqlQuery } from "./capital-efficiency-data";

// CFO-008 (RF-20261008-009, 2026-10-10): TEK CİRO KAYNAĞI. Ciro yedi ayrı formülle hesaplanıyordu (eski motor elle girilen 14 gün,
// gelir kaldıraçları cfo_satis_birim_duz 90g/3, /admin/sermaye yalnız Trendyol, borç tahmini Entegra 30 gün, Alfashome ödeme durumu …).
// Artık hepsi Goal Engine'in okuduğu satırlardan: fm_sales_canonical_snapshot (disposition = 'COUNTED' — iptal/iade/tedarik edilemedi/test/
// mükerrer hariç; Trendyol API + Entegra (IDEASOFT dahil) + Alfashome; tarih = sipariş günü; D-P05: hedef KDV DAHİL, KDV hariç yan gösterge).
// Tamlık Goal Engine kuralıyla (fm_goal_evaluate): hafıza tazeleme günü − 1'e kadar tam; hız/projeksiyon için her kaynağın (Trendyol API,
// Entegra) son okunma günü − 1'e kadar. Eksik gün 0 sayılmaz: istenen aralık tam değilse `complete=false`.
// Satır düzeyi kârlılık (cfo_satis_birim_duz, cfo_aylik_urun_kar) ayrı amaçla kalır — manşet ciro DEĞİL.

export const REVENUE_SOURCE = "fm_sales_canonical_snapshot (Goal Engine ciro kaynağı)";

/** $1 = başlangıç günü, $2 = bitiş günü (dahil). Sipariş günü (economic_date) bazında. */
export const REVENUE_RANGE_SQL = `
with fr as (
  select (select max(finished_at) from fm_ingest_run where kind in ('sales_backfill','sales_refresh') and status = 'succeeded') as refreshed_at,
         ((max(known_at) filter (where source_system = 'TRENDYOL_API')) at time zone 'UTC' at time zone 'Europe/Istanbul')::date - 1 as ty_through,
         ((max(known_at) filter (where source_system = 'MARKETPLACE')) at time zone 'UTC' at time zone 'Europe/Istanbul')::date - 1 as mp_through
    from fm_sales_canonical_snapshot),
r as (
  select coalesce(sum(revenue_incl_vat_try), 0) as incl, coalesce(sum(amount_ex_vat_try), 0) as excl,
         coalesce(sum(revenue_incl_vat_try) filter (where legacy_business is not null), 0) as textile,
         coalesce(sum(revenue_incl_vat_try) filter (where source_system = 'ALFASHOME'), 0) as alfashome,
         count(distinct order_key) filter (where source_system = 'ALFASHOME')::int as alfashome_orders,
         count(*)::int as rows, count(*) filter (where 'ex_vat_default_rate' = any(quality_flags))::int as default_vat_rows
    from fm_sales_canonical_snapshot
   where disposition = 'COUNTED' and economic_date between $1::date and $2::date)
select fr.refreshed_at::text as refreshed_at, fr.ty_through::text as ty_through, fr.mp_through::text as mp_through,
       ((fr.refreshed_at at time zone 'Europe/Istanbul')::date - 1)::text as memory_through,
       r.incl, r.excl, r.textile, r.alfashome, r.alfashome_orders, r.rows, r.default_vat_rows
  from fr cross join r`;

/** Tamlık sınırları (aralıksız) — "son N tam gün" için. */
export const REVENUE_FRESHNESS_SQL = REVENUE_RANGE_SQL.replace("between $1::date and $2::date", "between current_date and current_date - 1");

export type RevenueFreshness = {
  /** hafıza tazeleme günü − 1 (Goal Engine complete_through tabanı); null = hiç tazelenmedi */
  memoryThrough: string | null;
  /** her satış kaynağının tam olduğu son gün (Trendyol API, Entegra ve hafıza sınırının en küçüğü) */
  allSourcesThrough: string | null;
  refreshedAt: string | null;
};

export type RevenueRange = RevenueFreshness & {
  from: string; to: string;
  /** KDV dahil (hedefin ölçüsü, D-P05) */
  inclTry: number;
  exclTry: number;
  textileInclTry: number;
  alfashomeInclTry: number;
  alfashomeOrders: number;
  rows: number;
  /** KDV hariç tutarı kaynakta olmayıp varsayılan oranla türetilen satır sayısı */
  defaultVatRows: number;
  /** aralığın tamamı tüm kaynaklarda tam mı (değilse eksik gün 0 sayılmış olur → karşılaştırmada kullanma) */
  complete: boolean;
  source: string;
};

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const minDay = (...d: (string | null)[]) => d.filter((x): x is string => x != null).sort()[0] ?? null;

/** Saf: tamlık sınırları (Goal Engine: kaynağın hiç satırı yoksa sınır koymaz; hafıza hiç tazelenmediyse hiçbir gün tam değil). */
export function freshness(r: Row | undefined, today: string): RevenueFreshness {
  const memoryThrough = day(r?.memory_through);
  const yesterday = shiftDay(today, -1);
  const allSourcesThrough = memoryThrough == null ? null : minDay(memoryThrough, yesterday, day(r?.ty_through), day(r?.mp_through));
  return { memoryThrough, allSourcesThrough, refreshedAt: typeof r?.refreshed_at === "string" ? r.refreshed_at : null };
}

export function toRevenueRange(r: Row | undefined, from: string, to: string, today: string): RevenueRange {
  const f = freshness(r, today);
  return { ...f, from, to, inclTry: num(r?.incl), exclTry: num(r?.excl), textileInclTry: num(r?.textile), alfashomeInclTry: num(r?.alfashome), alfashomeOrders: num(r?.alfashome_orders),
    rows: num(r?.rows), defaultVatRows: num(r?.default_vat_rows), complete: f.allSourcesThrough != null && to <= f.allSourcesThrough, source: REVENUE_SOURCE };
}

export function shiftDay(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
}

/** İstanbul takvim günü (YYYY-MM-DD). */
export const istanbulToday = (now = new Date()) => new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);

/** Belirli aralığın cirosu. */
export async function revenueRange(q: SqlQuery, from: string, to: string, now = new Date()): Promise<RevenueRange> {
  const [r] = await q<Row>(REVENUE_RANGE_SQL.replace("$1::date", `'${guard(from)}'::date`).replace("$2::date", `'${guard(to)}'::date`));
  return toRevenueRange(r, from, to, istanbulToday(now));
}

/** Tüm kaynakların tam olduğu son N gün (bitiş = allSourcesThrough). Tam gün yoksa null (ciro BİLİNMİYOR — 0 değil). */
export async function lastCompleteDays(q: SqlQuery, days: number, now = new Date()): Promise<RevenueRange | null> {
  const today = istanbulToday(now);
  const [f] = await q<Row>(REVENUE_FRESHNESS_SQL);
  const through = freshness(f, today).allSourcesThrough;
  if (!through) return null;
  return revenueRange(q, shiftDay(through, -(days - 1)), through, now);
}

/** Aylık hız (son N tam günün ortalaması × 30); veri yoksa null. */
export const monthlyRunRate = (r: RevenueRange | null, days: number) => (r == null ? null : (r.inclTry / days) * 30);

function guard(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`revenue: geçersiz gün ${d}`);
  return d;
}

/** Son TAM takvim ayı (İstanbul): bu ayın 1'inden önceki ay. */
export async function lastFullMonth(q: SqlQuery, now = new Date()): Promise<RevenueRange> {
  const today = istanbulToday(now);
  const end = shiftDay(`${today.slice(0, 8)}01`, -1);
  return revenueRange(q, `${end.slice(0, 8)}01`, end, now);
}

/** Saf: aylık ciro hedefi kartı (USD = TL ÷ stratejik kur). Hedef ya da kur yoksa null (BİLİNMİYOR — 100.000 USD / sabit kur yedeği yok). */
export function revenueTargetCard(m: RevenueRange, targetUsd: number | null, fxUsdTry: number | null) {
  if (targetUsd == null || !(targetUsd > 0) || fxUsdTry == null || !(fxUsdTry > 0)) return null;
  const ciroUsd = m.inclTry / fxUsdTry;
  return { ay: m.from.slice(0, 7), ciro_try: Math.round(m.inclTry), ciro_usd: Math.round(ciroUsd), hedef_usd: targetUsd,
    hedef_pct: Math.round((ciroUsd / targetUsd) * 1000) / 10, acik_usd: Math.round(targetUsd - ciroUsd),
    gereken_kat: ciroUsd > 0 ? Math.round((targetUsd / ciroUsd) * 100) / 100 : null, adet: null, complete: m.complete, kaynak: m.source };
}
