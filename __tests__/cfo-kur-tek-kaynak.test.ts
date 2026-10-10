import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { computeCfo, type CfoInput } from "../lib/cfo/engine";
import { pickCurrentFx } from "../lib/fx/pick";

// CFO-003 kalan (RF-20261008-003, 2026-10-10) — KUR TEK KAYNAK, sabit yedek yok:
//   eski motor: USD/TRY işlem kuru lib/fx/current.ts'ten; bilinmiyorsa null (eski `usdTryRate || 1` → 1 USD = 1 TL yok);
//   migration 20261010120000: cfo_take_snapshot USD alanları + cfo_servet.kur/servet_usd + cfo_ciro_hedef STRATEJİK kur (TCMB, D-P04;
//   Goal Engine kuralı), cfo_ithalat_oneri(_ozet) İŞLEM kuru (lib/fx/pick ile aynı sıra); kur yoksa NULL (48,5 / 1 yedeği yok).
// Çalıştır: node --import tsx __tests__/cfo-kur-tek-kaynak.test.ts
const MIG = "20261010120000_cfo_kur_tek_kaynak";

// ── Eski motor ──
const imp = { id: "i1", code: "K1", status: "YOLDA", totalCostUsd: 1000 } as unknown as CfoInput["imports"][number];
const base: CfoInput = { settings: null, banks: [], cards: [], loans: [], expenses: [], imports: [imp], receivables: [], cashEvents: [], today: new Date(2026, 9, 10) };
const unknownFx = computeCfo({ ...base, fx: { usdTry: null, source: "varsayılan" } });
assert.deepEqual([unknownFx.usdTry, unknownFx.inTransitStockTry, unknownFx.wideWorthUsd, unknownFx.target], [null, null, null, null], "kur yoksa USD'den türeyen alanlar BİLİNMİYOR");
const known = computeCfo({ ...base, fx: { usdTry: 48.98, source: "cfo_kur 2026-10" } });
assert.deepEqual([known.usdTry, known.usdTrySource, known.inTransitStockTry], [48.98, "cfo_kur 2026-10", 48980]);
const zeroSettings = computeCfo({ ...base, settings: { usdTryRate: 0, cardMinPct: 20 } as unknown as CfoInput["settings"] });
assert.equal(zeroSettings.usdTry, null, "fx verilmez ve ayar kuru 0 ise 1 değil BİLİNMİYOR");

