import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { freshness, lastCompleteDays, lastFullMonth, revenueRange, revenueTargetCard, toRevenueRange, shiftDay } from "../lib/cfo/revenue";
import { computeCfo, type CfoInput } from "../lib/cfo/engine";
import type { SqlQuery } from "../lib/cfo/capital-efficiency-data";

// CFO-008 (RF-20261008-009, 2026-10-10): TEK CİRO KAYNAĞI = Goal Engine satırları (fm_sales_canonical_snapshot, disposition COUNTED).
// İade/iptal/arşiv hariç, IDEASOFT ve Alfashome (sipariş durumuna göre) dahil, KDV dahil; tamlık Goal Engine kuralıyla (hafıza tazeleme − 1,
// her kaynağın okunma günü − 1). Eski motor / gelir kaldıraçları / borç tahmini / /admin/sermaye / Alfashome kanıtı / hedef kartı bunu okur.
// Çalıştır: node --import tsx __tests__/cfo-revenue.test.ts

// ── saf ──
assert.equal(shiftDay("2026-10-01", -1), "2026-09-30");
const f = freshness({ memory_through: "2026-10-08", ty_through: "2026-10-07", mp_through: "2026-10-04" }, "2026-10-09");
assert.deepEqual([f.memoryThrough, f.allSourcesThrough], ["2026-10-08", "2026-10-04"], "en geç kalan kaynak sınırı belirler");
assert.equal(freshness({ memory_through: null, ty_through: "2026-10-07" }, "2026-10-09").allSourcesThrough, null, "hafıza hiç tazelenmediyse tam gün yok");
assert.equal(freshness({ memory_through: "2026-10-20" }, "2026-10-09").allSourcesThrough, "2026-10-08", "bugün hiçbir zaman tam değil");
const m = toRevenueRange({ memory_through: "2026-10-08", incl: "1000", rows: 3 }, "2026-09-01", "2026-09-30", "2026-10-09");
assert.equal(m.complete, true);
assert.equal(revenueTargetCard(m, null, 48.5), null, "hedef yoksa kart yok (100.000 USD yedeği yok)");
assert.equal(revenueTargetCard(m, 100000, null), null, "kur yoksa kart yok (sabit kur yedeği yok)");
assert.deepEqual(revenueTargetCard({ ...m, inclTry: 1942500 }, 100000, 48.5)?.ciro_usd, 40052);
const engine = computeCfo({ settings: null, banks: [], cards: [], loans: [], expenses: [], imports: [], receivables: [], cashEvents: [], today: new Date(2026, 9, 9),
  revenue14: { amountTry: 140000, through: "2026-10-04", source: "tek kaynak" } } as CfoInput);
assert.deepEqual([engine.last14dRevenueTry, engine.monthlyRunRateTry, engine.revenueDataAgeDays, engine.revenueSource], [140000, 300000, 5, "tek kaynak"]);
assert.equal(computeCfo({ settings: null, banks: [], cards: [], loans: [], expenses: [], imports: [], receivables: [], cashEvents: [], revenue14: null } as CfoInput).last14dRevenueTry, null,
  "tam gün yoksa ciro BİLİNMİYOR (elle girilen eski alana düşmez)");

