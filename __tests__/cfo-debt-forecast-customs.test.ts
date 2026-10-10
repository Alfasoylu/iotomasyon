/**
 * AI CFO borç tahmini (lib/cfo-agent/debt-forecast.ts) — gümrük/vergi çıkışı (2026-10-10). Borç = cfo_metrik_borc() (D-P03: kredi +
 * kart + KMH; ödenmemiş gümrük yalnız bilgi satırı) → VERGI_GUMRUK çıkışı borcu kapatmaz, sıradan nakit çıkışıdır ve "eksik veri"
 * ÜRETMEZ (eskiden eski cfo_servet_kalem etiketiyle ispat isteniyordu; dilimli gümrükte hiç eşleşmeyip tahmini kalıcı düşürüyordu).
 * Saf, DB yok. Çalıştır: node --import tsx __tests__/cfo-debt-forecast-customs.test.ts
 */
import assert from "node:assert/strict";
import { readForecastInputs } from "../lib/cfo-agent/debt-forecast";
import type { ReadSource } from "../lib/cfo-agent/sources";
import type { CfoAgentSnapshot } from "../lib/cfo-agent/types";

const at = "2026-10-10T09:00:00.000Z";
const events = [
  { id: "g1", eventDate: "2026-10-14T00:00:00Z", outflowTry: "1965467.83", kind: "VERGI_GUMRUK", relatedImport: "07.26sea" },
  { id: "g2", eventDate: "2026-10-21T00:00:00Z", outflowTry: "1321604.48", kind: "VERGI_GUMRUK", relatedImport: "07.26sea" },
  { id: "k1", eventDate: "2026-10-16T00:00:00Z", outflowTry: "137313.81", kind: "KREDI_TAKSITI", relatedImport: null },
  { id: "x", eventDate: "2026-12-01T00:00:00Z", outflowTry: "6500", kind: "DIGER", relatedImport: null },
];
const seen: string[] = [];
const db: ReadSource = { query: async (sql: string) => {
  seen.push(sql);
  if (/from cfo_import_project/.test(sql)) return [{ id: "p", code: "07.26sea", totalCostUsd: "100", paidUsd: "100" }] as never;
  if (/from cfo_cash_event/.test(sql)) return events as never;
  if (/from cfo_fixed_expense/.test(sql)) return [{ total: "276900" }] as never;
  return [] as never;
} };
async function main() {
const r = await readForecastInputs(db, { generatedAt: at } as unknown as CfoAgentSnapshot);
assert.ok(!r.missing.some(m => /Gümrük\/vergi/.test(m)), `gümrük çıkışı eksik veri üretmez: ${r.missing.join(" | ")}`);
assert.deepEqual(r.extraOutflows.map(e => [e.amount, e.debtSettlement]), [[1965467.83, false], [1321604.48, false], [6500, false]],
  "gümrük dilimleri sıradan nakit çıkışı (borç kapatma değil); kredi taksiti ayrıca sayılmaz");
assert.equal(r.importsPaid, true);
assert.equal(r.horizonDays, 51);
assert.ok(!seen.some(s => /cfo_servet_kalem/.test(s)), "eski cfo_servet_kalem etiketi okunmaz");
console.log("CFO borç tahmini: gümrük/vergi çıkışı borç kapatmaz ve eksik veri üretmez (D-P03), dilimli gümrük, kredi taksiti ayrı passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
