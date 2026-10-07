import { z } from "zod";
import { HANDBOOK_CORE } from "./handbook-core";
import type { AiInsight, Anomaly, CfoAgentSnapshot } from "./types";

// AI CFO — model çıktısının deterministik denetimi. Model yalnız gönderilen anomaly'yi açıklar;
// severity/category değiştiremez, kanıt uyduramaz, kanıtta olmayan sayı yazamaz.
export const MAX_INSIGHTS = 3;
/** SCHEDULED_CFO: en çok 2 kısa içgörü; alan uzunlukları (şema maxLength taşıyamaz, burada denetlenir). */
export const MAX_SCHEDULED_INSIGHTS = 2;
export const scheduledOutputSchema = z.object({ insights: z.array(z.object({
  anomalyId: z.string().max(100), decision: z.string().min(1).max(140), why: z.string().min(1).max(280), risk: z.string().min(1).max(200),
  next_action: z.string().min(1).max(200), confidence: z.enum(["low", "medium", "high"]), evidence_ids: z.array(z.string()).min(1).max(12),
}).strict()).max(MAX_SCHEDULED_INSIGHTS) }).strict();
export const aiOutputSchema = z.object({ insights: z.array(z.object({
  anomalyId: z.string().max(100), severity: z.enum(["info", "warning", "critical"]),
  category: z.enum(["margin", "inventory", "sales", "cash", "pricing", "procurement", "marketing", "data_quality"]),
  title: z.string().min(1).max(160), observation: z.string().min(1).max(600), recommendation: z.string().min(1).max(600),
  riskIfIgnored: z.string().min(1).max(400), confidence: z.enum(["low", "medium", "high"]), evidenceIds: z.array(z.string()).min(1).max(12),
}).strict()).max(MAX_INSIGHTS) }).strict();

function numberVariants(token: string): number[] {
  const t = token.replace(/\s/g, "");
  // 1.234.567,89 (TR) · 1,234,567.89 (EN) · 1234567.89
  return [...new Set([Number(t), Number(t.replace(/\./g, "").replace(",", ".")), Number(t.replace(/,/g, ""))])].filter(Number.isFinite);
}

/** Reason codes only — never the model text — so a rejection can be diagnosed without storing output. */
export type RejectReason = "invalid_json" | "schema" | "over_limit" | "unknown_anomaly" | "duplicate" | "severity_changed" | "category_changed" | "evidence_not_allowed" | "evidence_missing" | "fabricated_number";

const NUMBER_TOKEN = /[-−]?\d+(?:[.,]\d+)*(?:\s?%|\s?₺)?/g;
const variantsOf = (token: string) => numberVariants(token.replace(/[₺%−]/g, m => (m === "−" ? "-" : "")));
/** El kitabı çekirdeğindeki sabitler (ör. 13,36 · −3.000.000 · %2,83) kural atfı olarak yazılabilir. */
// Yalnız ayırt edici sabitler (ondalıklı ya da |n| ≥ 100): küçük tam sayılar (gün bantları, basamak no) serbest kalırsa
// "%15 artır" gibi türetilmiş sayılar el kitabındaki "15–25 gün" yüzünden geçerdi.
const HANDBOOK_NUMBERS = (HANDBOOK_CORE.replace(/§[0-9A-Za-z.\-]+/g, "").match(NUMBER_TOKEN) ?? []).flatMap(variantsOf)
  .filter(n => !Number.isInteger(n) || Math.abs(n) >= 100);

const numbersOf = (text: string) => (text.replace(/§[0-9A-Za-z.\-]+/g, "").match(NUMBER_TOKEN) ?? []).flatMap(variantsOf)
  .filter(n => !Number.isInteger(n) || Math.abs(n) >= 100);
export type ValidationResult = { insights: AiInsight[]; rejected: number; reasons: Partial<Record<RejectReason, number>> };
/** SCHEDULED_CFO: kartlar el kitabından birebir; izinli sabitler YALNIZ gönderilen kartlardan gelir (el kitabının tamamından değil). */
export type ScheduledOptions = { scheduled: true; cardText: string };

