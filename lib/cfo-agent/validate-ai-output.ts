import { z } from "zod";
import type { AiInsight, Anomaly, CfoAgentSnapshot } from "./types";

// AI CFO — model çıktısının deterministik denetimi. Model yalnız gönderilen anomaly'yi açıklar;
// severity/category değiştiremez, kanıt uyduramaz, kanıtta olmayan sayı yazamaz.
export const MAX_INSIGHTS = 3;
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

export function validateAiOutput(text: string, snapshot: CfoAgentSnapshot, anomalies: Anomaly[]): { insights: AiInsight[]; rejected: number } {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { insights: [], rejected: 1 }; }
  // The provider schema cannot carry maxItems, so extra insights are counted as rejected instead of discarding the whole response.
  const all = (json as { insights?: unknown })?.insights;
  const overflow = Array.isArray(all) && all.length > MAX_INSIGHTS ? all.length - MAX_INSIGHTS : 0;
  const parsed = aiOutputSchema.safeParse(overflow ? { ...(json as object), insights: (all as unknown[]).slice(0, MAX_INSIGHTS) } : json);
  if (!parsed.success) return { insights: [], rejected: 1 };
  const accepted: AiInsight[] = [], seen = new Set<string>();
  let rejected = overflow;
  for (const item of parsed.data.insights) {
    const a = anomalies.find(x => x.id === item.anomalyId);
    if (!a || seen.has(a.id) || item.severity !== a.severity || item.category !== a.category || item.evidenceIds.some(id => !a.evidenceIds.includes(id))) { rejected++; continue; }
    const proof = snapshot.evidence.filter(e => item.evidenceIds.includes(e.id));
    if (proof.length !== new Set(item.evidenceIds).size) { rejected++; continue; }
    // Sayılar yalnız atıf yapılan kanıtta geçebilir (gösterim yuvarlaması toleranslı); türetilmiş yüzde/çarpım/tarih kabul edilmez.
    const allowed = proof.flatMap(e => typeof e.value === "number" ? [e.value, Number(e.value.toFixed(2)), Number(e.value.toFixed(1)), Math.round(e.value)] : []);
    const id = a.entityId.split(":").at(-1)!;
    const prose = [item.title, item.observation, item.recommendation, item.riskIfIgnored].join(" ")
      .split(a.entityId).join("").split(id.length > 2 ? id : "__none__").join("");
    const tokens = prose.match(/[-−]?\d+(?:[.,]\d+)*(?:\s?%|\s?₺)?/g) ?? [];
    const fabricated = tokens.some(token => !numberVariants(token.replace(/[₺%−]/g, m => (m === "−" ? "-" : ""))).some(v => allowed.some(n => Math.abs(n - v) < 0.000001)));
    if (fabricated) { rejected++; continue; }
    const estimated = proof.some(e => !e.measured);
    accepted.push({ ...item, observation: estimated ? `TAHMİNİ — ${item.observation}` : item.observation,
      confidence: estimated && item.confidence === "high" ? "medium" : item.confidence });
    seen.add(a.id);
  }
  return { insights: accepted, rejected };
}
