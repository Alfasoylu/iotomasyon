import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { dutyGapSql, evaluateCfoAlarms, DUTY_GAP_POINTS, type AlarmInput } from "../lib/cfo-agent/health";

// CFO-026 (migration 20261009210000): GTİP bazında yasal gümrük yükü. Üretim kopyası üzerinde: oran tablosu (Çin, 2026), en uzun önek
// eşleşmesi (12 hane → 6 haneli başlık), yasal yük = (1 + GV + İGV) × (1 + KDV) − 1, kayıtlı gümrük % farkı, eksik stok maliyeti,
// dropship (≥1000) hariç, duty_gap alarmı, yetkiler. Çalıştır: node --conditions=react-server --import tsx __tests__/cfo-gtip-tarife.test.ts
const MIG = "20261009210000_cfo_gtip_tarife";
const n = (v: unknown) => (v == null ? null : Number(v));

async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => db.exec(s), query: <T,>(s: string, p?: unknown[]) => db.query<T>(s, p) });
    for (const m of res.pendingInProduction) await db.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    assert.ok(res.pendingInProduction.includes(MIG), "üretimde uygulandı (2026-10-09); test yeniden uygular (idempotent)");
    const sql = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
    await db.exec(sql); await db.exec(sql);
    const q = async <T,>(s: string) => (await db.query<T>(s)).rows;

    const t = (await q<{ n: number }>(`select count(*)::int n from cfo_gtip_tarife`))[0].n;
    assert.ok(t >= 60, "oran tablosu dolu");
    await db.exec(`insert into "Product"(id, sku, name, gtip1, "customsRatePct", "unitCostTry", "stockQuantity", "updatedAt") values
      ('k','KAM','kamera','8525.89.00.00.00',40,1000,10,now()),
      ('b','BAT','batarya','8481.80.19.00.05',80,500,4,now()),
      ('d','DED','metal dedektörü','8543.70.90.00.11',30,2000,5,now()),
      ('s','SW','switch','8517.62.00.90.19',30,300,2,now()),
      ('x','DROP','dropship kablo','8544.42.90.00.19',30,100,5000,now()),
      ('u','BIL','bilinmeyen','9999.99.99.99.99',30,100,3,now()),
      ('e','ESKI','eski format','85.25.81.99.00',30,100,3,now())`);
    const v = Object.fromEntries((await q<Record<string, unknown>>(`select * from cfo_gtip_yuk`)).map(r => [r.sku as string, r]));
    assert.deepEqual([n(v.KAM.gv_pct), n(v.KAM.igv_pct), n(v.KAM.yasal_yuk_pct), n(v.KAM.otv_pct)], [4.9, 0, 25.9, 20], "kamera: GV %4,9, İGV 0, ÖTV muhtemel %20");
    assert.equal(n(v.KAM.yasal_yuk_otv_pct), 51.1, "ÖTV'li yük ayrı sütunda");
    assert.deepEqual([v.BAT.tarife_gtip, n(v.BAT.yasal_yuk_pct)], ["848180", 52.6], "batarya: 12 hane yoksa 6 haneli başlık (alt pozisyonlar aynı oran)");
    assert.deepEqual([n(v.DED.yasal_yuk_pct), n(v.DED.fark_puan)], [48.4, -18.4], "metal dedektörü İGV %20");
    assert.equal(n(v.DED.eksik_maliyet_tl), Math.round(5 * 2000 * (1.237 * 1.2 / 1.3 - 1) * 100) / 100, "eksik maliyet = stok × birim × ((1+yasal)/(1+kayıtlı) − 1)");
    assert.deepEqual([n(v.SW.yasal_yuk_pct), n(v.SW.eksik_maliyet_tl)], [20, 0], "switch: yalnız KDV; kayıtlı fazlaysa eksik yok");
    assert.deepEqual([n(v.DROP.stok), n(v.DROP.eksik_maliyet_tl)], [0, 0], "dropship yer tutucu (≥1000) hariç");
    assert.equal(v.BIL.tarife_gtip, null, "eşleşmeyen GTİP: oran yok (tahmin yok)");
    assert.equal(v.ESKI.tarife_gtip, null, "2026 tarifesinde olmayan eski kod eşleşmez");

    const [g] = await q<{ n: number; t: string; sku: string; k: string; y: string }>(dutyGapSql());
    assert.deepEqual([g.n, g.sku, n(g.k), n(g.y)], [1, "DED", 30, 48.4], `yalnız ${DUTY_GAP_POINTS}+ puan altındaki stoklu ürün`);
    const base: AlarmInput = { now: new Date(), engineEnabled: true, runs: [{ status: "completed", generatedAt: new Date(), finishedAt: new Date(), error: null }],
      minPosition: null, floorTry: -3_000_000, payments: [], sources: [], staleBankAccounts: [] };
    const a = evaluateCfoAlarms({ ...base, dutyGap: { count: g.n, missingTry: Number(g.t), worst: { sku: g.sku, kayitliPct: Number(g.k), yasalPct: Number(g.y) } } });
    assert.deepEqual(a.map(x => x.key), ["duty_gap"]);
    assert.match(a[0].message, /1 stoklu üründe .*DED \(kayıtlı %30, yasal %48\.4\)/);
    assert.deepEqual(evaluateCfoAlarms({ ...base, dutyGap: { count: 0, missingTry: 0, worst: null } }), [], "fark yoksa alarm yok");

    const pr = (await q<{ a: boolean; u: boolean; r: boolean; rls: boolean }>(`select has_table_privilege('anon','public.cfo_gtip_tarife','select') a,
      has_table_privilege('authenticated','public.cfo_gtip_yuk','select') u, has_table_privilege('cfo_acceptance_reader','public.cfo_gtip_yuk','select') r,
      (select relrowsecurity from pg_class where oid = 'public.cfo_gtip_tarife'::regclass) rls`))[0];
    assert.deepEqual([pr.a, pr.u, pr.r, pr.rls], [false, false, true, true]);

    // 20261009220000: eşleşmeyen 51 ürünün 35 GTİP'i (yalnız ekleme, idempotent; mevcut satır değişmez)
    const EK = "20261009220000_cfo_gtip_tarife_ek";
    const ekSql = readFileSync(`prisma/migrations/${EK}/migration.sql`, "utf8");
    await db.exec(ekSql); await db.exec(ekSql);
    const ekKodlar = [...ekSql.matchAll(/^\s*\('(\d{12})',/gm)].map(m => m[1]);
    assert.equal(ekKodlar.length, 35);
    assert.equal((await db.query<{ n: number }>(`select count(*)::int n from cfo_gtip_tarife where gtip = any($1)`, [ekKodlar])).rows[0].n, 35, "35 yeni oran satırı");
    await db.exec(`insert into "Product"(id, sku, name, gtip1, "customsRatePct", "unitCostTry", "stockQuantity", "updatedAt") values
      ('pz','PENSE','rj45 pense','8203.20.00.00.11',50,100,3,now()), ('av','AVKAY','hdmi kaydedici','8521.90.00.00.00',40,500,2,now()),
      ('pda','PDA','el terminali','8517.13.00.00.19',30,3000,1,now())`);
    const v2 = Object.fromEntries((await q<Record<string, unknown>>(`select * from cfo_gtip_yuk where sku in ('PENSE','AVKAY','PDA')`)).map(r => [r.sku as string, r]));
    assert.deepEqual([v2.PENSE.tarife_gtip, n(v2.PENSE.gv_pct), n(v2.PENSE.igv_pct), n(v2.PENSE.yasal_yuk_pct)], ["820320000011", 1.7, 25, 52], "pense alt kodu .11: GV %1,7 + İGV %25");
    assert.deepEqual([n(v2.AVKAY.gv_pct), n(v2.AVKAY.otv_pct), n(v2.AVKAY.yasal_yuk_pct), n(v2.AVKAY.yasal_yuk_otv_pct)], [13.9, 6.7, 36.7, 45.8], "8521.90 ÖTV (IV) %6,7 ayrı sütunda");
    assert.deepEqual([n(v2.PDA.otv_pct), v2.PDA.dogrulandi], [25, false], "PDA: telefon ÖTV bandının alt sınırı, doğrulanmamış");
    console.log(`GTİP yasal yük: ${t} oran satırı, önek eşleşmesi, yasal yük/ÖTV, eksik maliyet, dropship hariç, duty_gap alarmı, yetkiler passed`);
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
