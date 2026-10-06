import { FORECAST_V2_HORIZON_DAYS, forecastV2, type ForecastV2, type ForecastV2Aggregates } from "./v2";

// Forecast V2 loader: one read-only SELECT over fm_sales_canonical_snapshot (COUNTED, mapped product_id only), fm_stock_sku_day and Product.
// No legacy sales tables. Parity with the reference aggregation (aggregatesFromRows) is proven on PGlite in __tests__/forecast-v2.test.ts.
// $1 = as_of (date, exclusive: today's economic day is incomplete), $2 = product ids (text[]) or null for every product.
/** The V2 SELECT with the as_of date and product-id array as SQL expressions (bind parameters in the app, validated literals in reports). */
export const forecastV2Select = (asOf: string, ids: string) => `with p as (select id, coalesce(sku, '') as sku, "onlineSalesPotential" as manual from public."Product" where ${ids} is null or id = any(${ids})),
s as (select product_id as pid, economic_date as d, sum(units_counted)::float8 as u from public.fm_sales_canonical_snapshot
  where disposition = 'COUNTED' and product_id is not null and economic_date >= ${asOf} - 90 and economic_date < ${asOf} and (${ids} is null or product_id = any(${ids})) group by 1, 2),
fs as (select product_id as pid, min(economic_date) as fd from public.fm_sales_canonical_snapshot
  where disposition = 'COUNTED' and product_id is not null and units_counted > 0 and economic_date < ${asOf} and (${ids} is null or product_id = any(${ids})) group by 1),
agg as (select pid, coalesce(sum(u) filter (where d >= ${asOf} - 30), 0) as u30, coalesce(sum(u), 0) as u90 from s group by 1),
days as (select generate_series(${asOf} - ${FORECAST_V2_HORIZON_DAYS}, ${asOf} - 1, interval '1 day')::date as d),
sod as (select p.id as pid, dd.d, l.stock from p cross join days dd left join lateral (select case when x.economic_date = dd.d then x.units_open else x.units_eod end as stock
  from public.fm_stock_sku_day x where x.product_id = p.id and x.economic_date <= dd.d order by x.economic_date desc limit 1) l on true),
stk as (select o.pid, count(o.stock)::int as known, count(*) filter (where o.stock > 0)::int as ins, count(*) filter (where o.stock <= 0)::int as outd,
  coalesce(sum(s.u) filter (where o.stock > 0), 0)::float8 as uin from sod o left join s on s.pid = o.pid and s.d = o.d group by 1)
select p.id as "productId", p.sku as "sku", coalesce(a.u30, 0)::float8 as "units30", coalesce(a.u90, 0)::float8 as "units90", to_char(f.fd, 'YYYY-MM-DD') as "firstSaleDay",
  coalesce(k.known, 0) as "stockKnownDays", coalesce(k.ins, 0) as "inStockDays", coalesce(k.uin, 0)::float8 as "unitsOnInStockDays", coalesce(k.outd, 0) as "outOfStockDays",
  p.manual as "manualOverride",
  (select to_char(max(economic_date), 'YYYY-MM-DD') from public.fm_sales_canonical_snapshot where disposition = 'COUNTED' and economic_date < ${asOf}) as "watermark"
from p left join agg a on a.pid = p.id left join fs f on f.pid = p.id left join stk k on k.pid = p.id`;
export const FORECAST_V2_SQL = `${forecastV2Select("$1::date", "$2::text[]")} order by p.id`;

export type ForecastV2Row = ForecastV2Aggregates & { watermark: string | null };
export interface RawQuery { $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> }
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Istanbul calendar day of `now` (economic days are Europe/Istanbul). */
export function istanbulDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function rowsToForecasts(rows: ForecastV2Row[], asOf: string): Map<string, ForecastV2> {
  const out = new Map<string, ForecastV2>();
  for (const r of rows) out.set(r.productId, forecastV2({ ...r, units30: Number(r.units30), units90: Number(r.units90), stockKnownDays: Number(r.stockKnownDays),
    inStockDays: Number(r.inStockDays), unitsOnInStockDays: Number(r.unitsOnInStockDays), outOfStockDays: Number(r.outOfStockDays),
    manualOverride: r.manualOverride == null ? null : Number(r.manualOverride) }, asOf, r.watermark));
  return out;
}

/** Forecast V2 for the given products (or all) as of `asOf` (default: today in Istanbul). Read-only. */
export async function loadForecastV2(db: RawQuery, opts: { asOf?: string; productIds?: string[] } = {}): Promise<Map<string, ForecastV2>> {
  const asOf = opts.asOf ?? istanbulDay();
  if (!DAY.test(asOf)) throw new Error("invalid_as_of");
  const rows = await db.$queryRawUnsafe<ForecastV2Row[]>(FORECAST_V2_SQL, asOf, opts.productIds ?? null);
  return rowsToForecasts(rows, asOf);
}
