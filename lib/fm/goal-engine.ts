import 'server-only';
import { prisma } from '@/lib/prisma';
import type { GoalEngineResult, GoalRow } from './goals';

const code = (error: unknown) => {
  const e = error as { code?: unknown; meta?: { code?: unknown } };
  return String(e?.meta?.code ?? e?.code ?? 'unknown').slice(0, 40);
};

// Financial Memory → Goal Engine. (1) refresh sales/balance memory (skipped inside its interval), (2) evaluate goals,
// (3) read the latest observation per goal. Never throws: failure returns a fixed diagnostic without SQL or values.
// A failed memory refresh does not stop evaluation — stale memory makes the affected goals UNKNOWN in SQL.
export async function runGoalEngine(): Promise<GoalEngineResult> {
  let refresh: 'refreshed' | 'recent' | 'failed' = 'failed';
  try {
    const [r] = await prisma.$queryRaw<{ r: { refreshed?: boolean; reason?: string } }[]>`SELECT public.fm_memory_refresh_daily() AS r`;
    refresh = r?.r?.refreshed ? 'refreshed' : r?.r?.reason === 'recent_refresh' ? 'recent' : 'failed';
  } catch {
    refresh = 'failed';
  }
  let asOf: string;
  try {
    const [e] = await prisma.$queryRaw<{ r: { as_of: string } }[]>`SELECT public.fm_goal_evaluate() AS r`;
    asOf = String(e?.r?.as_of ?? '').slice(0, 10);
  } catch (error) {
    return { ok: false, stage: 'evaluate', code: code(error) };
  }
  try {
    const rows = await prisma.$queryRaw<GoalRow[]>`SELECT goal_key, goal_version, kind, title, target_value, target_currency, deadline, as_of,
      period_start, period_end, state, observed_value_try, observed_on, target_value_try, fx_usd_try, fx_month, progress_pct, gap_try,
      current_rate_try_per_day, required_rate_try_per_day, projected_value_try, projected_on, grade, flags
      FROM public.fm_memory_goal ORDER BY goal_key`;
    return { ok: true, asOf, refresh, rows };
  } catch (error) {
    return { ok: false, stage: 'read', code: code(error) };
  }
}
