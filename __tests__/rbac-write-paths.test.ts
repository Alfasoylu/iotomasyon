import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// RF-012 / CFO-016: yazma yolları yalnız okuma izniyle korunmaz. Statik koruma (çalıştırmadan, kaynak taraması):
//  1) Bilinen yazma yolları okuma iznine EK olarak uygun yazma iznini ister (checkAllPermissions).
//  2) Server action'lar yalnız okuma izniyle (requirePermission(…_READ)) korunmaz.
//  3) Sistem not kaynağı ("cfo-…") kullanıcıdan alınmaz; openQuestionCount oturumsuz çağrılamaz.
// Çalıştır: node --import tsx __tests__/rbac-write-paths.test.ts
const src = (f: string) => readFileSync(f, "utf8");
const WRITE_PATHS: [string, string, number][] = [
  ["app/api/marketplace/trendyol-finance/import/route.ts", "CFO_WRITE", 1],
  ["app/api/products/bulk-import/route.ts", "PRODUCTS_UPDATE", 1],
  ["lib/actions/purchase-order-actions.ts", "PROCUREMENT_APPROVE", 3],
  ["lib/actions/xml-sync-actions.ts", "XML_CONFIGURE", 2],
  ["lib/actions/xml-sync-actions.ts", "XML_SYNC", 1],
  ["lib/actions/trendyol-actions.ts", "MARKETPLACE_POLICIES_MANAGE", 1],
  ["lib/actions/hepsiburada-actions.ts", "MARKETPLACE_POLICIES_MANAGE", 1],
  ["lib/actions/alfashome-actions.ts", "MARKETPLACE_POLICIES_MANAGE", 2],
  ["lib/actions/company-settings-actions.ts", "PROFITABILITY_CONFIGURE", 1],
  ["lib/actions/capital-actions.ts", "CFO_WRITE", 1],
  ["lib/actions/catalog-profile-actions.ts", "CATALOGS_CREATE", 2],
  ["lib/actions/import-snapshot-actions.ts", "PROCUREMENT_RECOMMEND", 1],
  ["lib/actions/sales-sync-actions.ts", "MARKETPLACE_LISTINGS_WRITE", 1],
  ["lib/actions/returns-sync-actions.ts", "MARKETPLACE_RETURNS_ACTION", 1],
  ["lib/actions/message-template-actions.ts", "CAMPAIGNS_CREATE", 1],
  ["lib/actions/message-template-actions.ts", "CAMPAIGNS_UPDATE", 1],
  ["lib/actions/message-template-actions.ts", "CAMPAIGNS_DELETE", 1],
];
for (const [file, perm, n] of WRITE_PATHS) {
  const re = new RegExp(`checkAllPermissions\\(user, PERMISSIONS\\.[A-Z_]+_READ, PERMISSIONS\\.${perm}\\)`, "g");
  assert.equal(src(file).match(re)?.length ?? 0, n, `${file}: ${n} yazma yolu okuma + ${perm} istemeli`);
}
for (const f of readdirSync("lib/actions").filter(f => f.endsWith(".ts")))
  assert.ok(!/requirePermission\(PERMISSIONS\.[A-Z_]+_READ\)/.test(src(`lib/actions/${f}`)), `lib/actions/${f}: server action yalnız okuma izniyle korunmaz`);
const note = src("lib/actions/cfo-note-actions.ts");
assert.ok(/RESERVED_SOURCE = \/\^\\s\*cfo-\/i/.test(note) && (note.match(/isReservedNoteSource\(/g)?.length ?? 0) >= 3, "sistem not kaynağı kullanıcıdan alınmaz");
assert.match(src("lib/actions/cfo-question-actions.ts"), /openQuestionCount\(\): Promise<number> \{[\s\S]{0,200}requireUser\(\)[\s\S]{0,120}CFO_READ/);
console.log(`RBAC write paths: ${WRITE_PATHS.length} yazma yolu okuma + yazma izni, yalnız okuma izinli action yok, sistem not kaynağı korumalı, openQuestionCount oturumlu passed`);
