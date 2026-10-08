import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

// Repo migrations ↔ production parity guard.
//  1) Applies EVERY prisma migration to an empty PostgreSQL (PGlite) with Supabase-like roles/default privileges.
//  2) Pre-existing migrations that need objects created out-of-band (SQL editor / db push) are an explicit, frozen allowlist:
//     a NEW failing migration — including any Step 1 migration — fails this test.
//  3) The Step 1 schema fingerprint (tables, columns, constraints, indexes, policies, grants, functions, views, seed data)
//     must equal the hashes verified against production (scripts/schema-drift/step1-fingerprint.expected.txt).
const KNOWN_OUT_OF_BAND = [
  "20260829000000_cfo_olu_stok_kendi_takvimi", "20260910120000_cfo_ithalat_oneri", "20260910200000_cfo_servet", "20260910230000_cfo_satir_bilgi",
  "20260911000000_cfo_yoldaki_kalem", "20260911140000_cfo_alacak_borc", "20260912090000_olu_stok_satis_orani", "20260912140000_xml_satis_sinyali",
  "20260912150000_olu_stok_xml_sinyali", "20260913120000_urun_mensei_garanti_kutu",
];
// Baseline yakalandıktan (2026-10-06) SONRA yazılmış ve yalnız baseline'da bulunan (hiçbir migration'ın yaratmadığı) nesnelere
// dayanan migration'lar. Boş veritabanında kurulamazlar; üretim kopyasında (baseline + migration'lar) doğrulanırlar
// (schema-baseline, ai-cfo-source-mapping). Bu liste de donmuştur: yeni bir giriş gerekçesiyle eklenir.
//   20261008160000_cfo_maliyet_kapsami — cfo_satis_birim_duz ve cfo_set_fiyat yalnız baseline'da.
//   20261008190000_cfo_maliyet_kapsami_satir_kimligi — aynı fonksiyonun yeni sürümü (aynı bağımlılıklar).
const BASELINE_DEPENDENT = ["20261008160000_cfo_maliyet_kapsami", "20261008190000_cfo_maliyet_kapsami_satir_kimligi"];

async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
  await db.exec(`create schema if not exists storage; create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects(id text, bucket_id text, name text);
    create role anon nologin; create role authenticated nologin; create role service_role nologin; create role cfo_acceptance_reader login nosuperuser nobypassrls; grant usage on schema public to cfo_acceptance_reader;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
  const failed: string[] = [];
  for (const m of readdirSync("prisma/migrations").filter(d => /^\d/.test(d)).sort()) {
    try { await db.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8")); } catch { failed.push(m); }
  }
  assert.deepEqual(failed, [...KNOWN_OUT_OF_BAND, ...BASELINE_DEPENDENT], "yeni bir migration temiz veritabanına uygulanamıyor (bilinen out-of-band / baseline'a bağlı listeler dışında)");

  const rows = (await db.query<Record<string, string>>(readFileSync("scripts/schema-drift/step1-fingerprint.sql", "utf8"))).rows;
  const actual = rows.map(r => `${r.sc} ${r.k} ${r.n} ${r.h}`);
  const expected = readFileSync("scripts/schema-drift/step1-fingerprint.expected.txt", "utf8").split("\n").filter(l => l && !l.startsWith("#"));
  assert.deepEqual(actual, expected, "Step 1 şeması üretimde doğrulanmış parmak iziyle uyuşmuyor");
  console.log(`Migration clean-apply: ${failed.length} bilinen out-of-band hata (donmuş liste), Step 1 parmak izi üretimle birebir (${actual.length} grup)`);
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
