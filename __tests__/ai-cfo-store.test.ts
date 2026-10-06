import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { bootstrap, readBaselineConfig } from "../scripts/schema-baseline/bootstrap";

// AI CFO store (cfo_run / cfo_insight / cfo_usage) through the REAL Prisma client against PostgreSQL (PGlite behind a socket).
// Schema = production reproduction (baseline + production-applied migrations, incl. 20261005190000_ai_cfo_v1, applied in production
// 2026-10-06 by controlled SQL — step 8A; baseline.json appliedAfterCapture). The state before step 8 is reproduced first. Proves: idempotent period key, usage totals, insight CHECK constraints, cooldown recall.
// Run with: node --conditions=react-server --import tsx __tests__/ai-cfo-store.test.ts
async function main() {
  const pg = new PGlite({ extensions: { vector } });
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
  const res = await bootstrap({ exec: s => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
  const cfg = readBaselineConfig();
  const AI = "20261005190000_ai_cfo_v1";
  assert.ok(cfg.appliedAfterCapture?.includes(AI) && !cfg.notAppliedInProduction?.includes(AI), "ai_cfo_v1 is applied in production (step 8A)");
  assert.ok(!res.registered.includes(AI) && res.pendingInProduction.includes(AI), "not in the baseline SQL: bootstrap applies it after the capture");
  const apply = async (ms: string[]) => { for (const m of ms) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8")); };
  await apply(res.pendingInProduction.filter(m => m !== AI));
  const server = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
  await server.start();
  const conn = server.getServerConn();
  const url = conn.startsWith("postgres") ? conn : `postgresql://postgres:postgres@${conn}/postgres`;
  process.env.DATABASE_URL = url;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
  (globalThis as unknown as { _prismaClient: PrismaClient })._prismaClient = client;
  try {
    // /admin/ai-cfo without cfo_run/cfo_insight/cfo_usage (production before step 8) → explained state, never a query error
    const { loadCfoControlCenter } = await import("../lib/cfo-agent/control-center");
    assert.deepEqual(await loadCfoControlCenter(), { installed: false });
    await apply([AI]);
    const { cfoStore } = await import("../lib/cfo-agent/store");
    const now = new Date("2026-10-06T08:00:00Z");
    const id = await cfoStore.begin("monitor", "2026-10-06T11", now);
    assert.ok(id);
    // The duplicate-period path relies on a unique violation (P2002). Over the single PGlite socket a server-side error ends
    // the session, so the constraint is proven on the engine directly; the P2002 → null mapping is covered in the unit test.
    await assert.rejects(pg.query(`insert into cfo_run (id,type,status,"periodKey","idempotencyKey","triggerReasons","schemaVersion","calculationVersion")
      values ('dup','monitor','running','2026-10-06T11','monitor:2026-10-06T11','[]','2','v')`), /unique|duplicate/i);

    const anomaly = { id: "goal:revenue_month_usd", rule: "GOAL_OFF_TRACK", severity: "warning" as const, category: "sales" as const, entityType: "goal",
      entityId: "revenue_month_usd", period: "2026-10-01", fingerprint: "goal:revenue_month_usd:OFF_TRACK:2026-10-01", cooldownKey: "goal:revenue_month_usd:OFF_TRACK",
      evidenceIds: ["e_1"], actionable: true, impact: null, weight: 2, existingRecordIds: [] };
    const snap = { evidence: [{ id: "e_1", source: "fm_memory_goal", query: "revenue_month_usd.observed_try", value: 309926.92, unit: "TRY", asOf: "2026-10-06", measured: true }] };
    await cfoStore.snapshot(id!, snap as never, "hash", [anomaly], [anomaly]);
    const usageId = await cfoStore.usage(id!, { provider: "anthropic", model: "m", status: "reserved", triggerReason: "GOAL_OFF_TRACK", reservedCostTry: 1.5, priceContext: { a: 1 } });
    await cfoStore.updateUsage(usageId, { provider: "anthropic", model: "m", status: "completed", triggerReason: "GOAL_OFF_TRACK", inputTokens: 1000, outputTokens: 200, estimatedCost: 0.36, reservedCostTry: null });
    const totals = await cfoStore.totals(now);
    assert.deepEqual(totals, { callsToday: 1, spentThisMonth: 0.36 });
    await cfoStore.insights(id!, [{ anomalyId: anomaly.id, severity: "warning", category: "sales", title: "t", observation: "o", recommendation: "r", riskIfIgnored: "x",
      confidence: "medium", evidenceIds: ["e_1"] }], [anomaly], snap.evidence as never);
    await cfoStore.finish(id!, "completed", now, 0, null);
    const recent = await cfoStore.recent(anomaly.cooldownKey, new Date(now.getTime() + 3600000), 72);
    assert.ok(recent, "cooldown recalls the anomaly sent in a completed run");
    const rows = await client.$queryRawUnsafe<{ status: string; n: number }[]>(`select r.status, (select count(*)::int from cfo_insight i where i."runId"=r.id) n from cfo_run r`);
    assert.deepEqual(rows, [{ status: "completed", n: 1 }]);
    const center = await loadCfoControlCenter(now);
    assert.ok(center.installed);
    assert.equal(center.run?.status, "completed");
    assert.equal(center.insights.length, 1);
    assert.deepEqual(center.anomalies.map(a => a.id), [anomaly.id]);
    assert.equal(center.usage.callsToday, 1);
    assert.equal(center.usage.outputTokens, 200);
    // CHECK constraint: an invalid severity can never be stored
    // (run on the engine directly: an error through the single socket connection would end the PGlite socket session)
    await assert.rejects(pg.query(`insert into cfo_insight (id,"runId",severity,category,"entityType","entityId",fingerprint,"cooldownKey",title,observation,recommendation,"riskIfIgnored",confidence,evidence)
      values ('bad','${id}','fatal','sales','goal','x','f2','c','t','o','r','x','low','[]')`), /check/i);
    console.log("AI CFO store: idempotent run key, usage totals, insights + CHECK constraints, cooldown recall, control center (before/after step 8) passed (production reproduction incl. ai_cfo_v1)");
  } finally {
    await client.$disconnect().catch(() => undefined);
    await server.stop().catch(() => undefined);
    await pg.close();
  }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
