import { MARKET_FETCH_HOSTS, safeFetch, SafeFetchError, type SafeFetchOptions } from "../safe-fetch";
import { foldTr, concepts } from "../normalize";
import { parseProductSitemap, parseSellerSitemap, parseTrendyolUrl } from "../trendyol-url";
import { ensureMarketProduct, finishRun, idemKey, insertProductObservation, startRun, type Db } from "../store";

// Trendyol sitemaps (robots-allowed). What they CAN give: store directory (slug + numeric seller id) and product URL / content id /
// brand slug / image. What they CANNOT give: seller of a product, price, rating, reviews, sales signals, per-URL lastmod.
// Benchmark (2026-10-06): 333 product files, ~24.15k URLs each (~8.0M), 13.9 GB uncompressed / ~1.9 GB gzip; product ids are spread
// uniformly over ALL files (no id-sorted / newest file) → new-product detection needs a full pass; conditional GET (ETag / If-Modified-Since)
// returns 304 for unchanged files; ~3 req/s triggers 429 → throttle + backoff. No collector is scheduled by this PR.
export const SITEMAP_INDEX_URL = "https://www.trendyol.com/sitemap_index.xml";
export const SELLER_SITEMAP_URL = "https://www.trendyol.com/sitemap_seller_store.xml";
export const SITEMAP_MIN_INTERVAL_MS = 1500;
const UA = "iotomasyon-market-scout/1.0 (+https://iotomasyon.com)";

type Fetcher = (url: string, o: SafeFetchOptions) => Promise<{ status: number; headers: Record<string, string>; body: Buffer }>;
interface FetchDeps { fetcher?: Fetcher; sleep?: (ms: number) => Promise<void> }

async function getWithBackoff(url: string, deps: FetchDeps, extraHeaders: Record<string, string> = {}, maxBytes = 70_000_000) {
  const fetcher = deps.fetcher ?? safeFetch, sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    const r = await fetcher(url, { allowedHosts: MARKET_FETCH_HOSTS.trendyolSitemap, timeoutMs: 120_000, maxBytes,
      allowedContentTypes: ["text/xml", "application/xml"], headers: { "User-Agent": UA, ...extraHeaders } });
    if (r.status !== 429 || attempt >= 3) return r;
    const ra = Number(r.headers["retry-after"]);
    await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) * 1000 : 10_000 * (attempt + 1));
  }
}

/** Store directory from the seller sitemap. */
export async function fetchSellerDirectory(deps: FetchDeps = {}) {
  const r = await getWithBackoff(SELLER_SITEMAP_URL, deps, {}, 20_000_000);
  if (r.status !== 200) throw new SafeFetchError(`http_${r.status}`);
  return { etag: r.headers["etag"] ?? null, sellers: parseSellerSitemap(r.body.toString("utf8")) };
}

