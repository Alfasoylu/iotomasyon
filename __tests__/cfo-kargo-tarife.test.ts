import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Kargo tarifeleri: migration verisi = kaynak CSV (hücre hücre), yapısal tutarlılık, tahmin fonksiyonu, güvenlik.
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;
const csv = (path: string) => readFileSync(path, "utf8").trim().split("\n").map(l => l.split(","));
const est = async (date: string, desi: number, carrier = "TEX", order: number | null = null) =>
  (await q(`select price_ex_vat::float e, price_incl_vat::float i, basis, tariff_valid_from::text f, verified v from cfo_kargo_tahmin('${date}', ${desi}, '${carrier}', ${order ?? "null"})`))[0];

async function main() {
  await db.exec(`create role cfo_acceptance_reader login nosuperuser nobypassrls; grant usage on schema public to cfo_acceptance_reader;`);
  const sql = readFileSync("prisma/migrations/20261005260000_cfo_kargo_desi_tarife/migration.sql", "utf8");
  await db.exec(sql); await db.exec(sql); // idempotent

  // 1) Every CSV cell is in the table exactly once (transcription lock) + nothing extra.
  for (const [file, from] of [["data/kargo/trendyol-2025-01-03.csv", "2025-01-03"], ["data/kargo/trendyol-2026-07-13.csv", "2026-07-13"]] as const) {
    const [hdr, ...rows] = csv(file);
    let cells = 0;
    for (const r of rows) for (let c = 1; c < hdr.length; c++) {
      const got = await q(`select price_ex_vat::float p from cfo_kargo_desi_tarife where carrier='${hdr[c]}' and valid_from='${from}' and desi=${r[0]}`);
      assert.deepEqual(got.map(x => x.p), [Number(r[c])], `${file} ${hdr[c]} desi ${r[0]}`); cells++;
    }
    assert.equal(Number((await q(`select count(*)::int n from cfo_kargo_desi_tarife where valid_from='${from}'`))[0].n), cells);
  }
  // 2) Plausibility: price never decreases with desi from desi 3 up, except nothing (typo guard).
  const bad = await q(`select carrier, valid_from::text f, desi from (select *, lag(price_ex_vat) over (partition by carrier, valid_from order by desi) prev from cfo_kargo_desi_tarife) t where desi >= 3 and price_ex_vat < prev`);
  assert.deepEqual(bad, [], "price decreases with desi");

  // 3) Estimates. TEX desi 1 on 2026-07-14 = 77.54 ex VAT = 93.05 incl VAT (matches Trendyol TEX invoices).
  assert.deepEqual(await est("2026-07-14", 1), { e: 77.54, i: 93.05, basis: "DESI_TARIFE", f: "2026-07-13", v: false });
  assert.equal((await est("2026-07-14", 0.47)).e, 77.54, "fractional desi rounds up");
  assert.equal((await est("2026-07-14", 5, "Aras")).i, 141.42, "Aras desi 5 incl VAT matches invoices");
  assert.equal((await est("2026-07-14", 3, "tex")).e, 93.63, "carrier match is case-insensitive");
  assert.equal((await est("2025-06-01", 1)).e, 61.04); assert.equal((await est("2025-06-01", 1)).f, "2025-01-03");
  assert.equal(await est("2026-07-14", 93), undefined, "desi beyond the table is unknown, not extrapolated");
  assert.equal(await est("2024-12-31", 1), undefined, "no tariff before the first loaded list");
  assert.equal(await est("2026-07-14", 1, "NOPE"), undefined);

  // 4) Small-order barem (user recollection → verified=false) only inside its dated years; none for 2026.
  assert.deepEqual(await est("2025-06-01", 1, "TEX", 80), { e: 30, i: 36, basis: "BAREM_3", f: null, v: false });
  assert.equal((await est("2024-06-01", 1, "TEX", 99)).e, 25);
  assert.equal((await est("2023-06-01", 1, "TEX", 69)).e, 20);
  assert.equal((await est("2025-06-01", 1, "TEX", 100)).basis, "DESI_TARIFE", "threshold is exclusive");
  assert.equal((await est("2026-08-01", 1, "TEX", 50)).basis, "DESI_TARIFE", "no verified 2026 barem");
  assert.equal(Number((await q(`select count(*)::int n from cfo_kargo_barem where verified`))[0].n), 6);

  // 5) Channel policy + hardening.
  assert.deepEqual(await q(`select channel, cost_basis from cfo_kargo_kanal_varsayim`), [{ channel: "*", cost_basis: "TRENDYOL_ANLASMALI" }]);
  for (const t of ["cfo_kargo_desi_tarife", "cfo_kargo_barem", "cfo_kargo_kanal_varsayim"]) {
    assert.equal((await q(`select relrowsecurity r from pg_class where oid='public.${t}'::regclass`))[0].r, true);
    assert.equal((await q(`select has_table_privilege('cfo_acceptance_reader','public.${t}','SELECT') p`))[0].p, true);
    assert.equal((await q(`select has_table_privilege('cfo_acceptance_reader','public.${t}','INSERT') p`))[0].p, false);
  }
  console.log("Kargo tarifeleri: CSV=migration, plausibility, estimates, barem, channel policy, hardening passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.close());
