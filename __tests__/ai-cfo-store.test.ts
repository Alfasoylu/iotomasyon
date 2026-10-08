import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { bootstrap, readBaselineConfig } from "../scripts/schema-baseline/bootstrap";

// CFO engine store (cfo_run) + cfo_gun_ozeti through the REAL Prisma client against PostgreSQL (PGlite behind a socket).
// Schema = production reproduction (baseline + production-applied migrations, incl. 20261005190000_ai_cfo_v1, applied in production
// 2026-10-06 by controlled SQL — step 8A; baseline.json appliedAfterCapture). The state before step 8 is reproduced first.
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
  const VIEW = "20261008100000_cfo_gun_ozeti"; // cfo_run üzerinde görünüm → ai_cfo_v1'den sonra (baseline.json appliedAfterCapture)
  const VIEW_TZ = "20261008130000_cfo_gun_ozeti_tz";
  await apply(res.pendingInProduction.filter(m => m !== AI && m !== VIEW && m !== VIEW_TZ));
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
    await apply([AI, VIEW, VIEW_TZ]);
    const { cfoStore } = await import("../lib/cfo-agent/store");
    const now = new Date("2026-10-06T08:00:00Z");
    const id = await cfoStore.begin("2026-10-06T11:scheduled", now);
    assert.ok(id);
    const keyRow = await client.$queryRawUnsafe<{ k: string; type: string }[]>(`select "idempotencyKey" k, type from cfo_run`);
    assert.deepEqual(keyRow, [{ k: "engine:2026-10-06T11:scheduled", type: "monitor" }], "type CHECK'i değişmeden motor koşusu ayırt edilir");
    // The duplicate-period path relies on a unique violation (P2002). Over the single PGlite socket a server-side error ends
    // the session, so the constraint is proven on the engine directly; the P2002 → null mapping is covered in the unit test.
    await assert.rejects(pg.query(`insert into cfo_run (id,type,status,"periodKey","idempotencyKey","triggerReasons","schemaVersion","calculationVersion")
      values ('dup','monitor','running','2026-10-06T11:scheduled','engine:2026-10-06T11:scheduled','[]','2','v')`), /unique|duplicate/i);

    const anomaly = { id: "goal:revenue_month_usd", rule: "GOAL_OFF_TRACK", severity: "warning" as const, category: "sales" as const, entityType: "goal",
      entityId: "revenue_month_usd", period: "2026-10-01", fingerprint: "goal:revenue_month_usd:OFF_TRACK:2026-10-01", cooldownKey: "goal:revenue_month_usd:OFF_TRACK",
      evidenceIds: ["e_1"], actionable: true, impact: null, weight: 2, existingRecordIds: [] };
    const finding = { fingerprint: anomaly.fingerprint, cooldownKey: anomaly.cooldownKey, rule: anomaly.rule, severity: "warning" as const, category: "sales" as const,
      entity: anomaly.entityId, urgency: "ACIL" as const, impactTry: 12345.6, impactKind: "lost_profit", impactEstimated: true, what: "w", action: "a", text: "Hedef … Aciliyet: ACİL.",
      evidenceIds: ["e_1", "e_2"], openRecords: [], actionable: true, sinceYesterday: "yeni" as const };
    const record = (hash: string, o: Record<string, unknown> = {}) => ({ engineVersion: "e1", trigger: "scheduled" as const, decisionInputHash: hash,
      material: { sincePreviousRun: true, sinceYesterday: true, previousRunHash: null, yesterdayHash: null }, anomalies: [anomaly], findings: [finding],
      closedSinceYesterday: ["STOCKOUT|X"], metrics: [{ source: "cfo_nakit_kapisi", key: "nakit_kapisi.nakit_try", value: 59693.13, unit: "TRY", measured: true, asOf: "x" },
        { source: "snapshot", key: "tazelik.bayat_kaynaklar", value: "yok", unit: "state", measured: false, asOf: "x" }],
      alarms: [{ code: "floor_breach" as const, key: "floor_breach", message: "Nakit dibi -3.379.787 TL" }], silenced: ["XML bayat → STOCKOUT susuyor"], snapshotRef: null, ...o });
    const snap = { evidence: [], generatedAt: now.toISOString() };
    await cfoStore.record(id!, snap as never, "sh", record("h1"));
    await cfoStore.finish(id!, "completed", now);
    // previous(): son koşu hash'i + snapshot'ı tutan koşu; dünün son koşusundan anomali değerlendirmesi
    const later = new Date("2026-10-07T08:00:00Z"), dayStart = new Date("2026-10-07T00:00:00+03:00");
    const prev = await cfoStore.previous(later, dayStart);
    assert.deepEqual(prev.last, { id, hash: "h1", snapshotRunId: id });
    assert.equal(prev.yesterday?.hash, "h1"); assert.deepEqual(prev.yesterday?.evaluations.get(anomaly.cooldownKey), { severity: "warning", impact: null });
    // aynı girdi: snapshot yazılmaz (DbNull), snapshotRef önceki koşuyu gösterir
    const id2 = await cfoStore.begin("2026-10-07T11:scheduled", later);
    await cfoStore.record(id2!, null, "sh", record("h1", { snapshotRef: id }));
    await cfoStore.finish(id2!, "completed", later);
    const p2 = await cfoStore.previous(new Date(later.getTime() + 3600000), dayStart);
    assert.deepEqual(p2.last, { id: id2, hash: "h1", snapshotRunId: id }, "snapshot'sız koşu referansı taşır");
    const snaps = await client.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from cfo_run where snapshot is not null`);
    assert.equal(snaps[0].n, 1, "snapshot yalnız bir kez");
    const center = await loadCfoControlCenter();
    assert.ok(center.installed);
    assert.equal(center.run?.status, "completed"); assert.equal(center.record?.findings?.length, 1); assert.ok(center.snapshot, "son yazılmış snapshot okunur");

    // cfo_gun_ozeti: tek select * — SAGLIK, ALARM, BULGU, KAPANAN, SUSAN, METRIK; yalnız son TAMAMLANMIŞ motor koşusu
    assert.ok(res.pendingInProduction.includes(VIEW), "view migration'ı üretim kopyasında");
    await pg.query(`insert into cfo_run (id,type,status,"periodKey","idempotencyKey","triggerReasons","schemaVersion","calculationVersion","generatedAt")
      values ('old','monitor','completed','x','monitor:x','{"findings":[{"text":"eski LLM dönemi"}]}','2','v', now())`);
    const rows = (await pg.query<{ sira: number; tur: string; aciliyet: string | null; kural: string; varlik: string | null; tl_etkisi: string | null; metin: string; kanit_ids: string[] | null; dunden_beri: string | null }>(
      `select * from cfo_gun_ozeti`)).rows;
    assert.deepEqual(rows.map(r => r.tur), ["SAGLIK", "ALARM", "BULGU", "KAPANAN", "SUSAN", "METRIK", "METRIK"]);
    assert.match(rows[0].metin, /Bulgu 1 \(ACİL 1\), alarm 1, dünden beri kapanan 1\./);
    const b = rows[2];
    assert.deepEqual([b.aciliyet, b.kural, b.varlik, Number(b.tl_etkisi), b.kanit_ids, b.dunden_beri], ["ACİL", "GOAL_OFF_TRACK", "revenue_month_usd", 12345.6, ["e_1", "e_2"], "yeni"]);
    assert.equal(Number(rows[5].tl_etkisi), 59693.13); assert.equal(rows[5].metin, "59693.13 TRY");
    assert.equal(rows[6].tl_etkisi, null); assert.equal(rows[6].metin, "yok state (TAHMİNİ)");
    assert.ok(!rows.some(r => r.metin.includes("eski LLM")), "LLM dönemi monitor koşuları görünmez");
    // anon/authenticated/PUBLIC görünümü okuyamaz
    const acl = (await pg.query<{ g: string }>(`select grantee g from information_schema.role_table_grants where table_name='cfo_gun_ozeti' and grantee in ('anon','authenticated','PUBLIC')`)).rows;
    assert.deepEqual(acl, []);
    console.log("CFO engine store: engine key prefix, record/finish, previous() hash + evaluations, snapshot dedupe, control center, cfo_gun_ozeti rows + ACL passed (production reproduction)");
  } finally {
    await client.$disconnect().catch(() => undefined);
    await server.stop().catch(() => undefined);
    await pg.close();
  }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
