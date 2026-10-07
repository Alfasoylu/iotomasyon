import { createHash } from "node:crypto";
import type { Anomaly, Severity } from "./types";

// Önemli değişiklik kapısı (2026-10-07 maliyet/görev ayrımı). Saat geldi, cron çalıştı, anomali hâlâ açık ya da yalnız
// tazelik değişti → AI çağrısı YOK. Çağrı yalnız NEW_INFORMATION (karar girdisi hash'i son ücretli değerlendirmeden farklı)
// VE MATERIAL_CHANGE (en az bir anomali yeni / önemi arttı / TL etkisi bir kova ve materialMinTry kadar arttı) ise yapılır.
// Saf fonksiyonlar: DB yok, saat yok.

export const MATERIALITY_VERSION = "m1";
const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };
const STEP = Math.log(1.25);

/** |TL| etkisinin ~%25'lik logaritmik kovası; etki yoksa null. Küçük oynamalar (kur, yuvarlama) kovayı değiştirmez. */
export function impactBucket(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value === 0) return null;
  return Math.round(Math.log(Math.abs(value)) / STEP);
}

export type Evaluation = { severity: Severity; impact: number | null };
export type MaterialReason = "new" | "severity_up" | "impact_up" | "morning";

/** Anomali kimliği: genelde soğuma anahtarı; sabah özeti gün başına (fingerprint). */
export const materialKey = (a: Anomaly) => (a.rule === "MORNING_REVIEW" ? a.fingerprint : a.cooldownKey);

export function materialChange(a: Anomaly, previous: Evaluation | undefined, minTry: number): MaterialReason | null {
  if (a.rule === "MORNING_REVIEW") return previous ? null : "morning";
  if (!previous) return "new";
  if (RANK[a.severity] > RANK[previous.severity]) return "severity_up";
  const now = a.impact?.value ?? null;
  if (now == null) return null;
  const before = previous.impact, nb = impactBucket(now), pb = impactBucket(before);
  const grew = pb == null ? nb != null : nb != null && nb > pb;
  return grew && Math.abs(now) - Math.abs(before ?? 0) >= minTry ? "impact_up" : null;
}

export type DecisionType = "CASH" | "INVENTORY" | "PRICING" | "SALES" | "DATA";
export function decisionTypeOf(a: Anomaly | undefined): DecisionType {
  if (!a) return "DATA";
  if (a.category === "cash") return "CASH";
  if (a.category === "inventory" || a.category === "procurement") return "INVENTORY";
  if (a.category === "pricing" || a.category === "margin") return "PRICING";
  if (a.category === "sales" || a.category === "marketing") return "SALES";
  return "DATA";
}

/** Karar girdisinin deterministik parmak izi: zaman damgası, asOf, tazelik ve kanıt sırası GİRMEZ. */
export function decisionInputHash(input: { mode: string; decisionType: DecisionType; anomalies: Anomaly[]; cards: string[]; versions: Record<string, string> }): string {
  const vectors = input.anomalies.map(a => [materialKey(a), a.rule, a.entityId, a.severity, impactBucket(a.impact?.value)])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  const canonical = JSON.stringify({ m: input.mode, t: input.decisionType, a: vectors, c: [...input.cards].sort(),
    v: Object.entries(input.versions).sort(([a], [b]) => a.localeCompare(b)), mv: MATERIALITY_VERSION });
  return createHash("sha256").update(canonical).digest("hex");
}
