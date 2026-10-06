/**
 * db:bootstrap — reproduce the production public schema on an EMPTY PostgreSQL without replaying history.
 *   1. apply prisma/baseline/<date>.sql (schema only) + <date>.seed.sql (dictionary rows copied from migrations)
 *   2. register every prisma/migrations directory up to the baseline cutoff as applied in _prisma_migrations (except
 *      baseline.json notAppliedInProduction: migrations production deliberately does not have yet stay pending)
 *      (same semantics as `prisma migrate resolve --applied`: sha256 of migration.sql, finished_at set, 1 step)
 *   3. report newer migrations; the CLI then runs `prisma migrate deploy` for them (skip with --skip-deploy)
 * Never run against production: the CLI refuses Supabase hosts and any non-empty public schema.
 *   npm run db:bootstrap -- [--url=postgres://...] [--skip-deploy]      (default URL: DIRECT_URL, then DATABASE_URL)
 */
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface SqlClient {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface BaselineConfig { baselineFile: string; seedFile: string; cutoffMigration: string; notAppliedInProduction?: string[] }

export function readBaselineConfig(root = "."): BaselineConfig {
  return JSON.parse(readFileSync(join(root, "prisma/baseline/baseline.json"), "utf8")) as BaselineConfig;
}

export function listMigrations(root = "."): string[] {
  return readdirSync(join(root, "prisma/migrations"), { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d/.test(d.name)).map(d => d.name).sort();
}

export function migrationChecksum(root: string, name: string): string {
  return createHash("sha256").update(readFileSync(join(root, "prisma/migrations", name, "migration.sql"))).digest("hex");
}

// pending = everything not registered (what `prisma migrate deploy` would apply), split into the migrations production
// already has (pendingInProduction: baseline + these = production) and those production deliberately does not have yet.
export interface BootstrapResult { registered: string[]; pending: string[]; pendingInProduction: string[]; pendingNotInProduction: string[] }

export async function bootstrap(client: SqlClient, opts: { root?: string; allowNonEmpty?: boolean } = {}): Promise<BootstrapResult> {
  const root = opts.root ?? ".";
  const cfg = readBaselineConfig(root);
  const all = listMigrations(root);
  if (!all.includes(cfg.cutoffMigration)) throw new Error(`cutoff migration ${cfg.cutoffMigration} is not in prisma/migrations`);
  if (!opts.allowNonEmpty) {
    const { rows } = await client.query<{ n: number }>(
      "select count(*)::int n from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','v','m','S','f','p')");
    if (rows[0].n > 0) throw new Error(`refusing to bootstrap: public schema is not empty (${rows[0].n} relations)`);
  }
  await client.exec(readFileSync(join(root, "prisma/baseline", cfg.baselineFile), "utf8"));
  await client.exec(readFileSync(join(root, "prisma/baseline", cfg.seedFile), "utf8"));
  const notApplied = new Set(cfg.notAppliedInProduction ?? []);
  for (const m of notApplied) if (!all.includes(m)) throw new Error(`notAppliedInProduction ${m} is not in prisma/migrations`);
  const registered = all.filter(m => m <= cfg.cutoffMigration && !notApplied.has(m));
  for (const m of registered) {
    await client.query(
      "insert into public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) values ($1, $2, now(), $3, null, null, now(), 1)",
      [randomUUID(), migrationChecksum(root, m), m]);
  }
  const pending = all.filter(m => !registered.includes(m));
  return { registered, pending, pendingInProduction: pending.filter(m => !notApplied.has(m)), pendingNotInProduction: pending.filter(m => notApplied.has(m)) };
}

function refuseProduction(url: string): void {
  const host = new URL(url).hostname;
  if (/supabase\.(co|com)$|pooler\.supabase|frbxpodiostxuwlrubkt/.test(host + url)) {
    throw new Error("refusing to run db:bootstrap against a Supabase/production host");
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const urlArg = args.find(a => a.startsWith("--url="))?.slice(6);
  const url = urlArg ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("no database URL: pass --url=... or set DIRECT_URL/DATABASE_URL");
  refuseProduction(url);
  const { Client } = await import("pg");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  let result: BootstrapResult;
  try {
    result = await bootstrap({ exec: s => pg.query(s), query: (s, p) => pg.query(s, p as unknown[]) as never });
  } finally {
    await pg.end();
  }
  console.log(`baseline applied; ${result.registered.length} migrations registered as applied; ${result.pending.length} newer migration(s) pending`);
  if (result.pending.length && !args.includes("--skip-deploy")) {
    const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, cwd: resolve(".") });
    if (r.status !== 0) process.exitCode = r.status ?? 1;
  }
}

if (process.argv[1]?.endsWith("bootstrap.ts")) {
  main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
}
