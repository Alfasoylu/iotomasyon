import { numeric, type ShippingBand } from "./calculations";
import type { Row } from "./sources";

/** Options from the reviewed source profile / channel assumption table. All literals are validated before SQL use. */
export interface ShippingOptions {
  /** Channel whose bands apply when a channel has no own bands (cfo_kargo_kanal_varsayim '*'). */
  fallbackChannel?: string | null;
  /** Reviewed effective-date corrections: tariff version date → date it is valid from (e.g. measurement window start). */
  effectiveRemap?: Readonly<Record<string, string>>;
}
const CHANNEL = /^[A-Z][A-Z0-9_]{0,40}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Marketplace-fulfilled channels: the marketplace ships (fulfilment fee), so our contracted cargo cost never applies. */
export const MARKETPLACE_FULFILLED_CHANNELS: readonly string[] = Object.freeze(["AMAZON_FBA"]);
function checked(options: ShippingOptions) {
  const fallback = options.fallbackChannel ?? null;
  if (fallback != null && !CHANNEL.test(fallback)) throw new Error("invalid_shipping_fallback_channel");
  const remap = Object.entries(options.effectiveRemap ?? {});
  for (const [from, to] of remap) if (!DAY.test(from) || !DAY.test(to) || to > from) throw new Error("invalid_shipping_effective_remap");
  return { fallback, remap };
}
const standard = (r: Row) => r.min_try != null;
/** Channel whose standard bands price this channel's orders; `assumed` when the channel has none of its own. */
export function shippingChannelFor(rows: Row[], channel: string, options: ShippingOptions = {}): { channel: string; assumed: boolean } {
  const { fallback } = checked(options);
  if (!rows.some(r => "channel" in r) || rows.some(r => standard(r) && r.channel === channel) || !fallback
    || MARKETPLACE_FULFILLED_CHANNELS.includes(channel)) return { channel, assumed: false };
  return { channel: fallback, assumed: fallback !== channel };
}

/** Standard outbound tariffs only; returns/faulty shipments lack a lower bound. */
export function shippingBandsFor(rows: Row[], channel: string, day: string, options: ShippingOptions = {}): ShippingBand[] {
  const remap = new Map(checked(options).remap);
  const date = (r: Row) => {
    if (r.effective_from == null || !Number.isFinite(Date.parse(String(r.effective_from)))) return null;
    const d = new Date(String(r.effective_from)).toISOString().slice(0, 10);
    return remap.get(d) ?? d;
  };
  const selected = rows.filter(r => standard(r) && (!("channel" in r) || r.channel === channel)
    && (!("effective_from" in r) || (date(r) != null && date(r)! <= day)));
  if (selected.some(r => numeric(r.min_try) == null || numeric(r.kargo_try) == null
    || numeric(r.min_try)! < 0 || numeric(r.kargo_try)! < 0
    || (r.max_try != null && (numeric(r.max_try) == null || numeric(r.max_try)! <= numeric(r.min_try)!)))) return [];
  const latest = new Map<string, string>();
  const key = (r: Row) => `${numeric(r.min_try)}|${numeric(r.max_try) ?? "open"}`;
  for (const r of selected) latest.set(key(r), [latest.get(key(r)) ?? "", date(r) ?? ""].sort().at(-1)!);
  return selected.filter(r => (date(r) ?? "") === latest.get(key(r))).map(r => ({ min: numeric(r.min_try)!, max: numeric(r.max_try), shipping: numeric(r.kargo_try)! }));
}

/** Same date/channel selection in SQL, then one order-grain cost allocation. */
export function shippingTariffSql(cols: Record<string, string>, orderGross: string, channel: string, localTime: string,
  scope: { channel: string | null; effectiveFrom: string | null }, options: ShippingOptions = {}) {
  if (scope.channel && !scope.effectiveFrom) return "null::numeric";
  const { fallback, remap } = checked(options);
  const effective = (alias: string) => scope.effectiveFrom ? (remap.length
    ? `(case ${alias}.${scope.effectiveFrom}::date ${remap.map(([from, to]) => `when '${from}'::date then '${to}'::date`).join(" ")} else ${alias}.${scope.effectiveFrom}::date end)`
    : `${alias}.${scope.effectiveFrom}::date`) : "";
  // A channel without its own standard bands is priced with the assumed channel's bands (never another arbitrary channel).
  const priced = scope.channel && fallback ? `(case when (${channel}) in (${MARKETPLACE_FULFILLED_CHANNELS.map(c => `'${c}'`).join(",")})
    or exists (select 1 from cfo_kargo_tarife x where x.${scope.channel}=(${channel}) and x.${cols.min_try} is not null)
    then (${channel}) else '${fallback}' end)` : `(${channel})`;
  const where = scope.channel ? `t.${scope.channel}=${priced} and ${effective("t")}<=(${localTime})::date` : "true";
  const version = scope.effectiveFrom ? `dense_rank() over(partition by t.${cols.min_try},t.${cols.max_try}
    order by ${effective("t")} desc)` : "1";
  return `(select case when count(*)=1 and min(t.${cols.kargo_try}::numeric)>=0 then max(t.${cols.kargo_try}::numeric) end
    from (select t.*,${version} as agent_tariff_version from cfo_kargo_tarife t where ${where}) t
    where t.agent_tariff_version=1 and t.${cols.min_try}>=0 and (${orderGross})>=t.${cols.min_try}
    and (t.${cols.max_try} is null or (${orderGross})<t.${cols.max_try}))`;
}

/** cfo_kargo_kanal_varsayim → channel whose tariff applies to every marketplace. Unknown bases give no assumption. */
const COST_BASIS_CHANNEL: Readonly<Record<string, string>> = Object.freeze({ TRENDYOL_ANLASMALI: "TRENDYOL" });
export function assumedShippingChannel(rows: Row[] | null): string | null {
  const wildcard = (rows ?? []).filter(r => r.channel === "*");
  return wildcard.length === 1 ? COST_BASIS_CHANNEL[String(wildcard[0].cost_basis)] ?? null : null;
}