async function main() {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const m of res.pendingInProduction.filter(x => x !== MIG)) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    await pg.exec("set search_path = public");
    const q = async <T,>(s: string) => (await pg.query<T>(s)).rows;
    const def = async (v: string) => (await q<{ d: string }>(`select pg_get_viewdef('public.${v}'::regclass) d`))[0].d;
    assert.match(await def("cfo_ithalat_oneri"), /48\.5/, "öncesi: sabit 48,5 yedeği");

    const sql = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
    await pg.exec(sql); await pg.exec(sql);
    for (const v of ["cfo_ciro_hedef", "cfo_ithalat_oneri", "cfo_ithalat_oneri_ozet", "cfo_servet"]) assert.doesNotMatch(await def(v), /48\.5|cfo_snapshot/, `${v}: sabit kur / snapshot kur döngüsü yok`);
    const fn = (await q<{ d: string }>(`select pg_get_functiondef('public.cfo_take_snapshot(text)'::regprocedure) d`))[0].d;
    assert.doesNotMatch(fn, /usdTryRate"?, 0\), 1\)|v_usd := 1/, "snapshot: 1 TL yedeği yok");

    await pg.exec(`delete from fm_fx_monthly; delete from cfo_snapshot;
      insert into cfo_bank_account (id, name, "balanceTry", "accountType", "isActive", "updatedAt") values ('b1','Ana',100000,'Vadesiz',true,now());
      insert into cfo_settings (id, "usdTryRate", "updatedAt") values ('s1', 49.2, now())`);
    // 1) stratejik kur yok → USD alanları NULL (1 TL ya da ayar kuru değil)
    const s0 = (await q<{ kur: string | null; usd: string | null }>(`select kur::text, servet_usd::text usd from cfo_servet`))[0];
    assert.deepEqual([s0.kur, s0.usd], [null, null], "cfo_servet: kur yok → BİLİNMİYOR");
    const snap0 = (await q<{ t: string; u: string | null; r: string | null }>(`select "netWorthTry"::text t, "netWorthUsd"::text u, "usdTryRate"::text r from cfo_take_snapshot('kur-yok')`))[0];
    assert.ok(snap0.t != null, "TL alanları yazılır");
    assert.deepEqual([snap0.u, snap0.r], [null, null], "snapshot: kur yok → USD NULL");

    // 2) bu ayın TCMB kuru (gelecek ay satırı yok sayılır) → servet ve snapshot aynı stratejik kur
    await pg.exec(`insert into fm_fx_monthly (month, usd_try_forex_buying, ref_date, bulletin_no, is_fallback_day, source_url, fetched_at) values
      (date_trunc('month', now() at time zone 'Europe/Istanbul')::date, 41.25, date_trunc('month', now() at time zone 'Europe/Istanbul')::date + 14, 'x', false, 'synthetic', now()),
      ((date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '3 months')::date, 99, (date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '3 months')::date + 14, 'y', false, 'synthetic', now())`);
    const s1 = (await q<{ kur: string; usd: string; tl: string }>(`select kur::text, servet_usd::text usd, servet_try::text tl from cfo_servet`))[0];
    assert.equal(Number(s1.kur), 41.25);
    assert.equal(Number(s1.usd), Math.round(Number(s1.tl) / 41.25 * 100) / 100);
    const snap1 = (await q<{ t: string; u: string; r: string }>(`select "netWorthTry"::text t, "netWorthUsd"::text u, "usdTryRate"::text r from cfo_take_snapshot('tcmb')`))[0];
    assert.deepEqual([Number(snap1.r), Number(snap1.u)], [41.25, Math.round(Number(snap1.t) / 41.25 * 100) / 100], "snapshot USD = TL ÷ TCMB (cfo_settings 49,2 değil)");
    // önceki ay yalnızsa önceki ay (Goal Engine kuralı)
    await pg.exec(`delete from fm_fx_monthly; insert into fm_fx_monthly (month, usd_try_forex_buying, ref_date, bulletin_no, is_fallback_day, source_url, fetched_at)
      values ((date_trunc('month', now() at time zone 'Europe/Istanbul') - interval '1 month')::date, 40, (date_trunc('month', now() at time zone 'Europe/Istanbul') - interval '1 month')::date + 14, 'z', false, 'synthetic', now())`);
    assert.equal(Number((await q<{ kur: string }>(`select kur::text from cfo_servet`))[0].kur), 40);

    // 3) işlem kuru ifadesi (ithalat önerisi) = lib/fx/pick.ts sırası: cfo_kur → cfo_settings → MonthlyExchangeRate → yoksa NULL
    const expr = sql.slice(sql.indexOf("COALESCE(( SELECT k_1.usd_try"), sql.indexOf(" AS kur\n           FROM cfo_settings", sql.indexOf("CREATE OR REPLACE VIEW public.cfo_ithalat_oneri AS")));
    assert.ok(expr.startsWith("COALESCE") && expr.length < 600, "işlem kuru ifadesi bulundu");
    const islem = async () => { const v = (await q<{ v: string | null }>(`select (${expr})::text v`))[0].v; return v == null ? null : Number(v); };
    const pick = (kur: number | null, settings: number | null, manual: number | null) =>
      pickCurrentFx({ kur: kur ? { month: "2026-10", usdTry: kur } : null, settings: settings != null ? { usdTry: settings } : null,
        manual: manual ? [{ month: "2026-09", usdTry: manual, rmbPerUsd: null }] : [] }, { usdTry: -1 });
    await pg.exec(`insert into cfo_kur (ay, usd_try, kaynak) values ('2026-10-01', 48.98, 'test');
      insert into "MonthlyExchangeRate" (id, year, month, "usdTryRate", "updatedAt") values ('m1', 2026, 9, 46, now())`);
    assert.equal(await islem(), 48.98); assert.equal(pick(48.98, 49.2, 46).usdTry, 48.98);
    await pg.exec(`delete from cfo_kur`);
    assert.equal(await islem(), 49.2); assert.equal(pick(null, 49.2, 46).usdTry, 49.2);
    await pg.exec(`update cfo_settings set "usdTryRate" = 0`);
    assert.equal(await islem(), 46); assert.equal(pick(null, 0, 46).usdTry, 46);
    await pg.exec(`delete from "MonthlyExchangeRate"`);
    assert.equal(await islem(), null, "hiç kur yoksa NULL (48,5 değil)"); assert.equal(pick(null, 0, null).usdTrySource, "varsayılan");

    const pr = (await q<{ s: boolean; a: boolean }>(`select has_table_privilege('cfo_acceptance_reader','public.cfo_servet','select') s,
      has_table_privilege('anon','public.cfo_servet','select') a`))[0];
    assert.equal(pr.a, false, "anon erişimi yok");
    console.log(`CFO-003 kur tek kaynak: eski motor kur yoksa BİLİNMİYOR, snapshot/servet stratejik (TCMB) kur, ithalat işlem kuru = lib/fx/pick, sabit 48,5 / 1 yedeği yok, reader select ${pr.s} passed`);
  } finally { await pg.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
