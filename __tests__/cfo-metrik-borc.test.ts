import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { readOrderDebtGate } from "../lib/cfo-agent/debt-policy";

// Borcun TEK tanımı + hedef < 100.000 USD (CFO-002, migration 20261009180000; Alperen D-P03): finansal borç = kredi kalan anapara
// + kart toplam + kullanılan KMH; yoldaki gümrük/navlun taahhüt (hedef dışı). Üretim kopyası üzerinde: bileşenler, net sermaye
// sözleşmesiyle tutarlılık, snapshot → debt_try v3 → Goal debt_below_usd (eski 5M TL hedefi emekli), sipariş kapısı aynı kaynak.
// Çalıştır: node --import tsx __tests__/cfo-metrik-borc.test.ts
const NET = "20261009170000_cfo_metrik_net_sermaye", BORC = "20261009180000_cfo_metrik_borc";
type Row = { sira: number; tur: string; kalem: string; tutar: string | null; aciklama: string };
const n = (v: unknown) => (v == null ? null : Number(v));

async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => db.exec(s), query: <T,>(s: string, p?: unknown[]) => db.query<T>(s, p) });
    for (const m of res.pendingInProduction) await db.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    // Üretim 170000 + 180000'i uyguladı (2026-10-09); kopya onları içerir, test yine de ikisini sırayla yeniden uygular (idempotent).
    assert.ok(res.pendingInProduction.includes(NET) && res.pendingInProduction.includes(BORC), "üretimde uygulandı");
    await db.exec("set search_path = public");
    const q = async <T,>(s: string) => (await db.query<T>(s)).rows;
    const source = { query: async <T,>(sql: string, ...params: unknown[]) => (await db.query<T>(sql, params)).rows };
    const now = new Date();

    await db.exec(`create table t_stok as select * from cfo_stok_deger with no data;
      create or replace view cfo_stok_deger as select * from t_stok;
      insert into t_stok (id, sku, stok, birim_maliyet, gercek_stok, birim_fiyat, deger_kaynagi, birim_net_deger, net_deger, maliyet_degeri)
        values ('p1','A',10,50,true,120,'GERCEKLESEN_SATIS',90,900,500);
      insert into cfo_bank_account (id, name, "balanceTry", "accountType", "isActive", "lastUpdatedAt", "updatedAt") values
        ('b1','Ana',150000,'Vadesiz + KMH',true,now(),now()), ('b2','KMH eksi',-20000,'Vadesiz + KMH',true,now(),now()),
        ('b3','Sahsi KMH',-3000,'Vadesiz + KMH (ŞAHSİ)',true,now(),now());
      insert into cfo_yoldaki_mal (kod, aciklama, durum, odenmis_try, odenmemis_vergi_try, odenmemis_navlun_try, risk) values
        ('Y1','konteyner','YOLDA',1000000,300000,50000,'NORMAL');
      insert into cfo_loan (id, bank, name, "remainingTry", "earlyPayoffTry", status, "lastUpdatedAt", "updatedAt") values
        ('l1','Garanti','Kredi',4000000,4100000,'AKTIF',now(),now()), ('l2','Akbank','Kapandi',90000,null,'KAPANDI',now(),now());
      insert into cfo_credit_card (id, bank, holder, "totalDebtTry", "isActive", "lastUpdatedAt", "updatedAt") values
        ('c1','Enpara','Şirket',900000,true,now(),now()), ('c2','Akbank','Alp',100000,true,now(),now());
      insert into cfo_settings (id, "usdTryRate", "monthlyRevenueTargetUsd", "usdWealthTarget", "wealthTargetDate", "netPositionFloorTry", "updatedAt")
        values ('s1', 48, 100000, 300000, '2027-12-31', -3000000, now());
      insert into fm_fx_monthly (month, usd_try_forex_buying, ref_date, bulletin_no, is_fallback_day, source_url, fetched_at)
        values (date_trunc('month', current_date)::date, 48.5, current_date, 'x', false, 'synthetic', now());`);

    // Sözleşme fonksiyonu yoksa (180000 öncesi şema) kapı eski yola düşer — cfo_servet.borc (gümrük dahil) < 5M TL
    await db.exec(`alter function cfo_metrik_borc() rename to cfo_metrik_borc_x`);
    const g0 = await readOrderDebtGate(source, now);
    await db.exec(`alter function cfo_metrik_borc_x() rename to cfo_metrik_borc`);
    assert.deepEqual([g0.debtSource, g0.limitTry, g0.totalDebtTry], ["cfo_servet.borc", 5_000_000, 4_000_000 + 1_000_000 + 350_000]);

    for (const m of [NET, BORC]) { const sql = readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"); await db.exec(sql); await db.exec(sql); }

    // 1) Bileşenler
    const rows = await q<Row>(`select * from cfo_metrik_borc()`);
    const t = (s: number) => n(rows.find(r => r.sira === s)?.tutar);
    assert.deepEqual(rows.map(r => r.sira), [1, 2, 3, 90, 91, 92, 100]);
    assert.deepEqual([t(1), t(2), t(3)], [4_000_000, 1_000_000, 23_000], "kredi kalan (kapanan hariç), kart toplam, KMH (şahsi dahil)");
    assert.equal(t(90), 350_000, "gümrük/navlun taahhüdü bilgi satırında");
    assert.equal(t(91), 4_100_000, "erken kapama bilgi");
    assert.equal(t(92), 100_000 + 3_000, "şahsi kart + şahsi KMH (hedefe dahil, ayrı görünür)");
    const total = 4_000_000 + 1_000_000 + 23_000;
    assert.equal(t(100), total, "finansal borç; gümrük taahhüdü dahil değil");

    // 2) Net sermaye sözleşmesinin borç satırları aynı sayı
    const net = await q<Row>(`select * from cfo_metrik_net_sermaye() where tur = 'BORC'`);
    assert.equal(-net.reduce((a, r) => a + Number(r.tutar), 0), total, "net sermaye − borç tutarlılığı");

    // 3) Snapshot → debt_try v3 → Goal debt_below_usd; eski 5M TL hedefi emekli
    await db.exec(`select cfo_take_snapshot('sozlesme'); select fm_balance_refresh('2020-01-01')`);
    const snap = (await q<{ d: string; old: string }>(`select "contractDebtTry"::text d, "debtTry"::text old from cfo_snapshot where note = 'sozlesme'`))[0];
    assert.deepEqual([n(snap.d), n(snap.old)], [total, 4_000_000 + 1_000_000 + 350_000], "snapshot sözleşme borcu + eski alan (gümrük dahil, KMH hariç) aynen");
    await q(`select fm_goal_evaluate()`);
    assert.equal((await q(`select 1 from fm_goal where goal_key = 'debt_below_5m_try' and valid_to is null`)).length, 0, "5M TL hedefi emekli");
    const goal = (await q<{ target_value: string; target_currency: string; source: string }>(`select target_value, target_currency, source from fm_goal
      where goal_key = 'debt_below_usd' and valid_to is null`))[0];
    assert.deepEqual([n(goal.target_value), goal.target_currency, goal.source], [100000, "USD", "cfo_settings.debtTargetUsd"]);
    const obs = (await q<{ state: string; observed_value_try: string; target_value_try: string; gap_try: string; inputs: { definition_version: number } }>(
      `select state, observed_value_try, target_value_try, gap_try, inputs from fm_goal_observation where goal_key = 'debt_below_usd' order by evaluated_at desc limit 1`))[0];
    assert.deepEqual([obs.state, n(obs.observed_value_try), n(obs.target_value_try), obs.inputs.definition_version], ["NOT_MET", total, 4_850_000, 3]);
    assert.equal(n(obs.gap_try), total - 4_850_000);

    // 4) Sipariş kapısı aynı kaynak: borç = cfo_metrik_borc, eşik = hedef USD × TCMB kuru
    const g1 = await readOrderDebtGate(source, now);
    assert.deepEqual([g1.debtSource, g1.totalDebtTry, g1.limitTry, g1.limitUsd, g1.open], ["cfo_metrik_borc", total, 4_850_000, 100000, false]);
    assert.match(g1.reason, /100\.000 USD/);
    await db.exec(`update cfo_loan set "remainingTry" = 3000000 where id = 'l1'`);
    assert.equal((await readOrderDebtGate(source, now)).open, true, "borç eşiğin altına inince kapı açılır (taahhüt borç sayılmaz)");
    await db.exec(`update cfo_settings set "debtTargetUsd" = null`);
    const g2 = await readOrderDebtGate(source, now);
    assert.deepEqual([g2.open, g2.limitTry], [false, null], "hedef yoksa kapı kapalı (sabit eşiğe düşmez)");
    assert.match(g2.reason, /TL karşılığı bilinmiyor/);

    const ex = (await q<{ a: boolean; u: boolean }>(`select has_function_privilege('anon','public.cfo_metrik_borc()','execute') a,
      has_function_privilege('authenticated','public.cfo_metrik_borc()','execute') u`))[0];
    assert.deepEqual([ex.a, ex.u], [false, false]);
    console.log(`Borç sözleşmesi: bileşenler (gümrük taahhüt hedef dışı), net sermaye tutarlılığı, snapshot → v3 → debt_below_usd (5M TL emekli), kapı aynı kaynak + USD×TCMB eşik, yetki passed (toplam ${total})`);
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
