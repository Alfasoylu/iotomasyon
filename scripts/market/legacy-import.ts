import { Client } from "pg";
import { applyLegacyImport, mapLegacyScout, readLegacyScout } from "../../lib/market/legacy-scout";
import type { Db } from "../../lib/market/store";

// Legacy scout (candidates / scores / signals_daily / decisions) → market_opportunity mapping. Legacy tables are only SELECTed.
// Dry run by default (prints the mapping summary). --apply writes market_* rows (idempotent) and requires migration 20261007100000 + approval.
//   MARKET_SCOUT_DATABASE_URL=… node --import tsx scripts/market/legacy-import.ts [--apply]
async function main() {
  const url = process.env.MARKET_SCOUT_DATABASE_URL; if (!url) throw new Error("MARKET_SCOUT_DATABASE_URL missing");
  const client = new Client({ connectionString: url, application_name: "market-scout-legacy-import" });
  await client.connect();
  try {
    const db: Db = { query: async (sql, params) => ({ rows: (await client.query(sql, params as unknown[])).rows }) };
    const mapped = mapLegacyScout(await readLegacyScout(db));
    const byState: Record<string, number> = {};
    for (const m of mapped) byState[m.state] = (byState[m.state] ?? 0) + 1;
    const summary = { candidates: mapped.length, byState, humanDecisions: mapped.reduce((s, m) => s + m.decisions.length, 0), legacyWriter: "UNKNOWN" };
    if (!process.argv.includes("--apply")) { process.stdout.write(JSON.stringify({ dryRun: true, ...summary }, null, 2) + "\n"); return; }
    process.stdout.write(JSON.stringify({ ...summary, result: await applyLegacyImport(db, mapped, "legacy-import-script") }, null, 2) + "\n");
  } finally { await client.end(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
