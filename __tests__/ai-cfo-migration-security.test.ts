import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";

// Step 8 deployment path of 20261005190000_ai_cfo_v1 (applied in production 2026-10-06, step 8A) on the clean-DB reproduction of production as it was BEFORE step 8
// (baseline + every production-applied migration), with production's default privileges for tables created by `postgres`
// in public (read-only catalog check 2026-10-06: pg_default_acl public/r = postgres + service_role only).
// Proves: cfo_run/cfo_insight/cfo_usage are RLS deny-all, no policies, no anon/authenticated/PUBLIC/reader privilege,
// service_role keeps access; and the migration is re-runnable (IF NOT EXISTS). Applying as a role whose default ACL
// grants anon (supabase_admin in public) WOULD leak — the step-8 runbook therefore checks current_user and the result.
const CHECK_SQL = readFileSync("scripts/ai-cfo-migration-check.sql", "utf8");
type CheckRow = { name: string; exists: boolean; rls_enabled: boolean | null; policies: number | string | null; exposed: boolean | null; service_role_ok: boolean | null };
const TABLES = ["cfo_run", "cfo_insight", "cfo_usage"];
const PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: s => db.exec(s), query: <T,>(s: string, p?: unknown[]) => db.query<T>(s, p) });
    // production before step 8 = every production-applied migration except ai_cfo_v1 (now listed in baseline.json appliedAfterCapture)
    assert.ok(res.pendingInProduction.includes("20261005190000_ai_cfo_v1"), "ai_cfo_v1 is applied in production (step 8A)");
    // cfo_gun_ozeti (görünüm, cfo_run'a bağlı) ai_cfo_v1'den sonra gelir; bu test ai_cfo_v1 öncesini yeniden üretir.
    for (const m of res.pendingInProduction.filter(x => x !== "20261005190000_ai_cfo_v1" && x !== "20261008100000_cfo_gun_ozeti" && x !== "20261008130000_cfo_gun_ozeti_tz")) await db.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    // market_scout_foundation (PR3) and drop_legacy_backup_tables (waits for the operator to run it) are held back; they touch only
    // market_* objects / 3 unused backup tables and do not affect this check. alfashome_order and cfo_ledger_tables_capture are applied.
    assert.deepEqual(res.pendingNotInProduction, ["20261007100000_market_scout_foundation", "20261007200000_drop_legacy_backup_tables",
      "20261008200000_cfo_maliyet_kapsami_satir", "20261009100000_cfo_kredi_kalan_anapara", "20261009110000_cfo_kart_karari_kart_faizi"], "only the held-back migrations stay out of production");
    // production default ACL for objects postgres creates in public (after the security phase)
    await db.exec(`alter default privileges in schema public grant all on tables to service_role;
      alter default privileges in schema public grant all on sequences to service_role;
      alter default privileges in schema public grant execute on functions to service_role;`);
    const q = async <T,>(s: string) => (await db.query<T>(s)).rows;
    const absent = await q<{ n: number }>(`select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relname = any(array['${TABLES.join("','")}'])`);
    assert.equal(absent[0].n, 0, "precondition: production reproduction has no AI CFO tables");

    // the step-8 operator check (scripts/ai-cfo-migration-check.sql) runs read-only and reports the "before" state
    const runCheck = async () => {
      const out = await db.exec(CHECK_SQL);
      const roleRow = out.map(r => r.rows[0] as Record<string, unknown> | undefined).find(r => r && "role_ok" in r);
      const acl = out.flatMap(r => r.rows as Record<string, unknown>[]).filter(r => "anon_free" in r);
      const tables = out.map(r => r.rows as CheckRow[]).find(rows => rows.length === 3 && "exposed" in rows[0])!;
      return { roleOk: roleRow?.role_ok, readOnly: roleRow?.read_only, aclFree: acl.every(r => r.anon_free === true) && acl.length > 0, tables };
    };
    const before = await runCheck();
    assert.equal(before.roleOk, true); assert.equal(before.readOnly, "on"); assert.equal(before.aclFree, true);
    assert.deepEqual(before.tables.map(t => t.exists), [false, false, false]);

    const sql = readFileSync("prisma/migrations/20261005190000_ai_cfo_v1/migration.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql); // idempotent re-run (IF NOT EXISTS)
    await db.exec("set search_path = public");

    for (const t of TABLES) {
      const [rel] = await q<{ rls: boolean; policies: number }>(`select c.relrowsecurity rls, (select count(*)::int from pg_policy p where p.polrelid=c.oid) policies
        from pg_class c where c.oid='public.${t}'::regclass`);
      assert.deepEqual(rel, { rls: true, policies: 0 }, `${t}: RLS deny-all`);
      for (const role of ["anon", "authenticated", "cfo_acceptance_reader"]) {
        const held = await q<{ p: string }>(`select p from unnest(array['${PRIVS.join("','")}']) p where has_table_privilege('${role}','public.${t}',p)`);
        assert.deepEqual(held, [], `${t}: ${role} has no privilege`);
      }
      const [pub] = await q<{ acl: string | null }>(`select relacl::text acl from pg_class where oid='public.${t}'::regclass`);
      assert.ok(!/(^|[{,])=/.test(pub.acl ?? ""), `${t}: no PUBLIC grant`);
      const [svc] = await q<{ ok: boolean }>(`select has_table_privilege('service_role','public.${t}','SELECT,INSERT,UPDATE,DELETE') ok`);
      assert.ok(svc.ok, `${t}: service_role keeps access`);
    }
    const after = await runCheck();
    assert.deepEqual(after.tables.map(t => ({ ...t, policies: Number(t.policies) })), ["cfo_insight", "cfo_run", "cfo_usage"].map(name =>
      ({ name, exists: true, rls_enabled: true, policies: 0, exposed: false, service_role_ok: true })), "operator check reports the safe after-state");
    // CHECK/unique invariants the runner relies on survive a re-run
    const cons = await q<{ n: number }>(`select count(*)::int n from pg_constraint where conrelid = any(array['public.cfo_run'::regclass,'public.cfo_insight'::regclass,'public.cfo_usage'::regclass]) and contype in ('c','u','p','f')`);
    assert.ok(cons[0].n >= 10, "constraints present once");
    const idx = await q<{ k: string }>(`select indexdef k from pg_indexes where tablename='cfo_run' and indexdef ilike '%unique%' and indexdef ilike '%idempotencyKey%'`);
    assert.equal(idx.length, 1, "unique idempotency key");

    // Negative control: a table created under a default ACL that grants anon (as supabase_admin's does in public) leaks.
    await db.exec(`create schema leak_check;
      alter default privileges in schema leak_check grant all on tables to anon;`);
    await db.exec("create table leak_check.cfo_run (id text primary key); alter table leak_check.cfo_run enable row level security;");
    const [leak] = await q<{ ok: boolean }>(`select has_table_privilege('anon','leak_check.cfo_run','SELECT') ok`);
    assert.ok(leak.ok, "negative control: the check would catch an anon-granting default ACL");
    const [exposed] = await q<{ exposed: boolean }>(`select exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated','cfo_acceptance_reader')) exposed from pg_class c where c.oid='leak_check.cfo_run'::regclass`);
    assert.equal(exposed.exposed, true, "negative control: the operator check's exposure expression flags it");
    console.log("AI CFO migration security: RLS deny-all, no anon/authenticated/PUBLIC/reader privilege, service_role kept, idempotent (production default ACL)");
  } finally { await db.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
