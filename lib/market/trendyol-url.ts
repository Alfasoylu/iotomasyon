// Pure parsers for Trendyol URLs that a USER provides (no network). Only fields that are literally present in the URL are extracted;
// nothing is fetched or guessed. Short links (ty.gl) and other hosts are rejected because resolving them would require a request.

const HOSTS = new Set(["www.trendyol.com", "trendyol.com", "m.trendyol.com"]);
const SLUG = /^[a-z0-9][a-z0-9-]{0,200}$/;

export interface ParsedTrendyolProduct { kind: "product"; contentId: string; brandSlug: string; titleSlug: string; merchantId: string | null; canonicalUrl: string }
export interface ParsedTrendyolStore { kind: "store"; sellerId: string; sellerSlug: string; canonicalUrl: string }
export type ParsedTrendyolUrl = ParsedTrendyolProduct | ParsedTrendyolStore;

function parse(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!HOSTS.has(u.hostname.toLowerCase()) || u.username || u.password) return null;
  return u;
}

export function parseTrendyolUrl(raw: string): ParsedTrendyolUrl | null {
  const u = parse(raw);
  if (!u) return null;
  const parts = u.pathname.split("/").filter(Boolean).map(p => decodeURIComponent(p).toLowerCase());
  const store = parts[0] === "magaza" && parts.length === 2 ? parts[1].match(/^(.+)-m-(\d{1,12})$/) : null;
  if (store && SLUG.test(store[1])) return { kind: "store", sellerSlug: store[1], sellerId: store[2], canonicalUrl: `https://www.trendyol.com/magaza/${store[1]}-m-${store[2]}` };
  if (parts.length === 2) {
    const prod = parts[1].match(/^(.+)-p-(\d{1,15})$/);
    if (prod && SLUG.test(parts[0]) && SLUG.test(prod[1])) {
      const m = u.searchParams.get("merchantId");
      return { kind: "product", brandSlug: parts[0], titleSlug: prod[1], contentId: prod[2], merchantId: m && /^\d{1,12}$/.test(m) ? m : null,
        canonicalUrl: `https://www.trendyol.com/${parts[0]}/${prod[1]}-p-${prod[2]}` };
    }
  }
  return null;
}

/** Store entries from sitemap_seller_store.xml: `<loc>https://www.trendyol.com/magaza/{slug}-m-{id}</loc>`. */
export function parseSellerSitemap(xml: string): { sellerId: string; sellerSlug: string; url: string }[] {
  const out: { sellerId: string; sellerSlug: string; url: string }[] = [];
  for (const m of xml.matchAll(/<loc>(https:\/\/www\.trendyol\.com\/magaza\/[^<]{1,300})<\/loc>/g)) {
    const p = parseTrendyolUrl(m[1]);
    if (p?.kind === "store") out.push({ sellerId: p.sellerId, sellerSlug: p.sellerSlug, url: p.canonicalUrl });
  }
  return out;
}

/** Product entries from sitemap_products*.xml: URL (brand slug, title slug, content id) and image URL. No seller, no price. */
export function parseProductSitemap(xml: string): { contentId: string; brandSlug: string; titleSlug: string; url: string; imageUrl: string | null }[] {
  const out: { contentId: string; brandSlug: string; titleSlug: string; url: string; imageUrl: string | null }[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]{0,5000}?)<\/url>/g)) {
    const loc = m[1].match(/<loc>([^<]{1,600})<\/loc>/)?.[1];
    const p = loc ? parseTrendyolUrl(loc) : null;
    if (p?.kind !== "product") continue;
    const img = m[1].match(/<image:loc>(https:\/\/cdn\.dsmcdn\.com\/[^<]{1,500})<\/image:loc>/)?.[1] ?? null;
    out.push({ contentId: p.contentId, brandSlug: p.brandSlug, titleSlug: p.titleSlug, url: p.canonicalUrl, imageUrl: img });
  }
  return out;
}
