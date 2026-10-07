// lib/cfo-agent/handbook-core.md (el kitabı v33 Blok A, birebir) → lib/cfo-agent/handbook-core.ts.
// El kitabı sahibi yalnız .md'yi düzenler, sonra: npm run gen:handbook. Test (ai-cfo-provider) ikisinin eşit olduğunu denetler.
import { readFileSync, writeFileSync } from "node:fs";
const md = readFileSync("lib/cfo-agent/handbook-core.md", "utf8");
const version = (md.match(/El Kitabı (v\d+)/) ?? [])[1] ?? "v?";
const ts = `// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: lib/cfo-agent/handbook-core.md (npm run gen:handbook).
// AI CFO girdi Blok A: el kitabının karar çekirdeği, birebir metin. Sistem talimatıyla tek önbellek bloğunda gider;
// her koşuda değişen hiçbir şey (tarih, bakiye, anomali) burada olmaz — onlar Blok B/C'dedir (context.ts).

export const HANDBOOK_CORE_VERSION = ${JSON.stringify(`${version}-blok-a`)};

export const HANDBOOK_CORE = ${JSON.stringify(md)};
`;
writeFileSync("lib/cfo-agent/handbook-core.ts", ts);
console.log(`handbook-core.ts: ${version}, ${md.length} karakter`);
