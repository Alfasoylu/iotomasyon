// Deterministic competitor momentum from a TIME SERIES of public observations (never from a single snapshot). No look-ahead: only
// observations with known_at <= asOf (and observed_at <= asOf) are used. Output is DERIVED (grade C) and never an exact sales figure.
export const MOMENTUM_VERSION = "momentum-v1";

export interface MomentumPoint { observedAt: string; knownAt: string; price?: number | null; reviewCount?: number | null; rating?: number | null;
  publicSalesSignal?: string | null; availability?: string | null }
export interface Momentum {
  version: typeof MOMENTUM_VERSION; asOf: string; points: number; spanDays: number | null;
  reviewVelocityPer7d: number | null; reviewGrowthPct: number | null; priceChangePct: number | null;
  salesSignalLowerBoundFirst: number | null; salesSignalLowerBoundLast: number | null; salesSignalDirection: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
  availabilityPersistence: number | null; direction: "RISING" | "FLAT" | "FALLING" | "UNKNOWN"; dataGrade: "C" | "UNKNOWN"; reasons: string[];
}

/** Lower bound of a visible public sales signal such as "100+ ürün satıldı" / "1B+" (TR "bin" = 1000). Never an exact count. */
export function salesSignalLowerBound(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.toLowerCase().replace(/\./g, "").match(/(\d+(?:,\d+)?)\s*(b|bin|k)?\s*\+/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Math.round(m[2] ? n * 1000 : n);
}

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
export function computeMomentum(all: MomentumPoint[], asOf: string, windowDays = 60): Momentum {
  const asOfMs = Date.parse(asOf), fromMs = asOfMs - windowDays * 86_400_000;
  const pts = all.filter(p => Date.parse(p.knownAt) <= asOfMs && Date.parse(p.observedAt) <= asOfMs && Date.parse(p.observedAt) >= fromMs)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || Date.parse(a.knownAt) - Date.parse(b.knownAt));
  const base: Momentum = { version: MOMENTUM_VERSION, asOf, points: pts.length, spanDays: null, reviewVelocityPer7d: null, reviewGrowthPct: null,
    priceChangePct: null, salesSignalLowerBoundFirst: null, salesSignalLowerBoundLast: null, salesSignalDirection: "UNKNOWN",
    availabilityPersistence: null, direction: "UNKNOWN", dataGrade: "UNKNOWN", reasons: [] };
  if (pts.length < 2) return { ...base, reasons: ["INSUFFICIENT_OBSERVATIONS"] };
  const first = pts[0], last = pts[pts.length - 1], span = days(first.observedAt, last.observedAt);
  if (span < 1) return { ...base, spanDays: span, reasons: ["SPAN_LT_1_DAY"] };
  const rev = pts.filter(p => p.reviewCount != null), price = pts.filter(p => p.price != null && p.price > 0);
  const sig = pts.map(p => salesSignalLowerBound(p.publicSalesSignal)).filter((x): x is number => x != null);
  const av = pts.filter(p => p.availability != null);
  const r: Momentum = { ...base, spanDays: span, dataGrade: "C" };
  if (rev.length >= 2 && days(rev[0].observedAt, rev[rev.length - 1].observedAt) >= 1) {
    const d = rev[rev.length - 1].reviewCount! - rev[0].reviewCount!, dd = days(rev[0].observedAt, rev[rev.length - 1].observedAt);
    r.reviewVelocityPer7d = d / dd * 7;
    r.reviewGrowthPct = rev[0].reviewCount! > 0 ? d / rev[0].reviewCount! : null;
  } else r.reasons.push("REVIEW_SERIES_INSUFFICIENT");
  if (price.length >= 2) r.priceChangePct = (price[price.length - 1].price! - price[0].price!) / price[0].price!; else r.reasons.push("PRICE_SERIES_INSUFFICIENT");
  if (sig.length >= 2) {
    r.salesSignalLowerBoundFirst = sig[0]; r.salesSignalLowerBoundLast = sig[sig.length - 1];
    r.salesSignalDirection = sig[sig.length - 1] > sig[0] ? "UP" : sig[sig.length - 1] < sig[0] ? "DOWN" : "FLAT";
  }
  if (av.length) r.availabilityPersistence = av.filter(p => !/tukendi|tükendi|out of stock|stokta yok/i.test(p.availability!)).length / av.length;
  if (r.reviewVelocityPer7d == null && r.salesSignalDirection === "UNKNOWN") r.direction = "UNKNOWN";
  else if ((r.reviewVelocityPer7d ?? 0) >= 3 || r.salesSignalDirection === "UP") r.direction = "RISING";
  else if (r.salesSignalDirection === "DOWN") r.direction = "FALLING";
  else r.direction = "FLAT";
  return r;
}