export const slugify = (s: string) => foldTr(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export interface SellerResolution { resolution: "SITEMAP" | "URL_PARSE" | "UNRESOLVED"; sellerId: string | null; sellerSlug: string | null; sellerUrl: string | null;
  candidates: { sellerId: string; sellerSlug: string }[]; evidence: Record<string, unknown> }
/** Resolve a watchlist entry. Only exact matches resolve; prefix matches are offered as candidates (never auto-picked). */
export function resolveSeller(input: { name: string; url?: string | null }, directory: { sellerId: string; sellerSlug: string; url: string }[] | null,
  directoryEtag: string | null = null): SellerResolution {
  const parsed = input.url ? parseTrendyolUrl(input.url) : null;
  if (parsed?.kind === "store") {
    const hit = directory?.find(s => s.sellerId === parsed.sellerId);
    return { resolution: hit ? "SITEMAP" : "URL_PARSE", sellerId: parsed.sellerId, sellerSlug: parsed.sellerSlug, sellerUrl: parsed.canonicalUrl, candidates: [],
      evidence: { from: "url", inSitemap: hit != null, sitemapEtag: directoryEtag } };
  }
  if (!directory) return { resolution: "UNRESOLVED", sellerId: null, sellerSlug: null, sellerUrl: null, candidates: [], evidence: { reason: "directory_unavailable" } };
  const slug = slugify(input.name);
  const exact = directory.filter(s => s.sellerSlug === slug);
  if (exact.length === 1) return { resolution: "SITEMAP", sellerId: exact[0].sellerId, sellerSlug: exact[0].sellerSlug, sellerUrl: exact[0].url, candidates: [],
    evidence: { from: "name_exact_slug", slug, sitemapEtag: directoryEtag } };
  const cands = (exact.length > 1 ? exact : directory.filter(s => slug.length >= 3 && s.sellerSlug.startsWith(slug))).slice(0, 5)
    .map(s => ({ sellerId: s.sellerId, sellerSlug: s.sellerSlug }));
  return { resolution: "UNRESOLVED", sellerId: null, sellerSlug: null, sellerUrl: null, candidates: cands, evidence: { from: "name", slug, ambiguous: exact.length > 1, sitemapEtag: directoryEtag } };
}

/** Cloudflare serves gzip responses with a WEAK validator (W/"…") but the origin answers 304 only to the STRONG form in If-None-Match
 *  (measured 2026-10-06: W/"x" → 200 full body, "x" → 304). Validators are therefore stored and sent in strong form. */
export const strongEtag = (etag: string) => etag.trim().replace(/^W\//i, "");

export interface SitemapScanOptions extends FetchDeps {
  files: string[];                         // e.g. ["https://www.trendyol.com/sitemap_products1.xml", ...]
  previousEtags?: Record<string, string>;  // from the last run → conditional GET (304 = skip)
  brandSlugs: string[];                    // brands DECLARED by the user for watched sellers
  keywordConcepts: string[];               // ALFAS concept ids (e.g. faucet, sink, basin, shower)
  trigger: "MANUAL" | "TEST";
  now?: () => Date;
}
/** Filtered product scan. Products are linked to a BRAND slug only; seller fields stay null (DB-enforced for TRENDYOL_SITEMAP). */
export async function scanProductSitemaps(db: Db, o: SitemapScanOptions) {
  const sleep = o.sleep ?? (ms => new Promise(r => setTimeout(r, ms))), now = o.now ?? (() => new Date());
  const runId = await startRun(db, "trendyol_sitemap", o.trigger === "TEST" ? "TEST" : "MANUAL");
  const brands = new Set(o.brandSlugs.map(b => b.toLowerCase())), kw = new Set(o.keywordConcepts);
  const etags: Record<string, string> = {};
  let files = 0, unchanged = 0, failed = 0, scanned = 0, matched = 0, newProducts = 0, bytes = 0;
  for (const [i, url] of o.files.entries()) {
    if (!/^https:\/\/www\.trendyol\.com\/sitemap_products\d{1,4}\.xml$/.test(url)) { failed++; continue; }
    if (i > 0) await sleep(SITEMAP_MIN_INTERVAL_MS);
    try {
      const prev = o.previousEtags?.[url];
      const r = await getWithBackoff(url, o, prev ? { "If-None-Match": strongEtag(prev) } : {});
      if (r.status === 304) { unchanged++; if (prev) etags[url] = strongEtag(prev); continue; }
      if (r.status !== 200) { failed++; continue; }
      files++; bytes += r.body.length;
      const etag = r.headers["etag"] ? strongEtag(r.headers["etag"]) : idemKey(url, r.body.length);
      etags[url] = etag;
      const observedAt = now().toISOString();
      for (const e of parseProductSitemap(r.body.toString("utf8"))) {
        scanned++;
        const titleConcepts = concepts(e.titleSlug.replace(/-/g, " "));
        if (!brands.has(e.brandSlug) && ![...titleConcepts].some(c => kw.has(c))) continue;
        matched++;
        const before = (await db.query(`select 1 from public.market_product where provider = 'TRENDYOL' and external_id = $1`, [e.contentId])).rows.length;
        const pid = await ensureMarketProduct(db, { provider: "TRENDYOL", externalId: e.contentId, url: e.url, brandSlug: e.brandSlug, titleSlug: e.titleSlug, source: "TRENDYOL_SITEMAP" });
        if (!before) newProducts++;
        await insertProductObservation(db, { productId: pid, source: "TRENDYOL_SITEMAP", observedAt, sourceUrl: url, imageUrl: e.imageUrl,
          evidence: { sitemapFile: url, etag, brandSlug: e.brandSlug, titleSlug: e.titleSlug }, idempotencyKey: idemKey("sitemap", e.contentId, etag) });
      }
    } catch { failed++; }
  }
  const status = failed === 0 ? (files === 0 && unchanged > 0 ? "SKIPPED_UNCHANGED" : "OK") : files + unchanged > 0 ? "PARTIAL" : "FAILED";
  await finishRun(db, runId, status, { requestedFiles: o.files.length, files, unchanged, failed, scanned, matched, newProducts, bytesDecompressed: bytes, etags });
  return { runId, status, files, unchanged, failed, scanned, matched, newProducts, bytesDecompressed: bytes, etags };
}
