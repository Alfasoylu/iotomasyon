import { CONCEPTS, concepts, dimensionsMm } from "./normalize";

// Sourcing query generator (template-v1). Produces English and Chinese SEARCH QUERIES for a person to use on Alibaba / 1688 /
// Made-in-China. Output is kind GENERATED_QUERY: it is NOT an observation and makes no claim that any supplier exists.
// An LLM generator may be added behind the same interface later; its output would be stored with generator = "LLM" (still GENERATED_QUERY).
export const QUERY_GENERATOR = "TEMPLATE";
export const QUERY_GENERATOR_VERSION = "template-v1";

export interface GeneratedQuery { kind: "GENERATED_QUERY"; language: "en" | "zh"; query: string; generator: string; generatorVersion: string; inputTerms: string[] }

const ORDER: Record<string, number> = { material: 0, finish: 1, feature: 2, room: 3, type: 4 };
export function generateSourcingQueries(title: string, extra: { material?: string | null; functions?: number | null } = {}): GeneratedQuery[] {
  const ids = concepts(`${title} ${extra.material ?? ""}`);
  const picked = CONCEPTS.filter(c => ids.has(c.id)).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  if (!picked.some(c => c.kind === "type")) return []; // no recognisable product type → no query (never guess)
  const fn = extra.functions ?? (title.match(/(\d)\s*(fonksiyon|function|işlev|islev)/i)?.[1] ? Number(title.match(/(\d)\s*(fonksiyon|function|işlev|islev)/i)![1]) : null);
  const en = picked.map(c => c.id === "multifunction" && fn ? `${fn} function` : c.id === "stainless" ? "304 stainless steel" : c.en[0]);
  const zh = picked.map(c => c.id === "multifunction" && fn ? `${fn}功能` : c.zh);
  const dims = dimensionsMm(title);
  if (dims.length) en.push(`${dims.map(d => d / 10).join("x")} cm`);
  const terms = picked.map(c => c.id);
  return [
    { kind: "GENERATED_QUERY", language: "en", query: [...new Set(en)].join(" "), generator: QUERY_GENERATOR, generatorVersion: QUERY_GENERATOR_VERSION, inputTerms: terms },
    { kind: "GENERATED_QUERY", language: "zh", query: [...new Set(zh)].join(""), generator: QUERY_GENERATOR, generatorVersion: QUERY_GENERATOR_VERSION, inputTerms: terms },
  ];
}
