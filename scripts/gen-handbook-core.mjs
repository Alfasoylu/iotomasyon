// lib/cfo-agent/handbook-core.md (el kitabı v33 Blok A, birebir) → lib/cfo-agent/handbook-core.ts, ve
// lib/cfo-agent/rule-cards.md (el kitabından birebir alıntılar) → lib/cfo-agent/rule-cards.ts.
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
export function parseRuleCards(text) {
  const cards = {};
  for (const part of text.split(/^## CARD /m).slice(1)) {
    const [head, ...body] = part.split("\n");
    const id = head.split(" ")[0].trim();
    cards[id] = body.join("\n").trim();
  }
  return cards;
}
const cards = parseRuleCards(cardsMd);
const cardsTs = `// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: lib/cfo-agent/rule-cards.md (npm run gen:handbook).
// SCHEDULED_CFO rule card'ları: el kitabından birebir alıntılar; bir anomali yalnız kendi kartını alır.

export const RULE_CARDS_VERSION = ${JSON.stringify(`${version}-cards-${Object.keys(cards).length}`)};

export const RULE_CARDS = ${JSON.stringify(cards, null, 2)} as const;

export type RuleCardId = keyof typeof RULE_CARDS;
`;
writeFileSync("lib/cfo-agent/rule-cards.ts", cardsTs);
console.log(`rule-cards.ts: ${Object.keys(cards).join(", ")}`);
