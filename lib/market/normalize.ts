// Deterministic text normalisation + a small bilingual concept dictionary (TR / EN / ZH) used by matching and by the sourcing query
// generator. Pure functions; no LLM. Unknown words simply contribute no concept (never guessed).

export function foldTr(s: string): string {
  return s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u");
}
export function normalizeTitle(s: string): string {
  return foldTr(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9一-鿿]+/g, " ").replace(/\s+/g, " ").trim();
}
export const tokens = (s: string) => normalizeTitle(s).split(" ").filter(t => t.length > 1);

export interface Concept { id: string; tr: string[]; en: string[]; zh: string; kind: "type" | "room" | "feature" | "material" | "finish" }
// Matching is by token prefix on folded text (e.g. "batarya" matches "bataryasi"); multi-word phrases match on the joined string.
export const CONCEPTS: Concept[] = [
  { id: "faucet", kind: "type", tr: ["batarya", "musluk", "armatur"], en: ["faucet", "tap", "mixer"], zh: "水龙头" },
  { id: "shower", kind: "type", tr: ["dus seti", "dus sistemi", "dus takimi", "tepe dus", "el dusu"], en: ["shower"], zh: "淋浴" },
  { id: "sink", kind: "type", tr: ["evye", "eviye"], en: ["kitchen sink", "sink"], zh: "水槽" },
  { id: "basin", kind: "type", tr: ["lavabo", "tezgah ustu lavabo", "canak lavabo"], en: ["basin", "washbasin", "vessel sink"], zh: "洗手盆" },
  { id: "camera", kind: "type", tr: ["kamera"], en: ["camera", "cctv"], zh: "摄像头" },
  { id: "kitchen", kind: "room", tr: ["mutfak"], en: ["kitchen"], zh: "厨房" },
  { id: "bathroom", kind: "room", tr: ["banyo"], en: ["bathroom", "bath"], zh: "浴室" },
  { id: "waterfall", kind: "feature", tr: ["selale"], en: ["waterfall"], zh: "瀑布" },
  { id: "pullout", kind: "feature", tr: ["spiralli", "cekilebilir", "esnek hortum"], en: ["pull out", "pull-out", "pullout", "pull down"], zh: "抽拉" },
  { id: "filtered", kind: "feature", tr: ["aritmali", "filtreli"], en: ["filter", "purifier", "drinking water"], zh: "净水" },
  { id: "thermostatic", kind: "feature", tr: ["termostatik"], en: ["thermostatic"], zh: "恒温" },
  { id: "multifunction", kind: "feature", tr: ["fonksiyonlu", "fonksiyonel", "fonksiyon"], en: ["function", "multifunction"], zh: "多功能" },
  { id: "countertop", kind: "feature", tr: ["tezgah ustu"], en: ["countertop", "deck mounted"], zh: "台上" },
  { id: "wall", kind: "feature", tr: ["duvardan", "ankastre"], en: ["wall mounted", "concealed"], zh: "入墙" },
  { id: "wifi", kind: "feature", tr: ["wifi", "kablosuz"], en: ["wifi", "wireless"], zh: "无线" },
  { id: "stainless", kind: "material", tr: ["paslanmaz", "304"], en: ["stainless", "304"], zh: "不锈钢" },
  { id: "brass", kind: "material", tr: ["pirinc"], en: ["brass"], zh: "黄铜" },
  { id: "ceramic", kind: "material", tr: ["seramik", "porselen"], en: ["ceramic", "porcelain"], zh: "陶瓷" },
  { id: "chrome", kind: "finish", tr: ["krom"], en: ["chrome"], zh: "镀铬" },
  { id: "black", kind: "finish", tr: ["siyah", "mat siyah"], en: ["black", "matte black"], zh: "黑色" },
  { id: "gold", kind: "finish", tr: ["gold", "altin"], en: ["gold"], zh: "金色" },
];

/** Concept ids found in a title (any language). */
export function concepts(title: string): Set<string> {
  const norm = ` ${normalizeTitle(title)} `, out = new Set<string>();
  const words = norm.trim().split(" ");
  for (const c of CONCEPTS) {
    for (const term of [...c.tr, ...c.en]) {
      const t = normalizeTitle(term);
      const hit = t.includes(" ") ? norm.includes(` ${t}`) : words.some(w => w === t || (t.length >= 4 && w.startsWith(t)));
      if (hit) { out.add(c.id); break; }
    }
    if (title.includes(c.zh)) out.add(c.id);
  }
  return out;
}
const MATERIALS = new Set(CONCEPTS.filter(c => c.kind === "material").map(c => c.id));
export const materialOf = (title: string, explicit?: string | null) => [...concepts(`${title} ${explicit ?? ""}`)].filter(c => MATERIALS.has(c)).sort();

/** Numbers with a length unit, converted to millimetres (e.g. "40x50 cm" → [400, 500]). */
export function dimensionsMm(s: string): number[] {
  const out: number[] = [];
  const f = foldTr(s).replace(/,/g, ".");
  for (const m of f.matchAll(/((?:\d+(?:\.\d+)?\s*[x*×]\s*)*\d+(?:\.\d+)?)\s*(mm|cm|m)\b/g)) {
    const k = m[2] === "mm" ? 1 : m[2] === "cm" ? 10 : 1000;
    for (const n of m[1].split(/\s*[x*×]\s*/)) out.push(Math.round(Number(n) * k));
  }
  return out.sort((a, b) => a - b);
}
/** Model/spec codes: tokens mixing letters and digits, ≥ 4 chars (e.g. "ds-2cd1043", "a304b"). */
export function modelCodes(s: string): string[] {
  return [...new Set(foldTr(s).split(/[^a-z0-9-]+/).filter(t => t.length >= 4 && /[a-z]/.test(t) && /\d/.test(t)).map(t => t.replace(/-/g, "")))].sort();
}
