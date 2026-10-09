import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";

// Hedef motoru kaynak tazeliği (migration 20261009130000, RF-20261008-025 ikinci yarı): hız / projeksiyon yalnız TÜM satış kaynaklarının
// (Trendyol senkronu, Entegra içe aktarımı) o gün bittikten sonra okunduğu günlerden; gözlenen MTD aynen. Üretim 09.10 senaryosu.
// Çalıştır: node --import tsx __tests__/fm-goal-kaynak.test.ts
const MIG = readFileSync("prisma/migrations/20261009130000_fm_goal_kaynak_tazeligi/migration.sql", "utf8");
type Goal = { state: string; grade: string; flags: string[]; observed_value_try: string | null; current_rate_try_per_day: string | null;
  projected_value_try: string | null; required_rate_try_per_day: string | null; inputs: Record<string, unknown> };
const n = (v: string | null) => (v == null ? null : Number(v));

async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => db.exec(s), query: <T,>(s: string, p?: unknown[]) => db.query<T>(s, p) });
    for (const m of res.pendingInProduction) await db.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    await db.exec("set search_path = public");
    const q = async <T,>(s: string) => (await db.query<T>(s)).rows;
    const rev = async (asOf: string) => {
      await q(`select fm_goal_evaluate('${asOf}'::date)`);
      return (await q<Goal>(`select state, grade, flags, observed_value_try, current_rate_try_per_day, projected_value_try, required_rate_try_per_day, inputs
        from fm_goal_observation where goal_key = 'revenue_month_usd' and as_of = '${asOf}' order by evaluated_at desc limit 1`))[0];
    };
    await db.exec(`insert into cfo_settings (id, "usdTryRate", "monthlyRevenueTargetUsd", "usdWealthTarget", "wealthTargetDate", "netPositionFloorTry", "updatedAt")
        values ('s1', 48, 100000, 300000, '2027-12-31', -3000000, now());
      insert into fm_fx_monthly (month, usd_try_forex_buying, ref_date, bulletin_no, is_fallback_day, source_url, fetched_at)
        values ('2026-09-01', 48.5585, '2026-09-15', 'x', false, 'synthetic', now());
      -- hafıza 09.10 05:32 TR tazelendi → "tamamlanmış gün" eski kurala göre 08.10'a kadar
      insert into fm_ingest_run (kind, status, finished_at, lineage) values ('sales_refresh', 'succeeded', '2026-10-09 02:32:57+00', '{}');
      insert into fm_sales_company_day (economic_date, revenue_incl_vat_try, revenue_legacy_textile_try, units, orders, return_signal_orders, cancel_signal_orders, flags) values
        ('2026-10-01', 58000, 0, 1, 1, 0, 0, '{}'), ('2026-10-02', 58000, 0, 1, 1, 0, 0, '{}'), ('2026-10-03', 58000, 0, 1, 1, 0, 0, '{}'),
        ('2026-10-04', 58000, 0, 1, 1, 0, 0, '{}'), ('2026-10-05', 52000, 0, 1, 1, 0, 0, '{}'), ('2026-10-06', 52000, 0, 1, 1, 0, 0, '{}'),
        ('2026-10-07', 52000, 0, 1, 1, 0, 0, '{}'), ('2026-10-08', 3000, 0, 1, 1, 0, 0, '{}');
      -- kaynak okunma anları (UTC, Prisma): Trendyol 08.10 06:11 → 07.10'a kadar tam; Entegra 05.10 09:06 → 04.10'a kadar tam
      insert into "TrendyolSalesRecord" (id, "orderId", "lineId", "orderDate", status, "productName", quantity, "unitPriceTry", "totalPriceTry", "syncedAt")
        values ('t1', '9001', 1, '2026-10-07 10:00', 'Delivered', 'Urun', 1, 100, 100, '2026-10-08 06:11:51');
      insert into "MarketplaceSalesRecord" (id, channel, "orderNumber", "orderDate", status, quantity, "totalAmountTry", "importedAt")
        values ('m1', 'HEPSIBURADA', 'HB-1', '2026-10-04', 'Onaylandı', 1, 100, '2026-10-05 09:06:34');`);
    await db.exec(MIG);
    await db.exec(MIG); // idempotent
    await db.exec(`refresh materialized view fm_sales_canonical_snapshot`);

    const g = await rev("2026-10-09");
    assert.equal(n(g.observed_value_try), 391000, "gözlenen MTD (kısmi günler dahil) aynen");
    assert.equal(n(g.current_rate_try_per_day), 58000, "hız yalnız 01–04.10 (tüm kaynaklar tamam)");
    assert.equal(n(g.projected_value_try), 58000 * 31);
    const target = Math.round(100000 * 48.5585 * 100) / 100;
    assert.equal(n(g.required_rate_try_per_day), Math.round((target - 232000) / 27 * 100) / 100, "gereken hız da tam pencereden");
    assert.ok(g.flags.includes("goal_sources_partial"));
    assert.ok(g.flags.includes("goal_short_window"), "4 tam gün < 7");
    assert.equal(g.grade, "B");
    assert.equal(g.inputs.rate_through, "2026-10-04");
    assert.equal(g.inputs.trendyol_complete_through, "2026-10-07");
    assert.equal(g.inputs.marketplace_complete_through, "2026-10-04");
    assert.equal(g.inputs.complete_through, "2026-10-08");

    // Entegra yeni içe aktarım (09.10 10:00 UTC) + Trendyol senkronu → hepsi 08.10'a kadar tam: eski davranış (bayrak yok)
    await db.exec(`update "MarketplaceSalesRecord" set "importedAt" = '2026-10-09 10:00'; update "TrendyolSalesRecord" set "syncedAt" = '2026-10-09 10:00';
      refresh materialized view fm_sales_canonical_snapshot;`);
    const h = await rev("2026-10-09");
    assert.equal(n(h.current_rate_try_per_day), Math.round(391000 / 8 * 100) / 100);
    assert.ok(!h.flags.includes("goal_sources_partial"));

    // Hiç tam gün yok (ayın 2'si, Entegra 30.09'da kalmış): eski hesap + bayrak + kalite C
    await db.exec(`update "MarketplaceSalesRecord" set "importedAt" = '2026-09-30 09:00'; refresh materialized view fm_sales_canonical_snapshot;
      insert into fm_ingest_run (kind, status, finished_at, lineage) values ('sales_refresh', 'succeeded', '2026-10-10 02:00:00+00', '{}');`);
    const k = await rev("2026-10-02");
    assert.ok(k.flags.includes("goal_sources_partial"));
    assert.equal(k.grade, "C");
    assert.equal(n(k.current_rate_try_per_day), 58000);
    console.log("Goal source freshness: rate/projection from fully-sourced days only, observed MTD unchanged, flag + grade, fallback passed");
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
