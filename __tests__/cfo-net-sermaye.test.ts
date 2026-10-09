import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";

// Net sermaye TEK tanımı (CFO-001 PR-D, migration 20261009170000; D-P01 GENİŞ, D-P02 LCNRV, D-P03 kredi + kart + KMH).
// Üretim kopyası (baseline + üretimdeki migration'lar) üzerinde: bileşenler, BİLİNMİYOR stok (0 sayılmaz), mutabakat SQL'iyle eşitlik,
// snapshot → fm_balance_day v3 → Goal Engine (yalnız en yeni tanım sürümü; sürümler karışmaz).
// Çalıştır: node --import tsx __tests__/cfo-net-sermaye.test.ts
const MIG = "20261009170000_cfo_metrik_net_sermaye";
type Row = { sira: number; tur: string; kalem: string; tutar: string | null; aciklama: string };
const n = (v: string | null | undefined) => (v == null ? null : Number(v));

async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => db.exec(s), query: <T,>(s: string, p?: unknown[]) => db.query<T>(s, p) });
    for (const m of res.pendingInProduction) await db.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    assert.ok(res.pendingNotInProduction.includes(MIG), "üretimde bekletiliyor (Cowork uygulayacak)");
    await db.exec("set search_path = public");
    const q = async <T,>(s: string) => (await db.query<T>(s)).rows;

    // Stok değerlemesi: cfo_stok_deger görünümünü aynı sütunlarla bir fikstür tablosuna bağla (satış zinciri bu testin konusu değil)
    await db.exec(`create table t_stok as select * from cfo_stok_deger with no data;
      create or replace view cfo_stok_deger as select * from t_stok;
      insert into t_stok (id, sku, stok, birim_maliyet, gercek_stok, birim_fiyat, deger_kaynagi, birim_net_deger, net_deger, maliyet_degeri) values
        -- KDV hariç NRV = 10 × (90 − 120/6) = 700 > maliyet 500 → 500
        ('p1','A',10,50,true,120,'GERCEKLESEN_SATIS',90,900,500),
        -- NRV = 10 × (60 − 120/6) = 400 < maliyet 800 → 400 (zararına satılan)
        ('p2','B',10,80,true,120,'GERCEKLESEN_SATIS',60,600,800),
        -- satış yok, maliyetle → 300
        ('p3','C',5,60,true,null,'MALIYET',60,300,300),
        -- satıyor ama maliyeti yok → toplama girmez; NRV 4 × (100 − 120/6) = 320 üst sınır
        ('p4','D',4,null,true,120,'GERCEKLESEN_SATIS',100,400,0),
        -- maliyet ve satış yok → BİLİNMİYOR, 0 sayılmaz
        ('p5','E',7,null,true,null,'DEGERSIZ',0,0,0),
        -- kukla stok → hiç girmez
        ('p6','F',9999,10,false,null,'MALIYET',10,99990,99990);
      insert into cfo_bank_account (id, name, "balanceTry", "accountType", "isActive", "updatedAt") values
        ('b1','Ana',150000,'Vadesiz + KMH',true,now()), ('b2','KMH eksi',-20000,'Vadesiz + KMH',true,now()),
        ('b3','Pasif',999999,'Vadesiz',false,now());
      insert into cfo_receivable (id, channel, "dueDate", "amountTry", "isCollected", "updatedAt") values
        ('r1','Trendyol',now(),60000,false,now()), ('r2','Trendyol',now(),5000,true,now());
      insert into cfo_yoldaki_mal (kod, aciklama, durum, odenmis_try, odenmemis_vergi_try, odenmemis_navlun_try, risk) values
        ('Y1','konteyner','YOLDA',1000000,300000,50000,'NORMAL'), ('Y2','adli','BEKLIYOR',450000,0,0,'RISKLI');
      insert into cfo_loan (id, bank, name, "remainingTry", status, "updatedAt") values
        ('l1','Garanti','Kredi',400000,'AKTIF',now()), ('l2','Akbank','Kapandi',90000,'KAPANDI',now());
      insert into cfo_credit_card (id, bank, "totalDebtTry", "isActive", "updatedAt") values ('c1','Enpara',250000,true,now());
      insert into cfo_settings (id, "usdTryRate", "monthlyRevenueTargetUsd", "usdWealthTarget", "wealthTargetDate", "netPositionFloorTry", "updatedAt")
        values ('s1', 48, 100000, 300000, '2027-12-31', -3000000, now());
      insert into fm_fx_monthly (month, usd_try_forex_buying, ref_date, bulletin_no, is_fallback_day, source_url, fetched_at)
        values (date_trunc('month', current_date)::date, 48.5, current_date, 'x', false, 'synthetic', now());`);

    // Migration öncesi (üretim bugün): v2 DAR snapshot'ları → Goal v2 ile ölçer
    for (const d of [20, 15, 10, 5]) await db.exec(`select cfo_take_snapshot('v2-${d}'); update cfo_snapshot set "takenAt" = now() - interval '${d} days' where note = 'v2-${d}'`);
    const mig = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
    await db.exec(mig);
    await db.exec(mig); // idempotent
    await db.exec(`select fm_balance_refresh('2020-01-01')`);
    const wealth = async () => {
      await q(`select fm_goal_evaluate()`);
      return (await q<{ observed_value_try: string; flags: string[]; inputs: { definition_version: number } }>(`select observed_value_try, flags, inputs
        from fm_goal_observation where goal_key = 'wealth_usd' order by evaluated_at desc limit 1`))[0];
    };
    const dar = n((await q<{ v: string }>(`select "netWorthTry"::text v from cfo_snapshot order by "takenAt" desc limit 1`))[0].v);
    const w2 = await wealth();
    assert.equal(w2.inputs.definition_version, 2, "sözleşme snapshot'ı yokken Goal eski tanımla (v2) ölçmeye devam eder");
    assert.equal(n(w2.observed_value_try), dar);

    // 1) Bileşenler
    const rows = await q<Row>(`select * from cfo_metrik_net_sermaye()`);
    const t = (s: number) => n(rows.find(r => r.sira === s)?.tutar);
    assert.deepEqual(rows.map(r => r.sira), [1, 2, 3, 4, 5, 6, 7, 90, 91, 92, 100]);
    assert.equal(t(1), 150000, "nakit = artı bakiyeler (pasif hesap yok)");
    assert.equal(t(2), 60000, "tahsil edilmemiş alacak");
    assert.equal(t(3), 500 + 400 + 300, "LCNRV: min(maliyet, KDV hariç NRV); maliyetsiz ve kukla girmez");
    assert.equal(t(4), 1000000, "yoldaki ödenmiş (RİSKLİ hariç)");
    assert.deepEqual([t(5), t(6), t(7)], [-400000, -250000, -20000], "kredi kalan, kart toplam, kullanılan KMH");
    assert.equal(t(90), null); assert.match(rows.find(r => r.sira === 90)!.aciklama, /BILINMIYOR: 1 SKU, 7 adet/);
    assert.equal(t(91), 350000, "ödenmemiş gümrük/navlun bilgi satırı (iki taraflı, net 0)");
    assert.equal(t(92), 320); assert.match(rows.find(r => r.sira === 92)!.aciklama, /BILINMIYOR: 1 SKU satiyor ama birim maliyeti yok/);
    const total = 150000 + 60000 + 1200 + 1000000 - 400000 - 250000 - 20000;
    assert.equal(t(100), total);
    assert.match(rows.find(r => r.sira === 3)!.aciklama, /^3 SKU; 1 SKU NRV maliyetin altinda/, "değerlenen 3 SKU, 1i zararına satılıyor");

    // 2) Bağımsız ikinci uygulama (mutabakat SQL'i) aynı sayıyı verir
    const [rec] = await q<Record<string, string>>(readFileSync("scripts/cfo/metric-reconciliation.sql", "utf8"));
    assert.equal(n(rec.net_sozlesme), total, "metric-reconciliation.sql net_sozlesme = cfo_metrik_net_sermaye()");

    // 3) Snapshot → fm_balance_day v3 → Goal: yalnız en yeni sürüm, eğilim sürüm karıştırmaz
    await db.exec(`select cfo_take_snapshot('sozlesme')`);
    const snap = (await q<{ c: string; nw: string }>(`select "contractNetWorthTry"::text c, "netWorthTry"::text nw from cfo_snapshot where note = 'sozlesme'`))[0];
    assert.equal(n(snap.c), total, "snapshot sözleşme değerini yazar");
    assert.equal(n(snap.nw), dar, "eski DAR alanı aynen (geriye uyum)");
    await db.exec(`select fm_balance_refresh('2020-01-01')`);
    const v3 = await q<{ v: string; src: string }>(`select value_try::text v, source src from fm_balance_day where metric_key = 'net_capital_try' and definition_version = 3`);
    assert.deepEqual(v3.map(r => [n(r.v), r.src]), [[total, "cfo_snapshot.contractNetWorthTry"]], "yalnız sözleşme snapshot'ı v3 üretir");
    const w3 = await wealth();
    assert.equal(w3.inputs.definition_version, 3);
    assert.equal(n(w3.observed_value_try), total, "Goal wealth_usd = sözleşme net sermayesi");
    assert.ok(w3.flags.includes("goal_short_history"), "v3 tek gözlem: eğilim v2 ile karıştırılmaz");
    assert.equal((await q(`select 1 from fm_balance_day where metric_key = 'debt_try' and definition_version = 3`)).length, 0, "borç tanımı değişmedi (CFO-002)");

    // Sözleşme fonksiyonu hata verirse snapshot yine yazılır (sözleşme NULL); sabah snapshot'ı asla durmaz
    // (görünüm adı değişince cfo_servet_kalem OID ile bağlı kalır, sözleşme fonksiyonu adla çözer → yalnız sözleşme hata verir)
    await db.exec(`alter view cfo_stok_deger rename to cfo_stok_deger_x; select cfo_take_snapshot('hata'); alter view cfo_stok_deger_x rename to cfo_stok_deger;`);
    const hs = await q<{ c: string | null; nw: string }>(`select "contractNetWorthTry"::text c, "netWorthTry"::text nw from cfo_snapshot where note = 'hata'`);
    assert.deepEqual([hs.length, hs[0].c, n(hs[0].nw)], [1, null, dar], "sözleşme hatası: snapshot yazılır, sözleşme NULL (sahte sayı yok)");

    // 4) Yetki: anon/authenticated çalıştıramaz
    const ex = (await q<{ a: boolean; u: boolean }>(`select has_function_privilege('anon','public.cfo_metrik_net_sermaye()','execute') a,
      has_function_privilege('authenticated','public.cfo_metrik_net_sermaye()','execute') u`))[0];
    assert.deepEqual([ex.a, ex.u], [false, false]);
    console.log(`Net sermaye sözleşmesi: bileşenler (LCNRV, KMH, BİLİNMİYOR stok 0 sayılmaz), mutabakat eşitliği, snapshot → v3 → Goal (sürüm karışmaz), yetki passed (toplam ${total})`);
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
