// lib/cfo-agent/handbook-core.md (el kitabı v33 Blok A, birebir) → lib/cfo-agent/handbook-core.ts, ve
// lib/cfo-agent/rule-cards.md (el kitabı §7'den birebir seçilmiş maddeler) → lib/cfo-agent/rule-cards.ts.
// El kitabı sahibi yalnız .md'leri düzenler, sonra: npm run gen:handbook. Testler (ai-cfo-provider, ai-cfo-rule-cards) eşitliği denetler.
import { readFileSync, writeFileSync } from "node:fs";
const md = readFileSync("lib/cfo-agent/handbook-core.md", "utf8");
const version = (md.match(/El Kitabı (v\d+)/) ?? [])[1] ?? "v?";
const ts = `// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: lib/cfo-agent/handbook-core.md (npm run gen:handbook).
// AI CFO girdi Blok A: el kitabının karar çekirdeği, birebir metin. YALNIZ MANUAL_DEEP_REVIEW modunda gider;
// planlı (SCHEDULED_CFO) çağrı bunun yerine ilgili rule card'ı alır (rule-cards.ts).

export const HANDBOOK_CORE_VERSION = ${JSON.stringify(`${version}-blok-a`)};

export const HANDBOOK_CORE = ${JSON.stringify(md)};
`;
writeFileSync("lib/cfo-agent/handbook-core.ts", ts);
console.log(`handbook-core.ts: ${version}, ${md.length} karakter`);

const cardsMd = readFileSync("lib/cfo-agent/rule-cards.md", "utf8");
// "## CARD <ID> — §7: n, n, …" bölümleri kart; "## CORE …" bölümü planlı sistem talimatına eklenen ortak çekirdek.
const cards = {}, sections = {};
let core = "";
for (const part of cardsMd.split(/^## /m).slice(1)) {
  const [head, ...body] = part.split("\n");
  const text = body.join("\n").trim();
  if (head.startsWith("CORE")) { core = text; continue; }
  const m = head.match(/^CARD (\w+) — §7: ([\d, ]+)$/);
  if (!m) throw new Error(`rule-cards.md: tanınmayan başlık: ${head}`);
  cards[m[1]] = text;
  sections[m[1]] = m[2].split(",").map(n => Number(n.trim()));
}
const cardsTs = `// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: lib/cfo-agent/rule-cards.md (npm run gen:handbook).
// SCHEDULED_CFO rule card'ları: el kitabı v33 §7'den birebir seçilmiş maddeler (seçim: el kitabı sahibi, Rule Cards v1).

export const RULE_CARDS_VERSION = ${JSON.stringify(`${version}-s7-cards-v1`)};

export const RULE_CARDS = ${JSON.stringify(cards, null, 2)} as const;

export type RuleCardId = keyof typeof RULE_CARDS;

/** Her kartın el kitabı §7 madde numaraları (madde sayısı = kart madde sayısı). */
export const RULE_CARD_SECTIONS: Record<RuleCardId, number[]> = ${JSON.stringify(sections)};

/** Ortak çekirdek: her yargıya etki eden 4 madde — karta değil planlı sistem talimatına (bir kez). */
export const CORE_RULES = ${JSON.stringify(core)};
`;
writeFileSync("lib/cfo-agent/rule-cards.ts", cardsTs);
console.log(`rule-cards.ts: ${Object.keys(cards).join(", ")} + CORE`);
