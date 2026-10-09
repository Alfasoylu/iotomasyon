import type { SqlQuery } from "./capital-efficiency-data";
import { attribute, pace, type BalanceRow } from "./goal-attribution";

// Hedef açığı atfı veri yükleyicisi (salt-okunur). Bakiye: fm_balance_day (günlük snapshot). Stok miktar etkisi: fm_stock_sku_day
// (SKU başına gün sonu adet; seyrek → tarihteki son satır) × cfo_stok_deger bugünkü birim net değer. Hedef: Goal Engine'in
// wealth_usd gözlemi (açık + gereken günlük hız).

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const numOrNull = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export async function loadGoalAttribution(q: SqlQuery, windows: number[] = [7, 30]) {
  // Tek tanım sürümü SETİ (CFO-001/002/017): v3 = sözleşme (nakit, alacak, LCNRV stok, yoldaki, borç, net — kimlik tutar); v3 setinin
  // tamamı en az 2 günde varsa o, yoksa v2 seti (yoldaki v2 stoğun içinde). Sürümler gün/metrik bazında karıştırılmaz; bileşeni eksik gün
  // 0 sayılmaz, atıftan çıkar (CFO-014).
  const raw = await q<{ d: unknown; v: unknown; cash: unknown; recv: unknown; inv: unknown; transit: unknown; debt: unknown; net: unknown }>(`select economic_date::text as d,
      definition_version as v,
      max(value_try) filter (where metric_key='cash_try') as cash, max(value_try) filter (where metric_key='receivables_try') as recv,
      max(value_try) filter (where metric_key='inventory_value_try') as inv, max(value_try) filter (where metric_key='in_transit_try') as transit,
      max(value_try) filter (where metric_key='debt_try') as debt, max(value_try) filter (where metric_key='net_capital_try') as net
    from fm_balance_day where definition_version in (2, 3) group by economic_date, definition_version order by economic_date`).catch(() => []);
  const complete = (ver: number) => raw.filter(r => Number(r.v) === ver).flatMap(r => {
    const x = { cash: numOrNull(r.cash), receivables: numOrNull(r.recv), inventory: numOrNull(r.inv), debt: numOrNull(r.debt), net: numOrNull(r.net),
      inTransit: ver === 3 ? numOrNull(r.transit) : 0 };
    return Object.values(x).some(v => v == null) ? [] : [{ date: String(r.d), ...x } as BalanceRow];
  });
  const v3 = complete(3);
  const definitionVersion = v3.length >= 2 ? 3 : 2;
  const rows = definitionVersion === 3 ? v3 : complete(2);
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
  return { available: true as const, asOf: last.date, definitionVersion, windows: out };
}
