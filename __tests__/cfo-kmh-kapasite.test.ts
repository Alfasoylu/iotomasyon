import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { PAYMENT_CAPACITY_SQL } from "../lib/cfo/payment-capacity";
import { REVIEWED_SOURCE_HASHES } from "../lib/cfo-agent/reviewed-sources";

// CFO-030 (RF-20261010-035, 2026-10-10) — KMH KAPASİTESİ TEK AYRIŞTIRMA. cfo_nakit_kapisi.nakit_try şirket hesaplarının bakiye TOPLAMI
// (eksi bakiye dahil — tek nakit yolunun açılışı); bos_kmh_try = limit − kullanılan. İkisini toplayan tüketiciler (kaynak yeterliliği,
// ön uçuş, gümrük dilimi) eksi bakiyeli hesapta kullanılan KMH'yi İKİ KEZ düşürüyordu. Migration 20261010140000: kapasite = pozisyon +
// TAM ticari limit (kmh_limit_try) — /cfo/odemeler (lib/cfo/payment-capacity.ts) ile aynı. Eksi bakiye yokken sonuç değişmez.
// Çalıştır: node --import tsx __tests__/cfo-kmh-kapasite.test.ts
const MIG = "20261010140000_cfo_kmh_kapasite_tek";

async function main() {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const m of res.pendingInProduction.filter(x => x !== MIG)) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    for (const m of res.pendingNotInProduction.filter(x => x !== MIG && !/market_scout|drop_legacy/.test(x))) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    await pg.exec("set search_path = public");
    const q = async <T,>(s: string) => (await pg.query<T>(s)).rows;
    const viewHash = async () => createHash("sha256").update((await q<{ d: string }>(`select pg_get_viewdef('public.cfo_nakit_kapisi'::regclass, true) d`))[0].d).digest("hex");
    const accepted = (h: string) => ([] as string[]).concat(REVIEWED_SOURCE_HASHES.cfo_nakit_kapisi as string | string[]).includes(h);
    // 140000 öncesi üretim tanımı (CFO-006 sonrası incelenmiş hash): PGlite biçimi üretimle birebir
    assert.equal(await viewHash(), "56a943eedf652851e15a74bb5e19c7516938f3c57708eea436d117d5dbbb546f", "üretim kopyası: 140000 öncesi görünüm");

    // A +500.000 (limitsiz) · B −200.000, limit 500.000 · C Ziraat amaca bağlı 750.000 · şahsi hesap (kapsam dışı) · bakiyesi bilinmeyen hesap
    await pg.exec(`insert into cfo_bank_account (id, name, "accountType", "balanceTry", "kmhLimitTry", "purposeLimitTry", "isActive", "updatedAt") values
      ('a', 'A', 'Vadesiz', 500000, 0, 0, true, now()),
      ('b', 'B', 'Vadesiz + KMH', -200000, 500000, 0, true, now()),
      ('c', 'Ziraat', 'Vadesiz + KMH', 0, 0, 750000, true, now()),
      ('s', 'Sahsi', 'ŞAHSİ KMH', -50000, 100000, 0, true, now()),
      ('u', 'Bilinmeyen', 'Vadesiz + KMH', null, 300000, 0, true, now());
      insert into cfo_settings (id, "netPositionFloorTry", "updatedAt") values ('s1', -3000000, now()) on conflict do nothing;`);
    const kaynak = async () => new Map((await q<{ kalem: string; tutar: string | null }>(`select kalem, tutar::text from cfo_kaynak_yeterliligi()`)).map(r => [r.kalem, Number(r.tutar)]));
    const dilim = async () => new Map((await q<{ kalem: string; tutar: string | null }>(`select kalem, tutar::text from cfo_gumruk_dilim(current_date + 5)`)).map(r => [r.kalem, r.tutar == null ? null : Number(r.tutar)]));
    const [cap] = await q<{ acilis: string; ticari_kmh: string }>(PAYMENT_CAPACITY_SQL);
    const sayfa = Number(cap.acilis) + Number(cap.ticari_kmh);
    assert.equal(sayfa, 300000 + 500000, "/cfo/odemeler: pozisyon 300.000 + tam ticari limit 500.000 (bilinmeyen bakiyeli hesabın limiti hariç)");

    // öncesi: kullanılan 200.000 iki kez düşüyor (hata)
    const k0 = await kaynak(), d0 = await dilim();
    assert.equal(k0.get("GENEL TICARI KAYNAK"), 300000 + 300000, "öncesi: pozisyon + (limit − kullanılan) → 200.000 eksik");
    assert.equal(d0.get("Genel ticari kaynak"), 600000);

    const sql = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
    await pg.exec(sql); await pg.exec(sql);
    const [g] = await q<{ nakit_try: string; bos_kmh_try: string; kmh_limit_try: string }>(`select nakit_try::text, bos_kmh_try::text, kmh_limit_try::text from cfo_nakit_kapisi`);
    assert.deepEqual([Number(g.nakit_try), Number(g.bos_kmh_try), Number(g.kmh_limit_try)], [300000, 300000, 500000], "nakit = pozisyon; boş KMH gösterim; tam limit yeni sütun");
    const k1 = await kaynak(), d1 = await dilim();
    assert.equal(k1.get("GENEL TICARI KAYNAK"), sayfa, "sonrası: kaynak yeterliliği = /cfo/odemeler kapasitesi");
    assert.equal(k1.get("Bos GENEL KMH"), 300000, "boş KMH satırı gösterim olarak aynı");
    assert.equal(k1.get("GUMRUK ANINDA TOPLAM KAYNAK"), sayfa + 750000);
    const dip = -k1.get("En dip ihtiyac")!;
    assert.equal(k1.get("ACIK (genel kaynak)"), 500000 + dip, "ACIK = tam limit + dip (dip pozisyonla başlar)");
    assert.equal(k1.get("ACIK (gumruk limiti dahil)"), 500000 + 750000 + dip);
    assert.equal(d1.get("Genel ticari kaynak"), sayfa);
    assert.equal(d1.get("Odeme aninda toplam kaynak"), d1.get("Gumruk oncesi pozisyon")! + 500000 + 750000, "gümrük: pozisyon(d−1) + tam limitler");
    // ön uçuş çalışıyor (satır sayısı değişmedi)
    assert.ok((await q(`select * from cfo_onucus_temel()`)).length > 5);

    // eksi bakiye yokken sonuç AYNI (üretim 10.10: limit = boş = 1.359.300)
    await pg.exec(`update cfo_bank_account set "balanceTry" = 100000 where id = 'b'`);
    const [g2] = await q<{ bos_kmh_try: string; kmh_limit_try: string }>(`select bos_kmh_try::text, kmh_limit_try::text from cfo_nakit_kapisi`);
    assert.equal(Number(g2.bos_kmh_try), Number(g2.kmh_limit_try), "eksi bakiye yok → boş KMH = tam limit, eski ve yeni sonuç aynı");

    assert.ok(accepted(await viewHash()), "140000 sonrası görünüm AI CFO incelenmiş hash'inde (üretimde ölçüldü 31466cf0…)");
    // yetkiler: okuyucu görünümü okur, anon okuyamaz
    const acl = await q<{ r: boolean; a: boolean }>(`select has_table_privilege('cfo_acceptance_reader', 'public.cfo_nakit_kapisi', 'select') r,
      has_table_privilege('anon', 'public.cfo_nakit_kapisi', 'select') a`);
    assert.deepEqual(acl[0], { r: true, a: false });
    console.log(`CFO-030 KMH kapasitesi: eksi bakiyede kullanılan KMH tek kez düşer; kaynak yeterliliği / gümrük dilimi = /cfo/odemeler; idempotent; yetkiler korunur; yeni görünüm hash ${(await viewHash()).slice(0, 8)} passed`);
  } finally { await pg.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
