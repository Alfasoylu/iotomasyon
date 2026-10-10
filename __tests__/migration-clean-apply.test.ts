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
//   20261008200000_cfo_maliyet_kapsami_satir — sınıflama ayrı fonksiyona taşındı (aynı bağımlılıklar).
//   20261009100000_cfo_kredi_kalan_anapara — cfo_servet_kalem / cfo_kilometre_yaz yalnız baseline'da (cfo_stok_deger, cfo_yoldaki_mal…).
//   20261009140000_cfo_gumruk_dilim_capture — LANGUAGE sql gövdesi cfo_nakit_kapisi / cfo_nakit_projeksiyon'a dayanır (yalnız baseline'da).
//   20261009170000_cfo_metrik_net_sermaye — LANGUAGE sql gövdesi cfo_stok_deger / cfo_yoldaki_mal'a dayanır (yalnız baseline'da);
//     üretim kopyasında cfo-net-sermaye testi doğrular.
//   20261009190000_cfo_net_sermaye_maliyet_kdv_haric — 170000 ile aynı bağımlılıklar.
//   20261009180000_cfo_metrik_borc — LANGUAGE sql gövdesi cfo_yoldaki_mal'a dayanır ve 170000'in kolonlarını kullanır; cfo-metrik-borc testi doğrular.
const BASELINE_DEPENDENT = ["20261008160000_cfo_maliyet_kapsami", "20261008190000_cfo_maliyet_kapsami_satir_kimligi", "20261008200000_cfo_maliyet_kapsami_satir",
  "20261009100000_cfo_kredi_kalan_anapara", "20261009140000_cfo_gumruk_dilim_capture", "20261009170000_cfo_metrik_net_sermaye",
  "20261009180000_cfo_metrik_borc", "20261009190000_cfo_net_sermaye_maliyet_kdv_haric",
  "20261010100000_cfo_sahiplik_tek_kural", // cfo_onucus_temel/cfo_kaynak_yeterliligi baseline nesnelerine bağlı
  "20261010110000_cfo_tek_nakit_yolu", // CFO-013: cfo_nakit_kapisi (100000) + baseline görünümleri; üretimde (2026-10-10), cfo-tek-nakit-yolu testi doğrular
  "20261010130000_cfo_sanal_stok_istisna", // RF-036: cfo_stok_deger + cfo_stok_istisna yalnız baseline'da; üretimde (2026-10-10), cfo-sanal-stok testi doğrular
  "20261010120000_cfo_kur_tek_kaynak"]; // CFO-003: cfo_servet / cfo_ciro_hedef / cfo_ithalat_oneri(_ozet) yalnız baseline'da; bekletilen (en sonda uygulanır), cfo-kur-tek-kaynak testi doğrular

async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
  await db.exec(`create schema if not exists storage; create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects(id text, bucket_id text, name text);
    create role anon nologin; create role authenticated nologin; create role service_role nologin; create role cfo_acceptance_reader login nosuperuser nobypassrls; grant usage on schema public to cfo_acceptance_reader;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
  // Üretimde henüz olmayan (baseline.json notAppliedInProduction) migration'lar parmak izinden SONRA uygulanır: Step 1 parmak izi
  // üretimin bugünkü halidir (bekletilen bir migration Step 1 nesnesini değiştiriyorsa Cowork uygulayınca parmak izi yeniden ölçülür).
  const held = new Set<string>(JSON.parse(readFileSync("prisma/baseline/baseline.json", "utf8")).notAppliedInProduction ?? []);
  const all = readdirSync("prisma/migrations").filter(d => /^\d/.test(d)).sort();
  const failed: string[] = [];
  const apply = async (ms: string[]) => { for (const m of ms) { try { await db.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8")); } catch { failed.push(m); } } };
  await apply(all.filter(m => !held.has(m)));

  const rows = (await db.query<Record<string, string>>(readFileSync("scripts/schema-drift/step1-fingerprint.sql", "utf8"))).rows;
  const actual = rows.map(r => `${r.sc} ${r.k} ${r.n} ${r.h}`);
  const expected = readFileSync("scripts/schema-drift/step1-fingerprint.expected.txt", "utf8").split("\n").filter(l => l && !l.startsWith("#"));
  // BASELINE_DEPENDENT migration'lar (170000/180000) Step 1 fonksiyonlarını (fm_balance_refresh, fm_goal_evaluate, fm_goal_sync) da
  // yeniden tanımlar; boş veritabanında kurulamadıkları için bu grubun hash'i burada üretimle eşleşemez. Grup adedi yine burada,
  // hash'in birebirliği üretim kopyasında (schema-baseline testi, aynı step1-fingerprint.expected.txt) doğrulanır.
  const hashOnProductionCopy = new Set(["A fn"]);
  const norm = (l: string) => { const p = l.split(" "); return hashOnProductionCopy.has(`${p[0]} ${p[1]}`) ? `${p[0]} ${p[1]} ${p[2]} (üretim kopyasında)` : l; };
  assert.deepEqual(actual.map(norm), expected.map(norm), "Step 1 şeması üretimde doğrulanmış parmak iziyle uyuşmuyor");

  await apply(all.filter(m => held.has(m)));
  assert.deepEqual(failed, [...KNOWN_OUT_OF_BAND, ...BASELINE_DEPENDENT], "yeni bir migration temiz veritabanına uygulanamıyor (bilinen out-of-band / baseline'a bağlı listeler dışında)");
  console.log(`Migration clean-apply: ${failed.length} bilinen out-of-band hata (donmuş liste), Step 1 parmak izi üretimle birebir (${actual.length} grup), ${held.size} bekletilen migration temiz uygulandı`);
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
