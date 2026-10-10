import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { isPersonalAccount, isPersonalCard, personalAccountSql, personalCardSql } from "../lib/cfo/ownership";

// Şirket / şahsi TEK sınıflama (CFO-006): hesap türü "ŞAHSİ" kelimesi (Türkçe katlanmış), kart sahibi "Alp". TS ve SQL aynı sonucu verir.
// Üretim 09.10 hesap/kart listesi eski kurallarla aynı sınıflanır. Çalıştır: node --import tsx __tests__/cfo-ownership.test.ts
const ACCOUNTS: [string, boolean][] = [
  ["Vadesiz + KMH", false], ["Vadesiz", false], ["Vadesiz DÖVİZ", false], ["Vadesiz + KMH (ŞAHSİ)", true],
  ["vadesiz + kmh (şahsi)", true], ["Şahsi", true], ["SAHSI hesap", true], ["ŞAHSİYET", false], ["", false],
];
const CARDS: [string | null, boolean][] = [
  ["Alp", true], [" alp ", true], ["ALP", true], ["Şirket", false], ["Alfa — Alperen (ana kart)", false], ["Alfa — Fatih (ek kart)", false], [null, false],
];

// Kod tabanında şahsi hesap için kendi kalıbını kuran sorgu kalmaz (2026-10-10: /cfo/odemeler kapasitesi `like '%ŞAHSİ%'` idi → cfo_hesap_sahsi)
const ownRules = execSync(`grep -rnE "(i?like|~\\*?) *'%?(ŞAHSİ|SAHSI|şahsi)" app lib services components || true`, { encoding: "utf8" })
  .split("\n").filter(l => l && !/^[^:]+:\d+:\s*(\/\/|\*)/.test(l)).join("\n"); // yorum satırları hariç
assert.equal(ownRules, "", `şahsi sınıflama tek kural (cfo_hesap_sahsi / personalAccountSql) dışında yazılmış:\n${ownRules}`);

