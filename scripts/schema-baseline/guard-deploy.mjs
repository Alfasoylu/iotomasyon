#!/usr/bin/env node
/**
 * db:migrate:deploy koruması (CFO-019 / RF-20261008-017).
 *
 * `prisma migrate deploy` prisma/migrations içindeki TÜM bekleyen migration'ları uygular — baseline.json
 * notAppliedInProduction'daki bilinçli olarak bekletilenler dahil (ör. 20261007200000_drop_legacy_backup_tables = DROP TABLE).
 * Üretim migration'larını Cowork CFO aynen SQL olarak uygular (Master Plan, karar "C"); deploy üretimde çalıştırılmaz.
 *
 * Reddeder (çıkış 1):
 *   1. bekletilen migration varsa — ALLOW_HELD_BACK_MIGRATIONS listenin TAMAMINI virgülle aynen saymadıkça;
 *   2. hedef Supabase ise (DIRECT_URL, yoksa DATABASE_URL) — ALLOW_PRODUCTION_MIGRATE_DEPLOY=1 olmadıkça.
 * `npx prisma migrate deploy` doğrudan çağrılırsa bu koruma atlanır; yalnız `npm run db:migrate:deploy` korunur.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** @param {{ root?: string, env?: Record<string, string | undefined> }} [opts] */
export function checkDeploy({ root = ".", env = process.env } = {}) {
  const cfg = JSON.parse(readFileSync(join(root, "prisma/baseline/baseline.json"), "utf8"));
  const held = cfg.notAppliedInProduction ?? [];
  const errors = [];
  const missing = held.filter(m => !existsSync(join(root, "prisma/migrations", m, "migration.sql")));
  if (missing.length) errors.push(`baseline.json notAppliedInProduction dizinde yok: ${missing.join(", ")}`);
  if (held.length && (env.ALLOW_HELD_BACK_MIGRATIONS ?? "") !== held.join(",")) {
    errors.push(`Bekletilen migration'lar uygulanır: ${held.join(", ")}. Üretimde Cowork SQL ile uygular; bilinçliyse ` +
      `ALLOW_HELD_BACK_MIGRATIONS="${held.join(",")}" ver.`);
  }
  const url = env.DIRECT_URL || env.DATABASE_URL || "";
  let host = "";
  try { host = url ? new URL(url).hostname : ""; } catch { host = ""; }
  if (/(^|\.)supabase\.(co|com)$|pooler\.supabase/i.test(host) && env.ALLOW_PRODUCTION_MIGRATE_DEPLOY !== "1") {
    errors.push(`Hedef Supabase (${host}): üretim migration'ı Cowork tarafından SQL ile uygulanır, deploy çalıştırılmaz. ` +
      `Bilinçliyse ALLOW_PRODUCTION_MIGRATE_DEPLOY=1 ver.`);
  }
  return { ok: errors.length === 0, held, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkDeploy();
  if (!r.ok) {
    for (const e of r.errors) console.error(`db:migrate:deploy REDDEDİLDİ — ${e}`);
    process.exit(1);
  }
}
