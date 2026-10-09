import type { SqlQuery } from "./capital-efficiency-data";
import { attribute, pace, type BalanceRow } from "./goal-attribution";

// Hedef açığı atfı veri yükleyicisi (salt-okunur). Bakiye: fm_balance_day (günlük snapshot). Stok miktar etkisi: fm_stock_sku_day
// (SKU başına gün sonu adet; seyrek → tarihteki son satır) × cfo_stok_deger bugünkü birim net değer. Hedef: Goal Engine'in
// wealth_usd gözlemi (açık + gereken günlük hız).

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const numOrNull = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export async function loadGoalAttribution(q: SqlQuery, windows: number[] = [7, 30]) {
  // Her metrik YALNIZ en yeni tanım sürümünden (CFO-001/002: net_capital_try / debt_try v3 = sözleşme; v2 ile karıştırılmaz) ve yalnız
  // beş bileşenin de bilindiği günler: eksik bileşen 0 sayılmaz, o gün atıftan çıkar (CFO-014).
  const raw = await q<{ d: unknown; cash: unknown; recv: unknown; inv: unknown; debt: unknown; net: unknown }>(`with v as (
        select metric_key, max(definition_version) as mv from fm_balance_day group by metric_key),
      b as (select b.* from fm_balance_day b join v on v.metric_key = b.metric_key and v.mv = b.definition_version)
    select economic_date::text as d,
      max(value_try) filter (where metric_key='cash_try') as cash, max(value_try) filter (where metric_key='receivables_try') as recv,
      max(value_try) filter (where metric_key='inventory_value_try') as inv, max(value_try) filter (where metric_key='debt_try') as debt,
      max(value_try) filter (where metric_key='net_capital_try') as net
    from b group by economic_date order by economic_date`).catch(() => []);
  const rows = raw.flatMap(r => {
    const x = { cash: numOrNull(r.cash), receivables: numOrNull(r.recv), inventory: numOrNull(r.inv), debt: numOrNull(r.debt), net: numOrNull(r.net) };
    return Object.values(x).some(v => v == null) ? [] : [{ date: String(r.d), ...x } as BalanceRow];
  });
  const [goal] = await q<{ gap: unknown; req: unknown }>(`select gap_try as gap, required_rate_try_per_day as req from fm_goal_observation
    where goal_key='wealth_usd' order by evaluated_at desc limit 1`).catch(() => []);
  if (rows.length < 2) return { available: false as const, rows: rows.length };
  const last = rows[rows.length - 1];
  const out = [];
  for (const w of windows) {
    const target = new Date(Date.parse(last.date) - w * 86400000).toISOString().slice(0, 10);
    const first = [...rows].reverse().find(r => r.date <= target) ?? rows[0];
    if (first.date === last.date) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(first.date) || !/^\d{4}-\d{2}-\d{2}$/.test(last.date)) continue; // SQL'e yalnız ISO tarih girer
    const [qe] = await q<{ v: unknown }>(`with p as (select distinct product_id from fm_stock_sku_day),
      x as (select p.product_id,
        (select units_eod from fm_stock_sku_day s where s.product_id=p.product_id and s.economic_date <= '${first.date}'::date order by economic_date desc limit 1) q0,
        (select units_eod from fm_stock_sku_day s where s.product_id=p.product_id and s.economic_date <= '${last.date}'::date order by economic_date desc limit 1) q1 from p)
      select coalesce(sum((coalesce(q1,0)-coalesce(q0,0)) * coalesce(d.birim_net_deger,0)),0) as v from x join cfo_stok_deger d on d.id = x.product_id and d.gercek_stok`).catch(() => []);
    const a = attribute(first, last, num(qe?.v));
    out.push({ window: w, attribution: a, pace: pace(a, { gapTry: goal ? num(goal.gap) : null, requiredPerDay: goal?.req == null ? null : num(goal.req) }) });
  }
  return { available: true as const, asOf: last.date, windows: out };
}