async function main() {
  // eski JS kuralı /ŞAHSİ/i küçük harf "şahsi"yi yakalamıyordu (İ'nin küçüğü "i̇") — yeni kural yakalar
  assert.equal(/ŞAHSİ/i.test("vadesiz + kmh (şahsi)"), false, "eski kuralın kusuru (belgelendi)");
  for (const [t, want] of ACCOUNTS) assert.equal(isPersonalAccount(t), want, `hesap: ${t}`);
  for (const [h, want] of CARDS) assert.equal(isPersonalCard(h), want, `kart: ${h}`);
  assert.equal(isPersonalAccount(null), false);

  const db = new PGlite();
  try {
    for (const [t, want] of ACCOUNTS) {
      const [r] = (await db.query<{ p: boolean }>(`select ${personalAccountSql("$1::text")} as p`, [t])).rows;
      assert.equal(r.p, want, `SQL hesap: ${t}`);
    }
    for (const [h, want] of CARDS) {
      const [r] = (await db.query<{ p: boolean }>(`select ${personalCardSql("$1::text")} as p`, [h])).rows;
      assert.equal(r.p, want, `SQL kart: ${h}`);
    }
  } finally { await db.close(); }

  // Migration 20261010100000: veritabanı görünüm/fonksiyonları aynı kuralı tek fonksiyondan kullanır (üretim kopyası)
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (q: string) => pg.exec(q), query: <T,>(q: string, p?: unknown[]) => pg.query<T>(q, p) });
    // 140000 (CFO-030) cfo_nakit_kapisi'na sütun ekler; 100000 bu testte yeniden uygulandığı için (görünümden sütun düşürülemez) dışarıda — kendi testi cfo-kmh-kapasite
    for (const m of res.pendingInProduction.filter(x => x !== "20261010140000_cfo_kmh_kapasite_tek")) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    const MIG = "20261010100000_cfo_sahiplik_tek_kural";
    const sql = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
    await pg.exec(sql); await pg.exec(sql);
    await pg.exec("set search_path = public");
    for (const [t, want] of ACCOUNTS) assert.equal((await pg.query<{ p: boolean }>(`select cfo_hesap_sahsi($1) p`, [t])).rows[0].p, want, `cfo_hesap_sahsi: ${t}`);
    for (const [h, want] of CARDS) assert.equal((await pg.query<{ p: boolean }>(`select cfo_kart_sahsi($1) p`, [h])).rows[0].p, want, `cfo_kart_sahsi: ${h}`);
    const defs = (await pg.query<{ n: string; d: string }>(`select 'cfo_nakit_kapisi' n, pg_get_viewdef('cfo_nakit_kapisi'::regclass) d
      union all select p.proname, pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('cfo_onucus_temel', 'cfo_kaynak_yeterliligi', 'cfo_metrik_borc')`)).rows;
    assert.equal(defs.length, 4);
    for (const { n, d } of defs) {
      assert.doesNotMatch(d.replace(/--[^\n]*/g, ""), /~~\*|ilike '%ŞAHSİ|~\* 'ŞAHSİ|= 'Alp'/i, `${n}: eski sahiplik ifadesi kalmadı`);
      assert.match(d, /cfo_(hesap|kart)_sahsi/, `${n}: tek kural fonksiyonu`);
    }
    // ASCII "SAHSI" yazılmış şahsi hesap artık şirket nakdine/KMH'ye girmiyor (eski ILIKE '%ŞAHSİ%' sayıyordu)
    await pg.exec(`delete from cfo_bank_account; insert into cfo_bank_account (id, name, "accountType", "balanceTry", "kmhLimitTry", "isActive", "updatedAt")
      values ('s1', 'Sirket', 'Vadesiz + KMH', 100000, 500000, true, now()), ('s2', 'Kisisel', 'Vadesiz + KMH (SAHSI)', 7000, 300000, true, now())`);
    const k = (await pg.query<{ nakit: string; kmh: string }>(`select nakit_try::text nakit, bos_kmh_try::text kmh from cfo_nakit_kapisi`)).rows[0];
    assert.deepEqual([Number(k.nakit), Number(k.kmh)], [100000, 500000], "şahsi (ASCII) hesap şirket nakdinde/KMH'de yok");
    // Kaynak yeterliliği: dip nakitle başlar → açık = boş KMH + dip (nakit ikinci kez eklenmez)
    const ky = Object.fromEntries((await pg.query<{ kalem: string; tutar: string }>(`select kalem, tutar::text from cfo_kaynak_yeterliligi()`)).rows.map(r => [r.kalem, Number(r.tutar)]));
    const dip = -ky["En dip ihtiyac"];
    assert.equal(ky["ACIK (genel kaynak)"], ky["Bos GENEL KMH"] + dip, "genel kaynak açığı: nakit çift sayılmıyor");
    assert.equal(ky["Sahsi KMH (son care)"], 300000, "şahsi KMH tek kuralla");
    assert.equal(ky["ACIK (her sey dahil)"], ky["Bos GENEL KMH"] + ky["Amaca bagli KMH (Ziraat/gumruk)"] + 300000 + dip);
    const o8 = (await pg.query<{ deger: string }>(`select deger from cfo_onucus_temel() where sira = 8`)).rows[0].deger;
    assert.ok(o8.endsWith(`acik ${Math.round(ky["ACIK (genel kaynak)"])} TL`), `ön uçuş 8. satır aynı açığı gösterir: ${o8}`);
    await pg.query(`select * from cfo_metrik_borc()`);
    const f = (await pg.query<{ a: boolean; r: boolean }>(`select has_function_privilege('anon','public.cfo_hesap_sahsi(text)','execute') a,
      has_function_privilege('cfo_acceptance_reader','public.cfo_hesap_sahsi(text)','execute') r`)).rows[0];
    assert.deepEqual([f.a, f.r], [false, true]);
  } finally { await pg.close(); }
  console.log("Şirket/şahsi tek sınıflama: hesap türü ŞAHSİ (Türkçe katlanmış), kart sahibi Alp; TS = SQL = veritabanı (4 nesne tek fonksiyon); kaynak yeterliliği nakdi çift saymıyor passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
