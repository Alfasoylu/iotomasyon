import { evidence } from "./evidence";
import type { GoalRow } from "@/lib/fm/goals";
import { goalItem } from "@/lib/fm/goals";
import type { Anomaly, Category, Evidence, Severity } from "./types";

// AI CFO V2 — Goal Engine (fm_memory_goal) çıktısını runner'ın anomaly/evidence sözleşmesine çevirir.
// Saf fonksiyon. Yalnız hedefin gerisinde/riskte/sağlanmamış ve kalitesi bilinen (A–D) hedefler anomaly olur;
// UNKNOWN ve bayat (as_of > 2 gün) gözlemler gönderilmez. Sayılar yalnız Goal Engine'in değerleridir; impact yok.
const SEVERITY: Record<string, Severity> = { OFF_TRACK: "warning", AT_RISK: "info", NOT_MET: "warning" };
const CATEGORY: Record<string, Category> = { revenue_month: "sales", debt_ceiling: "cash", wealth_by_date: "cash", position_floor: "cash" };

export function goalAnomalies(rows: GoalRow[], now: Date): { anomalies: Anomaly[]; evidence: Evidence[] } {
  const anomalies: Anomaly[] = [], proof: Evidence[] = [];
  const today = new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  for (const g of rows.map(goalItem)) {
    const row = rows.find(r => r.goal_key === g.key)!;
    const asOf = String(row.as_of instanceof Date ? row.as_of.toISOString() : row.as_of ?? "").slice(0, 10);
    if (!(g.state in SEVERITY) || g.grade === "U" || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) continue;
    if ((Date.parse(today) - Date.parse(asOf)) / 86400000 > 2) continue;
    // A/B ölçülmüş; C/D (kısmi kaynak, projeksiyon) TAHMİNİ olarak işaretlenir.
    const measured = g.grade === "A" || g.grade === "B";
    const fields: [string, number | null, string][] = [
      ["observed_try", g.observedTry, "TRY"], ["target_try", g.targetTry, "TRY"], ["progress_pct", g.progressPct, "pct"],
      ["gap_try", g.gapTry, "TRY"], ["current_rate_try_per_day", g.currentRatePerDayTry, "TRY/day"],
      ["required_rate_try_per_day", g.requiredRatePerDayTry, "TRY/day"], ["projected_try", g.projectedTry, "TRY"],
    ];
    const ids: string[] = [];
    for (const [name, value, unit] of fields) {
      if (value == null) continue;
      const e = evidence("fm_memory_goal", `${g.key}.${name}`, value, unit, asOf, measured);
      proof.push(e); ids.push(e.id);
    }
    // Ölçüm anı (2026-10-08, Cowork: alarm dibi ile hedef dibi farklı görünüyordu — aynı kaynak, farklı ölçüm saati).
    const at = row.evaluated_at instanceof Date ? row.evaluated_at : row.evaluated_at ? new Date(String(row.evaluated_at)) : null;
    if (at && !Number.isNaN(at.getTime())) {
      const tr = new Date(at.getTime() + 3 * 3600000).toISOString();
      const e = evidence("fm_memory_goal", `${g.key}.evaluated_at`, `${tr.slice(8, 10)}.${tr.slice(5, 7)} ${tr.slice(11, 16)}`, "time_tr", asOf, true);
      proof.push(e); ids.push(e.id);
    }
    const state = evidence("fm_memory_goal", `${g.key}.state`, `${g.state}/${g.grade}${g.flags.length ? ` (${g.flags.join(",")})` : ""}`, "state", asOf, measured);
    proof.push(state); ids.push(state.id);
    const severity: Severity = g.kind === "position_floor" && g.state === "OFF_TRACK" ? "critical" : SEVERITY[g.state];
    anomalies.push({
      id: `goal:${g.key}`, rule: `GOAL_${g.state}`, severity, category: CATEGORY[g.kind] ?? "cash", entityType: "goal", entityId: g.key,
      period: g.periodStart ?? asOf, fingerprint: `goal:${g.key}:${g.state}:${g.periodStart ?? asOf}`, cooldownKey: `goal:${g.key}:${g.state}`,
      evidenceIds: ids, actionable: true, impact: null, weight: severity === "critical" ? 3 : severity === "warning" ? 2 : 1, existingRecordIds: [],
    });
  }
  return { anomalies, evidence: proof };
}
