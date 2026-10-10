import { Client } from "pg";
import { collectBuybox, chunkBarcodes } from "../../lib/market/providers/trendyol-buybox";
import type { Db } from "../../lib/market/store";
import { decryptSecret } from "../../lib/crypto/secret-box";

// Manual buybox collection for OUR active barcodes (NOT scheduled). Dry run by default: prints counts only.
//   MARKET_SCOUT_DATABASE_URL=… MARKET_SCOUT_TRENDYOL_STOREFRONT_CODE=XX node --import tsx scripts/market/buybox-collect.ts [--apply]
// Credentials are read from TrendyolConfig inside this process and are never printed or logged. Requires migration 20261007100000.
async function main() {
  const url = process.env.MARKET_SCOUT_DATABASE_URL; if (!url) throw new Error("MARKET_SCOUT_DATABASE_URL missing");
  const client = new Client({ connectionString: url, application_name: "market-scout-buybox" });
  await client.connect();
  try {
    const db: Db = { query: async (sql, params) => ({ rows: (await client.query(sql, params as unknown[])).rows }) };
    const barcodes = (await db.query<{ barcode: string }>(`select barcode from public."Product" where "isActive" and barcode is not null`)).rows.map(r => r.barcode);
    const batches = chunkBarcodes(barcodes).length;
    if (!process.argv.includes("--apply")) { process.stdout.write(JSON.stringify({ dryRun: true, barcodes: barcodes.length, requests: batches }) + "\n"); return; }
    const cfg = (await db.query<{ supplierId: string; apiKey: string; apiSecret: string }>(`select "supplierId", "apiKey", "apiSecret" from public."TrendyolConfig" where "isEnabled" limit 1`)).rows[0];
    const store = process.env.MARKET_SCOUT_TRENDYOL_STOREFRONT_CODE ?? "";
    if (!cfg || !/^[A-Z]{2}$/.test(store)) throw new Error("buybox_not_configured");
    const r = await collectBuybox(db, { sellerId: cfg.supplierId, apiKey: decryptSecret(cfg.apiKey), apiSecret: decryptSecret(cfg.apiSecret), storeFrontCode: store }, barcodes, { trigger: "MANUAL" });
    process.stdout.write(JSON.stringify(r) + "\n");
  } finally { await client.end(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
