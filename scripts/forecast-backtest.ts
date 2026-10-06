import { Client } from "pg";
import { addDays } from "../lib/forecast/models";
import { BACKTEST_VERSION, CATASTROPHIC, cutoffSchedule, ECONOMIC_TIME_LABEL, HORIZON_DAYS } from "../lib/forecast/backtest";
import { BACKTEST_SESSION_PRELUDE, backtestSql, backtestSqlHash, type SqlParams } from "../lib/forecast/backtest-sql";

// Forecast backtest runner (READ-ONLY). Usage:
//   node --import tsx scripts/forecast-backtest.ts --today 2026-10-06 --print-sql long|waterfall|short|today|meta   (paste into a read-only session)
//   FORECAST_BACKTEST_DATABASE_URL=… node --import tsx scripts/forecast-backtest.ts --today 2026-10-06 > report.json
// Every statement runs inside BEGIN READ ONLY … ROLLBACK; the connection string is never printed. The report carries the version,
// cutoffs, SQL sha256, source watermarks and generated_at so a run can be reproduced (same data + same version ⇒ same numbers).
const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
export function productionSchedule(today: string, longFrom = "2024-10-08", shortFrom = "2026-06-16"): SqlParams {
  const lastDay = addDays(today, -1); // today's economic day is incomplete
  return { longCutoffs: cutoffSchedule(longFrom, lastDay, 14), shortCutoffs: cutoffSchedule(shortFrom, lastDay, 7), todayCutoff: today };
}

async function main() {
  const today = arg("today"); if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("--today YYYY-MM-DD required");
  const params = productionSchedule(today, arg("long-from"), arg("short-from"));
  const sql = backtestSql(params);
  const only = arg("print-sql");
  if (only) { if (!(only in sql)) throw new Error("unknown section"); process.stdout.write(`${BACKTEST_SESSION_PRELUDE.join(";\n")};\n${sql[only as keyof typeof sql]};\n`); return; }
  const url = process.env.FORECAST_BACKTEST_DATABASE_URL; if (!url) throw new Error("FORECAST_BACKTEST_DATABASE_URL missing");
  const client = new Client({ connectionString: url, application_name: "forecast-backtest", statement_timeout: 300000 });
  await client.connect();
  try {
    for (const statement of BACKTEST_SESSION_PRELUDE) await client.query(statement);
    const run = async (k: keyof typeof sql) => (await client.query(sql[k])).rows;
    const [meta] = await run("meta"), long = await run("long"), waterfall = await run("waterfall"), short = await run("short"), todayRows = await run("today");
    await client.query("ROLLBACK");
    process.stdout.write(JSON.stringify({ meta: { version: BACKTEST_VERSION, label: ECONOMIC_TIME_LABEL, horizonDays: HORIZON_DAYS, catastrophic: CATASTROPHIC,
      ...params, sqlSha256: backtestSqlHash(params), source: meta.meta, generatedAt: new Date().toISOString() },
      long, waterfall, short: short.filter(r => r.section === "short"), shortExclusions: JSON.parse(short.find(r => r.section === "short_exclusions")?.segment ?? "{}"),
      today: todayRows }, null, 2) + "\n");
  } finally { await client.end(); }
}
if (process.argv[1]?.endsWith("forecast-backtest.ts")) main().catch(e => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
