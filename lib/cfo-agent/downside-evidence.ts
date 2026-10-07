import { loadDownside, type DownsideData } from "../cfo/downside-data";
import { TIER_LABEL } from "../cfo/downside";
import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// AI CFO Blok B4m — aşağı yön senaryoları (lib/cfo/downside.ts): KMH faizi dahil baz dip, makul stres, emniyet payları ve en
// zararlı tekil şok. Model şok hesaplamaz; sayılar deterministik. Şoklar parametrik ölçüdür, olasılık değildir (TAHMİNİ).

export function downsideEvidence(d: DownsideData, at: string): Evidence[] {
  const src = "cfo_nakit_projeksiyon";
  const base = d.scenarios[0];
  if (d.parity.mismatchDays > 0)
    return [evidence(src, "asagi_yon.uyusmazlik_gun (akış projeksiyonla tutmuyor — senaryolar güvenilmez)", d.parity.mismatchDays, "days", at, true)];
  const out: Evidence[] = [
    evidence(src, `asagi_yon.baz_dip_try (KMH faizi dahil; projeksiyon faizsiz ${d.projectionMin.position}) ${base.minDate} — ${TIER_LABEL[base.tier]}`, base.minPosition, "TRY", at, false),
    evidence(src, "asagi_yon.kmh_faizi_120g_try (projeksiyonda yok)", base.carryCostTry, "TRY", at, false),
    evidence(src, `asagi_yon.stres_dip_try (${d.stress.label}) — ${TIER_LABEL[d.stress.tier]}`, d.stress.minPosition, "TRY", at, false),
    evidence(src, "asagi_yon.emniyet_payi (tüm kaynaklarla fonlanabilir en büyük tekil şok)",
      `ciro −%${d.tolerance.maxRevenueDropPct ?? 0} · gecikme ${d.tolerance.maxPayoutDelayDays ?? 0} gün · kur +%${d.tolerance.maxFxUpPct ?? 0}`, "text", at, false),
  ];
  const worst = d.sensitivity[0];
  if (worst) out.push(evidence(src, `asagi_yon.en_zararli_sok (${worst.label})`, worst.deltaVsBaseTry, "TRY", at, false));
  return out;
}

export async function loadDownsideEvidence(db: ReadSource, at: string): Promise<Evidence[]> {
  const [v] = await db.query<{ t: string | null }>(`select to_regprocedure('public.cfo_nakit_projeksiyon(integer)')::text as t`);
  if (!v?.t) return [];
  const d = await loadDownside(<T,>(sql: string) => db.query(sql) as Promise<T[]>);
  return d ? downsideEvidence(d, at) : [];
}
