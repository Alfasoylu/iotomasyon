import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";

// Goal Engine v1 (20261006130000_fm_goal_engine) on the clean-DB reproduction of production (baseline + newer migrations).
// Synthetic data only. Unknown stays UNKNOWN (never 0), grades are the worst input, observations are idempotent and versioned.
const MIG = readFileSync("prisma/migrations/20261006130000_fm_goal_engine/migration.sql", "utf8");
type Goal = { goal_key: string; goal_version: number; state: string; grade: string; flags: string[]; observed_value_try: string | null; target_value_try: string | null;
  progress_pct: string | null; gap_try: string | null; current_rate_try_per_day: string | null; required_rate_try_per_day: string | null;
  projected_value_try: string | null; projected_on: string | null; period_start: string | null; inputs: Record<string, unknown> };
const n = (v: string | null) => (v == null ? null : Number(v));

async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
    const res = await bootstrap({ exec: (s: string) => db.exec(s), query: <T,>(s: string, p?: unknown[]) => db.query<T>(s, p) });
    assert.ok(res.pendingInProduction.includes("20261006130000_fm_goal_engine"));
    for (const m of res.pendingInProduction) await db.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    await db.exec("set search_path = public");
    const q = async <T,>(s: string) => (await db.query<T>(s)).rows;
    const goals = async () => Object.fromEntries((await q<Goal>(`select goal_key, goal_version, state, grade, flags, observed_value_try, target_value_try, progress_pct, gap_try, current_rate_try_per_day, required_rate_try_per_day, projected_value_try, projected_on::text projected_on, period_start::text period_start, inputs from fm_memory_goal`)).map(g => [g.goal_key, g]));
    const evaluate = async (d: string) => (await q<{ r: { written: number; unchanged: number } }>(`select fm_goal_evaluate('${d}'::date) r`))[0].r;

    // ---- synthetic inputs
    await db.exec(`insert into cfo_settings (id, "usdTryRate", "monthlyRevenueTargetUsd", "usdWealthTarget", "wealthTargetDate", "netPositionFloorTry", "updatedAt")
        values ('s1', 48, 100000, 300000, '2027-12-31', -3000000, now());
      insert into fm_fx_monthly (month, usd_try_forex_buying, ref_date, bulletin_no, is_fallback_day, source_url, fetched_at)
        values ('2026-09-01', 42, '2026-09-15', 'x', false, 'synthetic', now());
      insert into fm_ingest_run (kind, status, finished_at, lineage) values ('sales_backfill', 'succeeded', '2026-10-11 00:30:00+00', '{}');
      insert into fm_sales_company_day (economic_date, revenue_incl_vat_try, revenue_legacy_textile_try, units, orders, return_signal_orders, cancel_signal_orders, flags)
        select d, 150000, 0, 10, 5, 0, 0, '{}' from generate_series('2026-09-01'::date, '2026-10-10'::date, '1 day') g(t), lateral (select t::date d) x;
      insert into fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
        select d, 'debt_try', 2, 9200000 - 20000 * (d - '2026-09-21'::date), 'cfo_snapshot', d from generate_series('2026-09-21'::date, '2026-10-10'::date, '1 day') g(t), lateral (select t::date d) x;
      insert into fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
        select d, 'net_capital_try', 2, 1400000 + 10000 * (d - '2026-09-21'::date), 'cfo_snapshot', d from generate_series('2026-09-21'::date, '2026-10-10'::date, '1 day') g(t), lateral (select t::date d) x;
      create or replace function cfo_nakit_projeksiyon(gun integer default 120) returns table(tarih date, giris numeric, cikis numeric, net numeric, pozisyon numeric, aciklama text) language sql stable as $$
        select * from (values ('2026-11-02'::date, 0::numeric, 0::numeric, 0::numeric, -3500000::numeric, 'synthetic'), ('2026-10-20'::date, 0, 0, 0, -1000000, 'synthetic')) v $$;`);

    // ---- A: as_of 2026-10-11 (memory refreshed 10-11 03:30 Istanbul → complete through 10-10)
    const a1 = await evaluate("2026-10-11");
    assert.equal(a1.written, 4);
    let g = await goals();
    const rev = g.revenue_month_usd;
    assert.equal(rev.state, "ON_TRACK"); // 1.5M in 10 days → 4.65M projected ≥ 4.2M target
    assert.equal(n(rev.target_value_try), 4200000); // TCMB (Sep, prior month) × 100k USD — not the settings rate (48)
    assert.equal(n(rev.observed_value_try), 1500000);
    assert.equal(n(rev.projected_value_try), 4650000);
    assert.equal(n(rev.required_rate_try_per_day), Math.round((4200000 - 1500000) / 21 * 100) / 100);
    assert.equal(rev.grade, "B"); // revenue A, FX prior month → B
    assert.ok(rev.flags.includes("goal_fx_prior_month"));
    assert.equal(rev.period_start, "2026-10-01");

    const debt = g.debt_below_usd; // CFO-002 (20261009180000): 5M TL hedefi emekli → cfo_settings."debtTargetUsd" (varsayılan 100k) × TCMB
    assert.equal(debt.state, "NOT_MET");
    assert.equal(n(debt.target_value_try), 4200000, "debtTargetUsd × TCMB (order gate uses the same setting and rate)");
    assert.equal((await q<{ c: number }>(`select count(*)::int c from fm_goal where goal_key = 'debt_below_5m_try' and valid_to is null`))[0].c, 0, "old 5M TL goal stays retired");
    assert.equal(n(debt.current_rate_try_per_day), -20000);
    assert.ok(debt.flags.includes("goal_trend_decreasing"));
    // 8.82M → 4.2M at 20k/day = 231 days, beyond 4 × 19-day trend span → no date is invented
    assert.equal(debt.projected_on, null);
    assert.ok(debt.flags.includes("goal_projection_horizon_exceeded"));
    assert.equal(debt.grade, "C");

    const wealth = g.wealth_usd;
    assert.equal(wealth.state, "OFF_TRACK"); // observed 10k/day < required ~24.6k/day (run-rate comparison)
    assert.equal(wealth.projected_value_try, null, "447-day horizon from a 19-day trend is not projected");
    assert.ok(wealth.flags.includes("goal_projection_horizon_exceeded"));
    assert.equal(n(wealth.target_value_try), 12600000);
    assert.ok(n(wealth.required_rate_try_per_day)! > 10000);
    assert.ok(wealth.flags.includes("goal_fx_constant_assumption"));

    const floor = g.net_position_floor_try;
    assert.equal(floor.state, "OFF_TRACK");
    assert.equal(floor.grade, "D");
    assert.equal(n(floor.observed_value_try), -3500000);
    assert.equal(floor.projected_on, "2026-11-02");
    assert.ok(floor.flags.includes("goal_projection_based"));

    // ---- B: idempotent — same day, same inputs → nothing written
    assert.deepEqual(await evaluate("2026-10-11"), { ...(await evaluate("2026-10-11")) });
    assert.equal((await evaluate("2026-10-11")).written, 0);
    assert.equal((await q<{ c: number }>(`select count(*)::int c from fm_goal_observation`))[0].c, 4);

    // ---- C: stale sales memory → UNKNOWN (missing days are not zero)
    await evaluate("2026-10-13");
    g = await goals();
    assert.equal(g.revenue_month_usd.state, "UNKNOWN");
    assert.equal(g.revenue_month_usd.grade, "U");
    assert.ok(g.revenue_month_usd.flags.includes("goal_sales_memory_stale"));
    assert.equal(g.revenue_month_usd.progress_pct, null);
    // stale balances (last 10-10, as_of 10-15 → >3 days) → UNKNOWN
    await evaluate("2026-10-15");
    g = await goals();
    assert.equal(g.debt_below_usd.state, "UNKNOWN");
    assert.ok(g.debt_below_usd.flags.includes("goal_balance_stale"));

    // ---- D: first day of month → previous month's final result
    await db.exec(`insert into fm_ingest_run (kind, status, finished_at, lineage) values ('sales_refresh', 'succeeded', '2026-10-01 01:00:00+00', '{}');`);
    await evaluate("2026-10-01");
    const prev = (await q<Goal>(`select goal_key, goal_version, state, grade, flags, observed_value_try, target_value_try, progress_pct, gap_try, current_rate_try_per_day, required_rate_try_per_day, projected_value_try, projected_on::text projected_on, period_start::text period_start, inputs from fm_goal_observation where goal_key='revenue_month_usd' and as_of='2026-10-01'`))[0];
    assert.equal(prev.period_start, "2026-09-01");
    assert.ok(prev.flags.includes("goal_previous_month_final"));
    assert.equal(n(prev.observed_value_try), 4500000); // 30 × 150k
    assert.equal(prev.state, "ACHIEVED");

    // ---- E: settings change → new goal version; old version closed, history kept
    await db.exec(`update cfo_settings set "monthlyRevenueTargetUsd" = 200000, "updatedAt" = now()`);
    await evaluate("2026-10-11");
    const versions = await q<{ version: number; open: boolean }>(`select version, valid_to is null open from fm_goal where goal_key='revenue_month_usd' order by version`);
    assert.deepEqual(versions, [{ version: 1, open: false }, { version: 2, open: true }]);
    g = await goals();
    assert.equal(g.revenue_month_usd.goal_version, 2);
    assert.equal(g.revenue_month_usd.state, "OFF_TRACK"); // 4.65M ≪ 8.4M × 0.9
    // removing a settings target retires the goal (no evaluation, no fake value)
    await db.exec(`update cfo_settings set "usdWealthTarget" = null`);
    await evaluate("2026-10-11");
    assert.equal((await goals()).wealth_usd, undefined);

    // ---- F: missing FX → USD goals UNKNOWN
    await db.exec(`update cfo_settings set "usdWealthTarget" = 300000`);
    const missingFx = await q<{ r: unknown }>(`select fm_goal_evaluate('2020-01-15'::date) r`);
    assert.ok(missingFx.length);
    const old = (await q<Goal>(`select goal_key, goal_version, state, grade, flags, observed_value_try, target_value_try, progress_pct, gap_try, current_rate_try_per_day, required_rate_try_per_day, projected_value_try, projected_on::text projected_on, period_start::text period_start, inputs from fm_goal_observation where goal_key='revenue_month_usd' and as_of='2020-01-15'`))[0];
    assert.equal(old.state, "UNKNOWN");
    assert.ok(old.flags.includes("goal_fx_missing"));

    // ---- F2: a threshold date inside the trend horizon is projected
    await db.exec(`insert into fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
      select d, 'debt_try', 2, 4800000 - 20000 * (d - '2026-11-20'::date), 'cfo_snapshot', d from generate_series('2026-11-20'::date, '2026-12-19'::date, '1 day') g(t), lateral (select t::date d) x;`);
    await evaluate("2026-12-20");
    const near = (await q<Goal>(`select goal_key, goal_version, state, grade, flags, observed_value_try, target_value_try, progress_pct, gap_try, current_rate_try_per_day, required_rate_try_per_day, projected_value_try, projected_on::text projected_on, period_start::text period_start, inputs from fm_goal_observation where goal_key='debt_below_usd' and as_of='2026-12-20'`))[0];
    assert.equal(near.state, "NOT_MET");
    assert.equal(near.projected_on, "2026-12-20"); // 4.22M at 12-19, −20k/day → 4.2M in 1 day
    assert.ok(!near.flags.includes("goal_projection_horizon_exceeded"));

    // ---- G: daily memory refresh (empty raw sources → 0 rows, still succeeds); second call inside the interval is skipped
    const r1 = (await q<{ r: { refreshed: boolean } }>(`select fm_memory_refresh_daily('2026-10-11'::date) r`))[0].r;
    assert.equal(r1.refreshed, true);
    const r2 = (await q<{ r: { refreshed: boolean; reason: string } }>(`select fm_memory_refresh_daily('2026-10-11'::date) r`))[0].r;
    assert.deepEqual(r2, { refreshed: false, reason: "recent_refresh" });

    // ---- H: privileges — anon/authenticated nothing; reader reads but cannot evaluate; service_role evaluates
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query(`select * from fm_memory_goal`), /permission denied/);
      await assert.rejects(db.query(`select fm_goal_evaluate('2026-10-11')`), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role cfo_acceptance_reader");
    assert.ok((await db.query(`select * from fm_memory_goal`)).rows.length >= 3);
    await assert.rejects(db.query(`select fm_goal_evaluate('2026-10-11')`), /permission denied/);
    await db.exec("reset role");
    const svc = (await q<{ e: boolean }>(`select has_function_privilege('service_role','fm_goal_evaluate(date)','execute') e`))[0].e;
    assert.equal(svc, true);

    // ---- I: migration is idempotent
    await db.exec(MIG);
    console.log("Goal Engine: revenue/debt/wealth/floor states, TCMB FX, grades, UNKNOWN on stale/missing, idempotent observations, goal versioning, daily refresh, privileges passed");
  } finally { await db.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
