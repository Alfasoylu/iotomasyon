import { z } from "zod";
import { parseTrendyolUrl } from "../trendyol-url";
import { ensureMarketProduct, insertManualSourcing, insertProductObservation, type Db } from "../store";

// MANUAL_BROWSER_CAPTURE and MANUAL_SOURCING. A person viewed a page in their normal browser session and typed / pasted what they saw.
// The server NEVER fetches the page. Every capture APPENDS a new observation (a duplicate submit of the same values is idempotent).
// The same input shape is what a future browser extension / bookmarklet / licensed provider would post (source differs, provenance kept).
// All free text is untrusted DATA (stored verbatim with length limits, control characters stripped, never used as instructions).

const clean = (max: number) => z.string().transform(s => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()).pipe(z.string().max(max));
const empty = (v: unknown) => (v === "" || v == null ? undefined : v);
const optText = (max: number) => z.preprocess(empty, clean(max).optional());
const optNum = (min: number, max: number) => z.preprocess(empty, z.coerce.number().finite().min(min).max(max).optional());
const optInt = (min: number, max: number) => z.preprocess(empty, z.coerce.number().int().min(min).max(max).optional());
const isoOrNow = z.preprocess(empty, z.string().datetime({ offset: true }).optional());

export const ManualCaptureSchema = z.object({
  productUrl: clean(600),
  sellerName: optText(200),
  sellerUrl: optText(600),
  title: optText(500),
  price: optNum(0, 10_000_000),
  currency: z.preprocess(empty, z.enum(["TRY", "USD", "EUR"]).optional()),
  rating: optNum(0, 5),
  reviewCount: optInt(0, 100_000_000),
  publicSalesSignal: optText(200),
  badge: optText(200),
  ranking: optText(200),
  availability: optText(100),
  imageUrl: optText(600),
  notes: optText(2000),
  observedAt: isoOrNow,
});
export type ManualCaptureInput = z.input<typeof ManualCaptureSchema>;

const IMAGE_HOSTS = new Set(["cdn.dsmcdn.com"]);
function safeImageUrl(u: string | null): string | null {
  if (!u) return null;
  try { const x = new URL(u); return x.protocol === "https:" && IMAGE_HOSTS.has(x.hostname) ? x.toString() : null; } catch { return null; }
}

/** Records a manual capture. Returns the observation id; the parsed URL supplies product identity (content id / brand slug) — nothing is fetched. */
export async function recordManualCapture(db: Db, raw: ManualCaptureInput, capturedBy: string, now: () => Date = () => new Date()) {
  const x = ManualCaptureSchema.parse(raw);
  const p = parseTrendyolUrl(x.productUrl);
  if (p?.kind !== "product") throw new Error("invalid_trendyol_product_url");
  const store = x.sellerUrl ? parseTrendyolUrl(x.sellerUrl) : null;
  const sellerExternalId = store?.kind === "store" ? store.sellerId : p.merchantId;
  const knownNow = now();
  const observedAt = x.observedAt && Date.parse(x.observedAt) <= knownNow.getTime() ? new Date(x.observedAt).toISOString() : knownNow.toISOString();
  const productId = await ensureMarketProduct(db, { provider: "TRENDYOL", externalId: p.contentId, url: p.canonicalUrl, brandSlug: p.brandSlug, titleSlug: p.titleSlug,
    source: "MANUAL_BROWSER_CAPTURE" });
  const imageUrl = safeImageUrl(x.imageUrl ?? null);
  const res = await insertProductObservation(db, { productId, source: "MANUAL_BROWSER_CAPTURE", observedAt, sourceUrl: p.canonicalUrl, sellerName: x.sellerName,
    sellerExternalId, rawTitle: x.title, price: x.price, currency: x.price != null ? (x.currency ?? "TRY") : null, rating: x.rating, reviewCount: x.reviewCount,
    publicSalesSignal: x.publicSalesSignal, badge: x.badge, ranking: x.ranking, availability: x.availability, imageUrl, notes: x.notes, capturedBy,
    evidence: { capture: "MANUAL_BROWSER_CAPTURE", url: x.productUrl, parsed: p, sellerUrl: x.sellerUrl, imageUrlRejected: x.imageUrl && !imageUrl ? x.imageUrl : null,
      salesSignalIsExact: false } });
  return { productId, observationId: res.id, inserted: res.inserted };
}

const SOURCING_HOSTS: Record<string, "ALIBABA" | "1688" | "MADE_IN_CHINA"> = {
  "www.alibaba.com": "ALIBABA", "alibaba.com": "ALIBABA", "m.alibaba.com": "ALIBABA", "detail.1688.com": "1688", "www.1688.com": "1688", "1688.com": "1688",
  "www.made-in-china.com": "MADE_IN_CHINA", "made-in-china.com": "MADE_IN_CHINA",
};
export const ManualSourcingSchema = z.object({
  sourceUrl: clean(800),
  supplierName: optText(300),
  supplierLocation: optText(200),
  title: optText(500),
  displayedPriceMin: optNum(0, 10_000_000),
  displayedPriceMax: optNum(0, 10_000_000),
  currency: z.preprocess(empty, z.enum(["USD", "CNY", "EUR", "TRY"]).optional()),
  moq: optInt(1, 100_000_000),
  material: optText(200),
  dimensions: optText(200),
  imageUrl: optText(800),
  notes: optText(2000),
  opportunityId: z.preprocess(empty, z.string().uuid().optional()),
  observedAt: isoOrNow,
});
export type ManualSourcingInput = z.input<typeof ManualSourcingSchema>;

/** Records a manual sourcing candidate. Displayed price stays "displayed"; landed cost is UNKNOWN (DB-enforced for MANUAL_SOURCING). */
export async function recordManualSourcing(db: Db, raw: ManualSourcingInput, createdBy: string, now: () => Date = () => new Date()) {
  const x = ManualSourcingSchema.parse(raw);
  let provider: "ALIBABA" | "1688" | "MADE_IN_CHINA" | "OTHER" = "OTHER";
  try { const u = new URL(x.sourceUrl); if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(); provider = SOURCING_HOSTS[u.hostname.toLowerCase()] ?? "OTHER"; }
  catch { throw new Error("invalid_sourcing_url"); }
  if (x.displayedPriceMin != null && x.displayedPriceMax != null && x.displayedPriceMin > x.displayedPriceMax) throw new Error("price_range_invalid");
  const knownNow = now();
  const observedAt = x.observedAt && Date.parse(x.observedAt) <= knownNow.getTime() ? new Date(x.observedAt).toISOString() : knownNow.toISOString();
  return insertManualSourcing(db, { provider, observedAt, sourceUrl: x.sourceUrl, supplierName: x.supplierName, supplierLocation: x.supplierLocation, title: x.title,
    displayedPriceMin: x.displayedPriceMin, displayedPriceMax: x.displayedPriceMax, currency: x.currency, moq: x.moq, material: x.material, dimensions: x.dimensions,
    imageUrl: x.imageUrl, notes: x.notes, opportunityId: x.opportunityId, createdBy });
}