/** contextIds: Blok B/C kanıtları (girdi şartnamesi) — her içgörü kendi anomalisinin kanıtına EK olarak bunlara da atıf yapabilir. */
export function validateAiOutput(text: string, snapshot: CfoAgentSnapshot, anomalies: Anomaly[], contextIds: ReadonlySet<string> = new Set(), options?: ScheduledOptions): ValidationResult {
  const reasons: Partial<Record<RejectReason, number>> = {};
  const reject = (r: RejectReason, n = 1) => { reasons[r] = (reasons[r] ?? 0) + n; };
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { insights: [], rejected: 1, reasons: { invalid_json: 1 } }; }
  // The provider schema cannot carry maxItems, so extra insights are counted as rejected instead of discarding the whole response.
  const limit = options ? MAX_SCHEDULED_INSIGHTS : MAX_INSIGHTS;
  const all = (json as { insights?: unknown })?.insights;
  const overflow = Array.isArray(all) && all.length > limit ? all.length - limit : 0;
  const trimmed = overflow ? { ...(json as object), insights: (all as unknown[]).slice(0, limit) } : json;
  let items: z.infer<typeof aiOutputSchema>["insights"];
  if (options) {
    const parsed = scheduledOutputSchema.safeParse(trimmed);
    if (!parsed.success) return { insights: [], rejected: 1, reasons: { schema: 1 } };
    // severity/category modelden alınmaz: anomaliden eklenir (bilinmeyen anomali aşağıda reddedilir).
    items = parsed.data.insights.map(i => { const a = anomalies.find(x => x.id === i.anomalyId);
      return { anomalyId: i.anomalyId, severity: a?.severity ?? "info", category: a?.category ?? "data_quality", title: i.decision, observation: i.why,
        recommendation: i.next_action, riskIfIgnored: i.risk, confidence: i.confidence, evidenceIds: i.evidence_ids }; });
  } else {
    const parsed = aiOutputSchema.safeParse(trimmed);
    if (!parsed.success) return { insights: [], rejected: 1, reasons: { schema: 1 } };
    items = parsed.data.insights;
  }
  const constants = options ? numbersOf(options.cardText) : HANDBOOK_NUMBERS;
  const accepted: AiInsight[] = [], seen = new Set<string>();
  let rejected = overflow;
  if (overflow) reject("over_limit", overflow);
  for (const item of items) {
    const a = anomalies.find(x => x.id === item.anomalyId);
    const mismatch: RejectReason | null = !a ? "unknown_anomaly" : seen.has(a.id) ? "duplicate" : item.severity !== a.severity ? "severity_changed"
      : item.category !== a.category ? "category_changed" : item.evidenceIds.some(id => !a.evidenceIds.includes(id) && !contextIds.has(id)) ? "evidence_not_allowed" : null;
    if (!a || mismatch) { rejected++; reject(mismatch ?? "unknown_anomaly"); continue; }
    const proof = snapshot.evidence.filter(e => item.evidenceIds.includes(e.id));
    if (proof.length !== new Set(item.evidenceIds).size) { rejected++; reject("evidence_missing"); continue; }
    // Sayılar yalnız atıf yapılan kanıtta geçebilir (gösterim yuvarlaması toleranslı); türetilmiş yüzde/çarpım/tarih kabul edilmez.
    // Metin kanıtlarındaki (defter, soru, dip tarihi) sayılar da atıfla yazılabilir; el kitabı sabitleri her zaman.
    // Anomalinin deterministik TL etkisi de yazılabilir (motor hesapladı; model yalnız aktarır).
    const impact = a.impact?.value;
    const asIs = (n: number) => [n, Number(n.toFixed(2)), Number(n.toFixed(1)), Math.round(n)];
    const allowed = [...proof.flatMap(e => typeof e.value === "number" ? asIs(e.value)
      : typeof e.value === "string" ? (e.value.match(NUMBER_TOKEN) ?? []).flatMap(variantsOf) : []), ...(impact != null ? asIs(impact) : []), ...constants];
    const id = a.entityId.split(":").at(-1)!;
    const prose = [item.title, item.observation, item.recommendation, item.riskIfIgnored].join(" ")
      .split(a.entityId).join("").split(id.length > 2 ? id : "__none__").join("")
      .replace(/§[0-9A-Za-z.\-]+/g, ""); // kural numarası (§4B-2c) sayı değildir
    const tokens = prose.match(NUMBER_TOKEN) ?? [];
    const fabricated = tokens.some(token => !variantsOf(token).some(v => allowed.some(n => Math.abs(n - v) < 0.000001)));
    if (fabricated) { rejected++; reject("fabricated_number"); continue; }
    const estimated = proof.some(e => !e.measured);
    accepted.push({ ...item, observation: estimated ? `TAHMİNİ — ${item.observation}` : item.observation,
      confidence: estimated && item.confidence === "high" ? "medium" : item.confidence });
    seen.add(a.id);
  }
  return { insights: accepted, rejected, reasons };
}
