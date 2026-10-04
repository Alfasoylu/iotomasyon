import { numeric, type ShippingBand } from "./calculations";
import type { Row } from "./sources";

/** Standard outbound tariffs only; returns/faulty shipments lack a lower bound. */
export function shippingBandsFor(rows: Row[], channel: string, day: string): ShippingBand[] {
  const selected = rows.filter(r => r.min_try != null && (!("channel" in r) || r.channel === channel)
    && (!("effective_from" in r) || (r.effective_from != null && Number.isFinite(Date.parse(String(r.effective_from))) && new Date(String(r.effective_from)).toISOString().slice(0, 10) <= day)));
  if (selected.some(r => numeric(r.min_try) == null || numeric(r.kargo_try) == null
    || numeric(r.min_try)! < 0 || numeric(r.kargo_try)! < 0
    || (r.max_try != null && (numeric(r.max_try) == null || numeric(r.max_try)! <= numeric(r.min_try)!)))) return [];
  const latest = new Map<string, string>();
  const date = (r: Row) => r.effective_from == null ? "" : new Date(String(r.effective_from)).toISOString().slice(0, 10);
  const key = (r: Row) => `${numeric(r.min_try)}|${numeric(r.max_try) ?? "open"}`;
  for (const r of selected) latest.set(key(r), [latest.get(key(r)) ?? "", date(r)].sort().at(-1)!);
  return selected.filter(r => date(r) === latest.get(key(r))).map(r => ({ min: numeric(r.min_try)!, max: numeric(r.max_try), shipping: numeric(r.kargo_try)! }));
}

/** Same date/channel selection in SQL, then one order-grain cost allocation. */
export function shippingTariffSql(cols: Record<string, string>, orderGross: string, channel: string, localTime: string,
  scope: { channel: string | null; effectiveFrom: string | null }) {
  if (scope.channel && !scope.effectiveFrom) return "null::numeric";
  const where = scope.channel ? `t.${scope.channel}=(${channel}) and t.${scope.effectiveFrom!}::date<=(${localTime})::date` : "true";
  const version = scope.effectiveFrom ? `dense_rank() over(partition by t.${cols.min_try},t.${cols.max_try}
    order by t.${scope.effectiveFrom}::date desc)` : "1";
  return `(select case when count(*)=1 and min(t.${cols.kargo_try}::numeric)>=0 then max(t.${cols.kargo_try}::numeric) end
    from (select t.*,${version} as agent_tariff_version from cfo_kargo_tarife t where ${where}) t
    where t.agent_tariff_version=1 and t.${cols.min_try}>=0 and (${orderGross})>=t.${cols.min_try}
    and (t.${cols.max_try} is null or (${orderGross})<t.${cols.max_try}))`;
}
