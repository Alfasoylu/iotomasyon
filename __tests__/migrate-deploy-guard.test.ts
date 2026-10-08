/**
 * db:migrate:deploy koruması (CFO-019): bekletilen migration'lar ve Supabase hedefi açık izin olmadan reddedilir.
 * Çalıştır: node --import tsx __tests__/migrate-deploy-guard.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { checkDeploy } from "../scripts/schema-baseline/guard-deploy.mjs";

type Check = { ok: boolean; held: string[]; errors: string[] };
const run = (env: Record<string, string>) => checkDeploy({ env }) as Check;
const held = (JSON.parse(readFileSync("prisma/baseline/baseline.json", "utf8")).notAppliedInProduction ?? []) as string[];
assert.ok(held.includes("20261007200000_drop_legacy_backup_tables"), "yıkıcı drop migration'ı bekletiliyor");

const local = "postgresql://u:p@127.0.0.1:5432/dev";
const r0 = run({ DIRECT_URL: local });
assert.equal(r0.ok, false);
assert.match(r0.errors.join(" "), /drop_legacy_backup_tables/);
assert.equal(run({ DIRECT_URL: local, ALLOW_HELD_BACK_MIGRATIONS: held.join(",") }).ok, true, "tam liste açıkça verilirse yerelde geçer");
assert.equal(run({ DIRECT_URL: local, ALLOW_HELD_BACK_MIGRATIONS: held.slice(1).join(",") }).ok, false, "eksik liste geçmez");
assert.equal(run({ DIRECT_URL: local, ALLOW_HELD_BACK_MIGRATIONS: "*" }).ok, false, "joker yok");

const prod = "postgresql://postgres:x@db.frbxpodiostxuwlrubkt.supabase.co:5432/postgres";
const pooler = "postgresql://postgres.x:y@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
for (const url of [prod, pooler]) {
  const r = run({ DIRECT_URL: url, ALLOW_HELD_BACK_MIGRATIONS: held.join(",") });
  assert.equal(r.ok, false, url);
  assert.match(r.errors.join(" "), /Supabase/);
  assert.equal(run({ DIRECT_URL: url, ALLOW_HELD_BACK_MIGRATIONS: held.join(","), ALLOW_PRODUCTION_MIGRATE_DEPLOY: "1" }).ok, true);
}
assert.equal(run({ DATABASE_URL: prod, ALLOW_HELD_BACK_MIGRATIONS: held.join(",") }).ok, false, "DATABASE_URL de denetlenir");

// npm betiği korumayı prisma'dan ÖNCE çalıştırır; CLI reddederse 1 ile çıkar (prisma hiç başlamaz)
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
assert.match(pkg.scripts["db:migrate:deploy"], /^node scripts\/schema-baseline\/guard-deploy\.mjs && prisma migrate deploy$/);
const cli = spawnSync(process.execPath, ["scripts/schema-baseline/guard-deploy.mjs"], { env: { ...process.env, DIRECT_URL: local, DATABASE_URL: "", ALLOW_HELD_BACK_MIGRATIONS: "" }, encoding: "utf8" });
assert.equal(cli.status, held.length ? 1 : 0);
if (held.length) assert.match(cli.stderr, /db:migrate:deploy REDDEDİLDİ/);
console.log(`migrate deploy guard: ${held.length} held-back migration(s) and Supabase targets refused without explicit allow`);