async function main() {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const mig of res.pendingInProduction) await pg.exec(readFileSync(`prisma/migrations/${mig}/migration.sql`, "utf8"));
    await pg.exec("set search_path = public");
    const q: SqlQuery = async <T,>(s: string) => (await pg.query<T>(s)).rows;
    const now = new Date("2026-10-09T08:00:00Z");

    assert.equal(await lastCompleteDays(q, 14, now), null, "hafıza hiç tazelenmedi → tam gün yok → BİLİNMİYOR");
    await pg.exec(`
      insert into fm_ingest_run (kind, status, finished_at, lineage) values ('sales_refresh', 'succeeded', '2026-10-09 02:32:57+00', '{}');
      insert into "TrendyolSalesRecord" (id, "orderId", "lineId", "orderDate", status, "productName", quantity, "unitPriceTry", "totalPriceTry", "syncedAt") values
        ('t1', '9001', 1, '2026-10-03 10:00', 'Delivered', 'Urun', 1, 1000, 1000, '2026-10-08 06:11:51'),
        ('t2', '9002', 1, '2026-10-04 10:00', 'Cancelled', 'Urun', 1, 500, 500, '2026-10-08 06:11:51');
      insert into "MarketplaceSalesRecord" (id, channel, "orderNumber", "orderDate", status, quantity, "totalAmountTry", "importedAt") values
        ('m1', 'HEPSIBURADA', 'HB-1', '2026-10-02', 'Onaylandı', 1, 2000, '2026-10-05 09:06:34'),
        ('m2', 'HEPSIBURADA', 'HB-2', '2026-10-03', 'İade-İptal', 1, 700, '2026-10-05 09:06:34'),
        ('m3', 'HEPSIBURADA', 'HB-3', '2026-10-04', 'İadesi Onaylanan', 1, 300, '2026-10-05 09:06:34'),
        ('m4', 'IDEASOFT', 'IS-1', '2026-10-04', 'Onaylandı', 1, 400, '2026-10-05 09:06:34'),
        ('m5', 'HEPSIBURADA', 'HB-9', '2026-09-15', 'Onaylandı', 1, 9000, '2026-10-05 09:06:34');
      insert into alfashome_order (id, ordered_at, amount, status, payment_status, item_qty, synced_at) values
        ('a1', '2026-10-03 10:00+03', 1500, 'pending', null, 1, '2026-10-08 06:00+03'),
        ('a2', '2026-10-03 11:00+03', 900, 'canceled', null, 1, '2026-10-08 06:00+03'),
        ('a3', '2026-10-03 12:00+03', 800, 'archived', null, 1, '2026-10-08 06:00+03');
      refresh materialized view fm_sales_canonical_snapshot;`);

    const r = await revenueRange(q, "2026-10-01", "2026-10-07", now);
    const [live] = await q<{ v: string }>(`select coalesce(sum(revenue_incl_vat_try), 0)::text v from fm_sales_canonical
      where disposition = 'COUNTED' and economic_date between '2026-10-01' and '2026-10-07'`);
    assert.equal(r.inclTry, Number(live.v), "tek kaynak = Goal Engine'in kanonik satırları (canlı görünümle aynı)");
    assert.ok(r.inclTry >= 2000 + 400 + 1500 && r.inclTry <= 2000 + 400 + 1500 + 1000, `iade/iptal/arşiv hariç, IDEASOFT + Alfashome dahil: ${r.inclTry}`);
    assert.deepEqual([r.alfashomeInclTry, r.alfashomeOrders], [1500, 1], "Alfashome sipariş durumuna göre (iptal/arşiv hariç, ödeme durumu boş)");
    assert.ok(r.exclTry > 0 && r.exclTry < r.inclTry, "KDV hariç yan gösterge");
    assert.deepEqual([r.memoryThrough, r.allSourcesThrough, r.complete], ["2026-10-08", "2026-10-04", false], "Entegra 04.10'a kadar tam → aralık eksik");

    const last3 = await lastCompleteDays(q, 3, now);
    assert.deepEqual([last3?.from, last3?.to, last3?.complete], ["2026-10-02", "2026-10-04", true], "son N TAM gün = tüm kaynakların sınırı");
    const sep = await lastFullMonth(q, now);
    assert.deepEqual([sep.from, sep.to, sep.inclTry], ["2026-09-01", "2026-09-30", 9000]);

    const pr = (await q<{ s: boolean }>(`select has_table_privilege('cfo_acceptance_reader','public.fm_sales_canonical_snapshot','select') s`))[0];
    console.log(`CFO-008 tek ciro kaynağı: Goal Engine satırları (iade/iptal/arşiv hariç, IDEASOFT + Alfashome dahil), tamlık sınırı, son N tam gün, geçen ay, hedef kartı, eski motor girişi; reader select ${pr.s} passed`);
  } finally { await pg.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
