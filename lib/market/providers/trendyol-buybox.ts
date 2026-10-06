import { MARKET_FETCH_HOSTS, safeFetch, SafeFetchError, type SafeFetchOptions } from "../safe-fetch";
import { finishRun, insertBuyboxObservations, startRun, type BuyboxRow, type Db } from "../store";

// Official Trendyol "product buybox check" (Seller API, our own credentials, OUR barcodes only).
// POST https://apigw.trendyol.com/integration/product/sellers/{sellerId}/products/buybox-information  body {"barcodes":[≤10]}, header storeFrontCode.
// Documented limits: 10 barcodes/request, 1000 requests/min. Output = buybox rank/prices for our listing; it is NOT competitor sales.
export const BUYBOX_BATCH = 10;
export const BUYBOX_MIN_INTERVAL_MS = 250; // ≤ 240 req/min — far below the documented 1000/min
export interface BuyboxConfig { sellerId: string; apiKey: string; apiSecret: string; storeFrontCode: string }

export function chunkBarcodes(barcodes: string[]): string[][] {
  const uniq = [...new Set(barcodes.map(b => b.trim()).filter(b => /^[A-Za-z0-9._-]{4,40}$/.test(b)))].sort();
  const out: string[][] = [];
  for (let i = 0; i < uniq.length; i += BUYBOX_BATCH) out.push(uniq.slice(i, i + BUYBOX_BATCH));
  return out;
}

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
/** Validates the provider response; malformed entries are dropped (counted), never coerced. Only requested barcodes are accepted. */
export function parseBuyboxResponse(json: unknown, requested: string[], observedAt: string): { rows: BuyboxRow[]; dropped: number } {
  const list = (json as { buyboxInfo?: unknown })?.buyboxInfo;
  if (!Array.isArray(list)) return { rows: [], dropped: 0 };
  const want = new Set(requested), rows: BuyboxRow[] = [];
  let dropped = 0;
  for (const e of list) {
    const o = e as Record<string, unknown>;
    if (typeof o?.barcode !== "string" || !want.has(o.barcode)) { dropped++; continue; }
    const order = typeof o.buyboxOrder === "number" && Number.isInteger(o.buyboxOrder) && o.buyboxOrder > 0 ? o.buyboxOrder : null;
    rows.push({ barcode: o.barcode, observedAt, ourBuyboxRank: order, buyboxPrice: num(o.buyboxPrice),
      multipleSellers: typeof o.hasMultipleSeller === "boolean" ? o.hasMultipleSeller : null, secondPrice: num(o.secondBuyboxPrice), thirdPrice: num(o.thirdBuyboxPrice),
      raw: { barcode: o.barcode, buyboxOrder: o.buyboxOrder ?? null, buyboxPrice: o.buyboxPrice ?? null, hasMultipleSeller: o.hasMultipleSeller ?? null,
        secondBuyboxPrice: o.secondBuyboxPrice ?? null, thirdBuyboxPrice: o.thirdBuyboxPrice ?? null } });
  }
  return { rows, dropped };
}

type Fetcher = (url: string, o: SafeFetchOptions) => Promise<{ status: number; body: Buffer }>;
/** Collect buybox for the given barcodes. Manual/test trigger only in this PR (no schedule). Provider errors degrade to a FAILED/PARTIAL run. */
export async function collectBuybox(db: Db, cfg: BuyboxConfig, barcodes: string[], opts: { trigger: "MANUAL" | "TEST"; fetcher?: Fetcher; sleep?: (ms: number) => Promise<void>; now?: () => Date } = { trigger: "MANUAL" }) {
  const fetcher: Fetcher = opts.fetcher ?? safeFetch, sleep = opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms))), now = opts.now ?? (() => new Date());
  if (!/^\d{1,12}$/.test(cfg.sellerId) || !/^[A-Z]{2}$/.test(cfg.storeFrontCode)) throw new Error("buybox_config_invalid");
  const runId = await startRun(db, "trendyol_buybox", opts.trigger === "TEST" ? "TEST" : "MANUAL");
  const batches = chunkBarcodes(barcodes);
  let requests = 0, ok = 0, failed = 0, inserted = 0, dropped = 0;
  const errors: string[] = [];
  for (const batch of batches) {
    if (requests > 0) await sleep(BUYBOX_MIN_INTERVAL_MS);
    requests++;
    try {
      const r = await fetcher(`https://apigw.trendyol.com/integration/product/sellers/${cfg.sellerId}/products/buybox-information`, {
        allowedHosts: MARKET_FETCH_HOSTS.trendyolApi, method: "POST", timeoutMs: 20_000, maxBytes: 1_000_000, allowedContentTypes: ["application/json"],
        headers: { Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}`, "Content-Type": "application/json",
          "User-Agent": `iotomasyon-market-scout/1.0 (${cfg.sellerId})`, storeFrontCode: cfg.storeFrontCode },
        body: JSON.stringify({ barcodes: batch }),
      });
      if (r.status !== 200) { failed++; errors.push(`http_${r.status}`); continue; }
      let json: unknown;
      try { json = JSON.parse(r.body.toString("utf8")); } catch { failed++; errors.push("invalid_json"); continue; }
      const p = parseBuyboxResponse(json, batch, now().toISOString());
      dropped += p.dropped;
      inserted += await insertBuyboxObservations(db, p.rows, runId);
      ok++;
    } catch (e) { failed++; errors.push(e instanceof SafeFetchError ? e.code : "network_error"); }
  }
  const status = failed === 0 ? "OK" : ok > 0 ? "PARTIAL" : "FAILED";
  // credentials are never part of stats/errors
  await finishRun(db, runId, status, { barcodes: barcodes.length, batches: batches.length, requests, ok, failed, inserted, dropped, errors: [...new Set(errors)] },
    failed ? [...new Set(errors)][0] : null);
  return { runId, status, requests, ok, failed, inserted, dropped };
}
