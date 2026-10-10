import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { newHamleRow, type NewHamle } from "../lib/cfo/decision-memory";
import { INSERT_HAMLE_SQL, MEASURE_SOURCE, loadDecisionMemory, measureDecisions, type MeasureDb } from "../lib/cfo/decision-memory-data";

// CFO-012 (2026-10-10) — karar hafızası yazma yolları, üretim şemasında (baseline + bekleyen migration'lar):
//   yeni karar kaydı (INSERT_HAMLE_SQL: beklenen SAYI'lı satır, var olan kod üzerine yazılmaz, cfo_change_log strateji/karar),
//   kontrol noktası ölçümü (measureDecisions + MEASURE_SQL: borç o günün bakiyesinden, kart+KMH bugünkü bakiyeden; tekrar koşu yazmaz;
//   kapalı karar ölçülmez; veri yoksa atlanır; cfo_change_log strateji/analiz özet), okuyucu ölçümleri görür.
// Çalıştır: node --import tsx __tests__/cfo-decision-measure.test.ts

async function main() {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const mig of res.pendingInProduction) await pg.exec(readFileSync(`prisma/migrations/${mig}/migration.sql`, "utf8"));
    await pg.exec("set search_path = public; delete from cfo_hamle_olcum; delete from cfo_hamle; delete from cfo_change_log; delete from fm_balance_day; delete from cfo_credit_card;");
    const db: MeasureDb = { query: async <T,>(s: string, ...p: unknown[]) => (await pg.query<T>(s, p)).rows };
    const q = <T,>(s: string) => db.query<T>(s);

    // ── yeni karar kaydı ──
    const h11: NewHamle = { kod: "H11-ITHALAT-DURDUR", baslik: "İthalat durdur", kararTarihi: "2026-10-02", alan: "borç", neden: "kart+KMH yüksek",
      yapilan: "yeni sipariş yok", metric: "card_kmh_try", baslangicDeger: 2366017, beklenenDeger: 1000000, ilkOlcumTarihi: "2026-10-31" };
    const h09: NewHamle = { kod: "H09-BORC", baslik: "Borç 6M", kararTarihi: "2026-09-21", alan: "borç", neden: "faiz", yapilan: "alım durdur",
      metric: "debt_try", baslangicDeger: 9113838, beklenenDeger: 6000000, ilkOlcumTarihi: "2026-10-31", beklenenEtki: "31.12.2026 net borç 6.000.000" };
    for (const h of [h11, h09]) assert.equal((await db.query<{ n: number }>(INSERT_HAMLE_SQL, JSON.stringify(newHamleRow(h)), "test"))[0].n, 1);
    assert.equal((await db.query<{ n: number }>(INSERT_HAMLE_SQL, JSON.stringify(newHamleRow({ ...h11, baslik: "üzerine yaz" })), "test"))[0].n, 0, "var olan kod üzerine yazılmaz");
    const saved = (await q<{ baslik: string; durum: string; olcum_metrigi: string; beklenen_deger: string }>(`select baslik, durum, olcum_metrigi, beklenen_deger::text from cfo_hamle where kod = 'H11-ITHALAT-DURDUR'`))[0];
    assert.deepEqual([saved.baslik, saved.durum, saved.olcum_metrigi.startsWith("card_kmh_try"), Number(saved.beklenen_deger)], ["İthalat durdur", "KARAR_VERILDI", true, 1000000]);
    assert.equal(Number((await q<{ n: string }>(`select count(*)::text n from cfo_change_log where area = 'strateji' and kind = 'karar'`))[0].n), 2, "her kayıt günlükte, ret günlüğe düşmez");
    await pg.exec(`insert into cfo_hamle (kod, baslik, karar_tarihi, alan, durum, neden, yapilan, olcum_metrigi, baslangic_deger, beklenen_deger, ilk_olcum_tarihi)
      values ('X-KAPALI', 'kapalı', '2026-09-01', 'borç', 'SONUCLANDI', 'n', 'y', 'debt_try — toplam borç', 9e6, 8e6, '2026-10-01'),
             ('H06-SET', 'set', '2026-09-07', 'ürün', 'OLCULUYOR', 'n', 'y', 'Satilan set adedi ve kar', 0, null, '2026-10-31')`);

    // ── veri ──
    await pg.exec(`insert into fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at) values
        ('2026-10-30', 'debt_try', 1, 8800000, 't', now()), ('2026-11-01', 'debt_try', 1, 8700000, 't', now());
      insert into cfo_credit_card (id, bank, holder, "totalDebtTry", "isActive", "updatedAt") values ('c1', 'Akbank', 'Şirket', 1900000, true, now())`);

    // kontrol noktası gelmeden yazılmaz
    assert.deepEqual(await measureDecisions(db, new Date("2026-10-20T08:00:00Z")), { planned: 0, written: 0, skipped: [] });
    // 31.10 (aynı gün): canlı bakiye yazılır, borç günü kapanmadan yazılmaz
    const r1 = await measureDecisions(db, new Date("2026-10-31T08:00:00Z"));
    assert.deepEqual([r1.planned, r1.written], [1, 1]);
    // 02.11: borç 31.10 itibarıyla (önce ≤ gün: 30.10 bakiyesi), kart+KMH tekrar yazılmaz
    const r2 = await measureDecisions(db, new Date("2026-11-02T08:00:00Z"));
    assert.deepEqual([r2.planned, r2.written], [1, 1]);
    const rows = await q<{ hamle_kod: string; d: string; v: string; not_: string }>(`select hamle_kod, olcum_tarihi::text d, deger::text v, not_ from cfo_hamle_olcum order by hamle_kod`);
    assert.deepEqual(rows.map(r => [r.hamle_kod, r.d, Number(r.v)]), [["H09-BORC", "2026-10-31", 8800000], ["H11-ITHALAT-DURDUR", "2026-10-31", 1900000]]);
    assert.match(rows[0].not_, /fm_balance_day 2026-10-30/); assert.match(rows[1].not_, /geçmiş tarihli okunamaz/);
    assert.deepEqual(await measureDecisions(db, new Date("2026-11-03T08:00:00Z")), { planned: 0, written: 0, skipped: [] }, "tekrar koşu yazmaz");
    // hedef tarihi (31.12) ayrı kontrol noktası; o güne ±3 gün borç bakiyesi yoksa atlanır (0 yazılmaz), veri gelince yazılır
    const r3 = await measureDecisions(db, new Date("2027-01-02T08:00:00Z"));
    assert.deepEqual([r3.planned, r3.written, r3.skipped.length], [1, 0, 1]);
    await pg.exec(`insert into fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at) values ('2027-01-01', 'debt_try', 1, 6100000, 't', now())`);
    assert.equal((await measureDecisions(db, new Date("2027-01-02T09:00:00Z"))).written, 1, "önce ≤ gün yoksa sonraki en yakın gün (+1)");
    // eşzamanlı ikinci yazım (aynı plan) NOT EXISTS ile düşer
    const dup = JSON.stringify([{ kod: "H09-BORC", cp: "2026-12-31", olcum: "2026-12-31", deger: 1, note: "x" }, { kod: "X-KAPALI", cp: "2026-10-01", olcum: "2026-10-01", deger: 1, note: "x" }]);
    assert.equal((await db.query<{ n: number }>(`${(await import("../lib/cfo/decision-memory-data")).MEASURE_SQL}`, dup, MEASURE_SOURCE))[0].n, 0, "aynı nokta / kapalı karar yazılmaz");
    const log = await q<{ n: string; kinds: string }>(`select count(*)::text n, string_agg(distinct area || '/' || kind, ',') kinds from cfo_change_log where source = '${MEASURE_SOURCE}'`);
    assert.deepEqual([log[0].n, log[0].kinds], ["3", "strateji/analiz"], "yazan her koşu bir özet satırı");
    assert.equal(Number((await q<{ n: string }>(`select count(*)::text n from cfo_hamle_olcum where hamle_kod in ('X-KAPALI','H06-SET')`))[0].n), 0, "kapalı / elle ölçülen karar ölçülmez");

    // okuyucu: ölçümler + isabet (H09 31.12 ölçümü 6,1M; beklenen 6,0M → ıska, iyimser)
    const dm = await loadDecisionMemory(q, new Date("2027-01-03T08:00:00Z"));
    assert.deepEqual(dm.measurements.get("H09-BORC")?.map(m => m.date), ["2026-10-31", "2026-12-31"]);
    assert.equal(dm.calibration.hitRate, 0); assert.ok(dm.calibration.bias! > 0);
    assert.deepEqual(dm.evals.filter(e => e.status === "MISSING_EXPECTATION").map(e => e.kod), ["H06-SET"],
      "kural tarihinden sonra (now()) beklenen SAYI'sız açık karar bayraklanır; form ile kaydedilenler bayraklanmaz");
    console.log("CFO-012 decision measurement: new-decision insert (no overwrite, logged), checkpoint measurements (as-of debt, live card+KMH, idempotent, closed/manual skipped, missing data skipped), calibration from measurements passed");
  } finally { await pg.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
