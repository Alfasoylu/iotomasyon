import assert from "node:assert/strict";
import { addDays, bulletinUrl, fxUpsertSql, monthsBetween, parseUsdForexBuying, referenceRateForMonth, type FetchLike } from "../lib/fm/tcmb-fx";

// Step 1F — TCMB monthly reference rule: the 15th, or the previous TCMB business day; never a non-TCMB fallback.
const xml = (date: string, buying: string, no = "2026/151") => {
  const [y, m, d] = date.split("-");
  return `<?xml version="1.0"?><Tarih_Date Tarih="${d}.${m}.${y}" Date="${m}/${d}/${y}"  Bulten_No="${no}" >
    <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><ForexBuying>${buying}</ForexBuying><ForexSelling>99.9999</ForexSelling><BanknoteBuying>88.8888</BanknoteBuying></Currency>
    <Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR"><Unit>1</Unit><ForexBuying>55.5555</ForexBuying></Currency></Tarih_Date>`;
};
const serve = (bulletins: Record<string, string>, calls: string[] = []): FetchLike => async url => {
  calls.push(url);
  const iso = Object.keys(bulletins).find(d => bulletinUrl(d) === url);
  return iso ? { status: 200, text: async () => bulletins[iso] } : { status: 404, text: async () => "Not Found" };
};

async function main() {
  assert.equal(bulletinUrl("2026-08-14"), "https://www.tcmb.gov.tr/kurlar/202608/14082026.xml");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28"); assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.deepEqual(monthsBetween("2020-08", "2020-10"), ["2020-08", "2020-09", "2020-10"]);
  assert.equal(monthsBetween("2020-08", "2026-10").length, 75);

  // Parsing: ForexBuying only (not selling/banknote/other currencies).
  assert.deepEqual(parseUsdForexBuying(xml("2026-08-14", "47.7206"), "2026-08-14"), { rate: 47.7206, bulletinNo: "2026/151" });
  assert.equal(parseUsdForexBuying(xml("2026-08-14", "47.7206"), "2026-08-15"), null, "bulletin date must equal the requested day");
  assert.equal(parseUsdForexBuying("<html>maintenance</html>", "2026-08-14"), null);
  assert.equal(parseUsdForexBuying(xml("2026-08-14", "0"), "2026-08-14"), null);

  // 15th is a business day → that day's bulletin, not a fallback.
  const direct = await referenceRateForMonth("2026-07", serve({ "2026-07-15": xml("2026-07-15", "46.1111") }), "2026-10-05");
  assert(direct.status === "ok" && direct.rate === 46.1111 && direct.refDate === "2026-07-15" && !direct.isFallbackDay);

  // 15 Aug 2026 is a Saturday → previous TCMB business day (Friday the 14th).
  const calls: string[] = [];
  const sat = await referenceRateForMonth("2026-08", serve({ "2026-08-14": xml("2026-08-14", "47.7206"), "2026-08-13": xml("2026-08-13", "47.0000") }, calls), "2026-10-05");
  assert(sat.status === "ok" && sat.refDate === "2026-08-14" && sat.rate === 47.7206 && sat.isFallbackDay);
  assert.deepEqual(calls.map(c => c.slice(-12, -4)), ["15082026", "14082026"]);

  // Sunday the 15th with a holiday-style gap: walks back over several missing days to the last bulletin.
  const gap = await referenceRateForMonth("2026-03", serve({ "2026-03-11": xml("2026-03-11", "44.4444") }), "2026-10-05");
  assert(gap.status === "ok" && gap.refDate === "2026-03-11" && gap.isFallbackDay);

  // No bulletin within the lookback window → explicit "missing"; NEVER another source.
  const none = await referenceRateForMonth("2026-02", serve({}), "2026-10-05");
  assert.equal(none.status, "missing"); assert.equal((none as { tried: string[] }).tried.length, 11);

  // Server errors / malformed bulletins are failures, not "holidays".
  await assert.rejects(referenceRateForMonth("2026-04", async () => ({ status: 503, text: async () => "" }), "2026-10-05"), /503/);
  await assert.rejects(referenceRateForMonth("2026-04", async () => ({ status: 200, text: async () => "<html/>" }), "2026-10-05"), /ayrıştırılamadı/);
  await assert.rejects(referenceRateForMonth("2026-04", async () => { throw new Error("network down"); }, "2026-10-05"), /network down/);

  // A month whose 15th has not arrived yet stays pending (no fetch, no value).
  const fetched: string[] = [];
  const pending = await referenceRateForMonth("2026-10", serve({}, fetched), "2026-10-05");
  assert.equal(pending.status, "pending"); assert.equal(fetched.length, 0);

  // SQL: only verified months, idempotent upsert, escaped, 4-decimal rate.
  const sql = fxUpsertSql([direct, sat, none, pending], "00000000-0000-0000-0000-000000000002");
  assert(sql.includes("('2026-07-01', 46.1111, '2026-07-15'") && sql.includes("('2026-08-01', 47.7206, '2026-08-14'"));
  assert(!sql.includes("2026-02-01") && !sql.includes("2026-10-01"), "missing/pending months are never written");
  assert(sql.includes("ON CONFLICT (month) DO UPDATE"));
  assert.equal(fxUpsertSql([none, pending], null), "");
  console.log("TCMB FX: 15th / previous business day / missing / pending / error handling / SQL generation passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
