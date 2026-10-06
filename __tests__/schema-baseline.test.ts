import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { applyPendingInProduction, bootstrap, listMigrations, migrationChecksum, readBaselineConfig } from "../scripts/schema-baseline/bootstrap";

// Clean-DB reproducibility gate (docs/BASELINE-CAPTURE.md):
//  (a) bootstrap on an EMPTY database (Supabase-like roles / default privileges) raises no error
//  (b) the full public-schema fingerprint equals the one measured on PRODUCTION (fingerprint.expected.txt), and the
//      dictionary seed hashes equal the production-verified Step 1 seed hashes
//  (c) every prisma/migrations directory is registered as applied (baseline cutoff) or is a pending newer migration that applies cleanly
async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
    const client = { exec: (s: string) => db.exec(s), query: <T,>(s: string, p?: unknown[]) => db.query<T>(s, p) };

    // (a) clean bootstrap: zero errors
    const result = await bootstrap(client);
    await db.exec("set search_path = public");

    // newer-than-baseline migrations must apply on top of the baseline without error (prisma migrate deploy semantics);
    // baseline + pending migrations together must equal production
    await applyPendingInProduction(client, result); // late (appliedAfterCapture) ones last, under the production applier's default ACL
    await db.exec("set search_path = public");

    // (b) full fingerprint vs production
    const actual = (await db.query<{ k: string; n: number; h: string }>(readFileSync("scripts/schema-baseline/fingerprint.sql", "utf8"))).rows.map(r => `${r.k} ${r.n} ${r.h}`);
    const expected = readFileSync("scripts/schema-baseline/fingerprint.expected.txt", "utf8").split("\n").filter(l => l && !l.startsWith("#"));
    assert.deepEqual(actual, expected, "bootstrapped schema fingerprint differs from production");

    const step1 = (await db.query<Record<string, string>>(readFileSync("scripts/schema-drift/step1-fingerprint.sql", "utf8"))).rows.map(r => `${r.sc} ${r.k} ${r.n} ${r.h}`);
    const step1Expected = readFileSync("scripts/schema-drift/step1-fingerprint.expected.txt", "utf8").split("\n").filter(l => l && !l.startsWith("#"));
    assert.deepEqual(step1.filter(l => l.includes(" seed:")), step1Expected.filter(l => l.includes(" seed:")), "dictionary seed rows differ from production-verified hashes");
    assert.deepEqual(step1, step1Expected, "Step 1 fingerprint differs from production-verified hashes");

    // no credentials in the captured artifacts
    for (const f of ["prisma/baseline/2026-10-06.sql", "prisma/baseline/2026-10-06.seed.sql", "scripts/schema-baseline/inventory.sql"]) {
      assert.doesNotMatch(readFileSync(f, "utf8"), /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, `${f} contains a JWT-shaped literal`);
    }

    // (c) migration registry
    const dirs = listMigrations();
    const cfg = readBaselineConfig();
    assert.equal(result.registered.length + result.pending.length, dirs.length);
    assert.deepEqual(result.registered, dirs.filter(m => m <= cfg.cutoffMigration && !(cfg.notAppliedInProduction ?? []).includes(m) && !(cfg.appliedAfterCapture ?? []).includes(m)));
    assert.deepEqual(result.pendingInProduction.slice(-(cfg.appliedAfterCapture ?? []).length || Infinity), cfg.appliedAfterCapture ?? [], "late migrations run last, in production order");
    assert.deepEqual(result.pendingNotInProduction, cfg.notAppliedInProduction ?? []);
    const rows = (await db.query<{ migration_name: string; checksum: string; finished_at: string | null; applied_steps_count: number }>(
      "select migration_name, checksum, finished_at, applied_steps_count from public._prisma_migrations order by migration_name")).rows;
    assert.equal(rows.length, result.registered.length);
    assert.ok(rows.every(r => r.finished_at !== null && r.applied_steps_count === 1));
    for (const r of rows) assert.equal(r.checksum, migrationChecksum(".", r.migration_name), `checksum ${r.migration_name}`);

    // migrations production does not have yet must still apply cleanly on top (the future deployment path)
    for (const m of result.pendingNotInProduction) await db.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));

    // a second bootstrap on a populated database is refused
    await assert.rejects(() => bootstrap(client), /not empty/);

    console.log(`Schema baseline: clean bootstrap 0 errors, ${actual.length} fingerprint groups equal production, ${step1.length} Step 1 groups equal, ${rows.length}/${dirs.length} migrations registered applied (${result.pendingInProduction.length} production-pending + ${result.pendingNotInProduction.length} not-yet-in-production applied cleanly)`);
  } finally {
    await db.close();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
