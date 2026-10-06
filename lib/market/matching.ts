import { concepts, dimensionsMm, materialOf, modelCodes } from "./normalize";

// Deterministic product matching (match-v1). Title concepts (cross-language), category, material, dimensions, model/spec codes and an
// optional CLIP image similarity. Missing components are reported, not invented. Image similarity ALONE can never yield EXACT_LIKELY;
// an LLM may only add a separate LLM_ASSISTED row (grade D), never overwrite this deterministic result.
export const MATCH_VERSION = "match-v1";
export type MatchClass = "EXACT_LIKELY" | "SIMILAR" | "CATEGORY_ANALOG" | "WEAK" | "NO_MATCH";

export interface MatchSide { title: string; category?: string | null; material?: string | null; dimensionsText?: string | null; specText?: string | null }
export interface MatchResult { version: typeof MATCH_VERSION; classification: MatchClass; score: number; coverage: number; evidence: string[];
  components: Record<string, number | null> }

const W = { title: 30, category: 15, material: 10, dimensions: 15, model: 15, image: 15 } as const;
const TYPE_IDS = new Set(["faucet", "shower", "sink", "basin", "camera"]);

export function matchProducts(a: MatchSide, b: MatchSide, imageSimilarity: number | null = null): MatchResult {
  const ev: string[] = [];
  const ca = concepts(`${a.title} ${a.category ?? ""}`), cb = concepts(`${b.title} ${b.category ?? ""}`);
  const comp: Record<string, number | null> = { title: null, category: null, material: null, dimensions: null, model: null, image: null };
  if (ca.size && cb.size) {
    const inter = [...ca].filter(x => cb.has(x)).length, union = new Set([...ca, ...cb]).size;
    comp.title = inter / union; ev.push(`concepts ${inter}/${union} shared (${[...ca].filter(x => cb.has(x)).join(", ") || "none"})`);
  } else ev.push("title concepts unknown on one side");
  const ta = [...ca].filter(x => TYPE_IDS.has(x)), tb = [...cb].filter(x => TYPE_IDS.has(x));
  let categoryMismatch = false;
  if (ta.length && tb.length) {
    const same = ta.some(x => tb.includes(x));
    comp.category = same ? 1 : 0; categoryMismatch = !same; ev.push(same ? `same product type (${ta.filter(x => tb.includes(x)).join(", ")})` : `different product type (${ta} vs ${tb})`);
  }
  const ma = materialOf(a.title, a.material), mb = materialOf(b.title, b.material);
  if (ma.length && mb.length) { comp.material = ma.some(x => mb.includes(x)) ? 1 : 0; ev.push(comp.material ? `material consistent (${ma})` : `material differs (${ma} vs ${mb})`); }
  const da = dimensionsMm(`${a.title} ${a.dimensionsText ?? ""}`), db = dimensionsMm(`${b.title} ${b.dimensionsText ?? ""}`);
  if (da.length && db.length) {
    const pairs = Math.min(da.length, db.length), ok = da.slice(-pairs).every((x, i) => Math.abs(x - db.slice(-pairs)[i]) <= 0.1 * Math.max(x, db.slice(-pairs)[i]));
    comp.dimensions = ok ? 1 : 0; ev.push(ok ? "dimensions consistent (±10%)" : "dimensions inconsistent");
  }
  const sa = modelCodes(`${a.title} ${a.specText ?? ""}`), sb = modelCodes(`${b.title} ${b.specText ?? ""}`);
  if (sa.length && sb.length) { comp.model = sa.some(x => sb.includes(x)) ? 1 : 0; ev.push(comp.model ? `model/spec code match (${sa.filter(x => sb.includes(x))})` : "model codes differ"); }
  if (imageSimilarity != null && Number.isFinite(imageSimilarity)) {
    comp.image = imageSimilarity >= 0.9 ? 1 : imageSimilarity >= 0.8 ? 0.6 : imageSimilarity >= 0.7 ? 0.3 : 0;
    ev.push(`image similarity ${imageSimilarity.toFixed(3)} (CLIP; evidence only)`);
  }
  let earned = 0, avail = 0;
  for (const [k, w] of Object.entries(W)) { const v = comp[k]; if (v != null) { earned += w * v; avail += w; } }
  const coverage = avail / 100, score = avail ? Math.round(earned / avail * 1000) / 10 : 0;
  // Strong non-image signals required for EXACT_LIKELY
  const strongNonImage = [comp.model === 1, comp.dimensions === 1, comp.material === 1 && (comp.title ?? 0) >= 0.6].filter(Boolean).length;
  let cls: MatchClass;
  if (avail === 0) cls = "NO_MATCH";
  else if (categoryMismatch) cls = score >= 25 ? "WEAK" : "NO_MATCH";
  else if (score >= 85 && strongNonImage >= 2 && coverage >= 0.55) cls = "EXACT_LIKELY";
  else if (score >= 65 && (comp.title ?? 0) >= 0.4) cls = "SIMILAR";
  else if (comp.category === 1) cls = "CATEGORY_ANALOG";
  else if (score >= 25) cls = "WEAK";
  else cls = "NO_MATCH";
  if (comp.image != null && strongNonImage < 2 && score >= 85) ev.push("EXACT_LIKELY withheld: image similarity is not sufficient on its own");
  return { version: MATCH_VERSION, classification: cls, score, coverage, evidence: ev, components: comp };
}
/** Only these classes may be promoted into an opportunity's evidence as a product match. */
export const PROMOTABLE_MATCH: ReadonlySet<MatchClass> = new Set(["EXACT_LIKELY", "SIMILAR"]);
