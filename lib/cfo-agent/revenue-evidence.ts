import { loadRevenueLevers } from "../cfo/revenue-levers-data";
import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// AI CFO Blok B4l — ciro hedefine giden yol (lib/cfo/revenue-levers.ts): ciro açığı ve kaldıraçlar (ciro, katkı, ek/batık sermaye,
// açık payı). Kaldıraç tahminleri TAHMİNİ; bugünkü ciro ve hedef ölçüm.

export function revenueEvidence(rv: Awaited<ReturnType<typeof loadRevenueLevers>>, at: string): Evidence[] {
  const src = "cfo_satis_birim_duz";
  return [
    evidence(src, "ciro_yolu.bugun_aylik_try (son 90 gün / 3)", rv.currentMonthlyTry, "TRY/month", at, true),
    evidence("cfo_settings", "ciro_yolu.hedef_aylik_try (hedef USD × stratejik kur TCMB)", rv.targetUnknown ? null : rv.targetMonthlyTry, "TRY/month", at, !rv.targetUnknown),
    evidence(src, "ciro_yolu.acik_aylik_try", rv.targetUnknown ? null : rv.gapMonthlyTry, "TRY/month", at, !rv.targetUnknown),
    ...rv.levers.slice(0, 3).map((l, i) => evidence(src, `ciro_yolu.kaldirac.${i + 1} (${l.label}; engel: ${l.blocker})`,
      `ciro ${l.revenueMonthlyTry} TL/ay · katkı ${l.grossMonthlyTry} TL/ay · ek sermaye ${l.capitalNeededTry} · batık ${l.sunkCapitalTry} · güven ${l.confidence} · açık payı %${Math.round(l.gapShare * 100)}`, "text", at, false)),
  ];
}

export async function loadRevenueEvidence(db: ReadSource, at: string): Promise<Evidence[]> {
  const [v] = await db.query<{ t: string | null }>(`select to_regclass('public.cfo_satis_birim_duz')::text as t`);
  if (!v?.t) return [];
  return revenueEvidence(await loadRevenueLevers(<T,>(sql: string) => db.query(sql) as Promise<T[]>), at);
}
