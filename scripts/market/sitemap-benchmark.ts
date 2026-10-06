import { safeFetch, MARKET_FETCH_HOSTS } from "../../lib/market/safe-fetch";
import { parseProductSitemap } from "../../lib/market/trendyol-url";
import { concepts } from "../../lib/market/normalize";
import { SITEMAP_MIN_INTERVAL_MS, strongEtag } from "../../lib/market/providers/trendyol-sitemap";

// READ-ONLY benchmark of the Trendyol product sitemaps (no DB). Usage:
//   node --import tsx scripts/market/sitemap-benchmark.ts --sample 1,100,200,333 [--head-sweep]
// Measures: per-file gzip bytes / decompressed bytes / seconds, URL count, content-id min/max/median and whether ids are sorted,
// ALFAS-relevant URL count, conditional GET (If-None-Match → 304), and optionally HEAD metadata for all files (ETag / Last-Modified / size).
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "iotomasyon-market-scout/1.0 (+https://iotomasyon.com)" };
const ALFAS = new Set(["faucet", "shower", "sink", "basin"]);

async function main() {
  const index = await safeFetch("https://www.trendyol.com/sitemap_index.xml", { allowedHosts: MARKET_FETCH_HOSTS.trendyolSitemap, maxBytes: 5_000_000, headers: UA });
  const files = [...index.body.toString("utf8").matchAll(/<loc>(https:\/\/www\.trendyol\.com\/sitemap_products\d+\.xml)<\/loc>/g)].map(m => m[1]);
  const out: Record<string, unknown> = { productFiles: files.length };
  const sample = (arg("sample") ?? "1").split(",").map(Number).filter(n => n > 0);
  const per: unknown[] = [];
  for (const n of sample) {
    const url = `https://www.trendyol.com/sitemap_products${n}.xml`, t = Date.now();
    const r = await safeFetch(url, { allowedHosts: MARKET_FETCH_HOSTS.trendyolSitemap, maxBytes: 70_000_000, timeoutMs: 120_000, headers: UA });
    const entries = parseProductSitemap(r.body.toString("utf8")), ids = entries.map(e => Number(e.contentId));
    const sorted = [...ids].sort((a, b) => a - b);
    const cond = r.headers.etag ? (await safeFetch(url, { allowedHosts: MARKET_FETCH_HOSTS.trendyolSitemap, maxBytes: 70_000_000, headers: { ...UA, "If-None-Match": strongEtag(r.headers.etag) } })).status : null;
    per.push({ file: n, decompressedBytes: r.body.length, seconds: (Date.now() - t) / 1000, urls: entries.length, idMin: sorted[0], idMax: sorted.at(-1),
      idMedian: sorted[Math.floor(sorted.length / 2)], idsSortedInFile: ids.every((x, i) => i === 0 || ids[i - 1] <= x),
      relevant: entries.filter(e => [...concepts(e.titleSlug.replace(/-/g, " "))].some(c => ALFAS.has(c))).length, etag: r.headers.etag ?? null, conditionalStatus: cond });
    await sleep(SITEMAP_MIN_INTERVAL_MS);
  }
  out.sample = per;
  if (process.argv.includes("--head-sweep")) {
    const heads: unknown[] = [];
    for (const url of files) {
      const r = await safeFetch(url, { allowedHosts: MARKET_FETCH_HOSTS.trendyolSitemap, method: "HEAD", headers: UA }).catch(e => ({ status: -1, headers: { error: String(e) } as Record<string, string> }));
      heads.push({ url, status: r.status, size: r.headers["content-length"] ?? null, lastModified: r.headers["last-modified"] ?? null, etag: r.headers.etag ?? null });
      await sleep(SITEMAP_MIN_INTERVAL_MS);
    }
    out.heads = heads;
  }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
main().catch(e => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
