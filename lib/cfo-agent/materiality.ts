import { createHash } from "node:crypto";
import type { Anomaly, Severity } from "./types";

// Önemli değişiklik BAYRAĞI (2026-10-08: sitede LLM yok, kapı değil bayrak). Motor her koşuda tüm anomalilerin karar girdisi
// hash'ini yazar; dünden beri aynıysa Cowork CFO aynı bulguları yeniden okumaz. Bulgu başına "dünden beri" durumu:
// yeni / değişti (önemi arttı ya da TL etkisi bir ~%25 kova VE materialMinTry kadar arttı) / aynı. Saf fonksiyonlar: DB yok, saat yok.

export const MATERIALITY_VERSION = "m2";
const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };
const STEP = Math.log(1.25);

/** |TL| etkisinin ~%25'lik logaritmik kovası; etki yoksa null. Küçük oynamalar (kur, yuvarlama) kovayı değiştirmez. */
export function impactBucket(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value === 0) return null;
  return Math.round(Math.log(Math.abs(value)) / STEP);
}

export type Evaluation = { severity: Severity; impact: number | null };
export type MaterialReason = "new" | "severity_up" | "impact_up";
export type SinceYesterday = "yeni" | "degisti" | "ayni";

export const materialKey = (a: Pick<Anomaly, "cooldownKey">) => a.cooldownKey;

export function materialChange(a: Pick<Anomaly, "severity" | "impact">, previous: Evaluation | undefined, minTry: number): MaterialReason | null {
  if (!previous) return "new";
  if (RANK[a.severity] > RANK[previous.severity]) return "severity_up";
  const now = a.impact?.value ?? null;
  if (now == null) return null;
  const before = previous.impact, nb = impactBucket(now), pb = impactBucket(before);
  const grew = pb == null ? nb != null : nb != null && nb > pb;
  return grew && Math.abs(now) - Math.abs(before ?? 0) >= minTry ? "impact_up" : null;
}

export function sinceYesterday(a: Pick<Anomaly, "severity" | "impact">, previous: Evaluation | undefined, minTry: number): SinceYesterday {
  const r = materialChange(a, previous, minTry);
  return r === "new" ? "yeni" : r ? "degisti" : "ayni";
}

/** Karar girdisinin deterministik parmak izi (TÜM anomaliler): zaman damgası, asOf, tazelik ve kanıt sırası GİRMEZ. */
export function decisionInputHash(input: { anomalies: Pick<Anomaly, "cooldownKey" | "rule" | "entityId" | "severity" | "impact">[]; versions: Record<string, string> }): string {
  const vectors = input.anomalies.map(a => [materialKey(a), a.rule, a.entityId, a.severity, impactBucket(a.impact?.value)])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0])) || String(x[1]).localeCompare(String(y[1])));
  const canonical = JSON.stringify({ a: vectors, v: Object.entries(input.versions).sort(([a], [b]) => a.localeCompare(b)), mv: MATERIALITY_VERSION });
  return createHash("sha256").update(canonical).digest("hex");
}
