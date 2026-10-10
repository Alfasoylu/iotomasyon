import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { commissionEstimateReason, estimatedCommission, estimatedCommissionChannels, estimatedCommissionSql, ESTIMATED_COMMISSION_CHANNELS } from "../lib/cfo/commission-estimate";

// CFO-028 karar 1 (Alperen 2026-10-10): EPTT'de tutar boşken Entegra oranı × KDV dahil toplam = TAHMİNİ komisyon. Kayıtlı tutar varsa
// tahmin yok; diğer kanallar tahmin almaz (UNKNOWN); oran 0/boş ya da toplam boşsa tahmin yok. SQL ifadesi ile TS aynası aynı sonucu verir.
// Adım 2 (10.10): N11 tutar boş/0 iken API ölçümlü %15,88 × toplam; kayıtlı pozitif tutar önce; 90 gün sonra oran düşer (UNKNOWN).
// Çalıştır: node --import tsx __tests__/cfo-commission-estimate.test.ts
type R = { channel: string; commissionTry: number | null; commissionPct: number | null; totalAmountTry: number | null };
const CASES: [R, number | null][] = [
  [{ channel: "EPTT", commissionTry: null, commissionPct: 15, totalAmountTry: 500 }, 75],
  [{ channel: "EPTT", commissionTry: null, commissionPct: 14.31, totalAmountTry: 1234.56 }, 176.67],
  [{ channel: "EPTT", commissionTry: 60, commissionPct: 15, totalAmountTry: 400 }, null],
  [{ channel: "EPTT", commissionTry: 0, commissionPct: 15, totalAmountTry: 400 }, null],
  [{ channel: "EPTT", commissionTry: null, commissionPct: 0, totalAmountTry: 400 }, null],
  [{ channel: "EPTT", commissionTry: null, commissionPct: null, totalAmountTry: 400 }, null],
  [{ channel: "EPTT", commissionTry: null, commissionPct: 15, totalAmountTry: null }, null],
  [{ channel: "N11", commissionTry: null, commissionPct: 15, totalAmountTry: 400 }, 63.52],
  [{ channel: "N11", commissionTry: 0, commissionPct: 0, totalAmountTry: 1000 }, 158.8],
  [{ channel: "N11", commissionTry: 70, commissionPct: 0, totalAmountTry: 400 }, null],
  [{ channel: "N11", commissionTry: 0, commissionPct: 0, totalAmountTry: null }, null],
  [{ channel: "MIRAKL_KOCTAS", commissionTry: 0, commissionPct: 0, totalAmountTry: 400 }, null],
  [{ channel: "TRENDYOL", commissionTry: null, commissionPct: 17, totalAmountTry: 400 }, null],
];

async function main() {
  const ON = new Date("2026-10-11T00:00:00Z"), LATE = new Date("2027-01-10T00:00:00Z"); // ölçüm 2026-10-10 + 90 gün = 2027-01-08
  assert.deepEqual([...ESTIMATED_COMMISSION_CHANNELS], ["EPTT", "N11"], "EPTT + API ölçümlü N11; Koçtaş ve diğerleri UNKNOWN");
  assert.deepEqual(estimatedCommissionChannels(ON), ["EPTT", "N11"]);
  assert.deepEqual(estimatedCommissionChannels(LATE), ["EPTT"], "süresi dolan API oranı düşer");
  assert.equal(commissionEstimateReason("N11"), "marketplace_api_measured_rate_estimate");
  assert.equal(commissionEstimateReason("EPTT"), "eptt_entegra_rate_estimate");
  for (const [row, want] of CASES) assert.equal(estimatedCommission(row, ON), want, JSON.stringify(row));
  for (const [row, want] of CASES) assert.equal(estimatedCommission(row, LATE), row.channel === "N11" ? null : want, "süre doldu: " + JSON.stringify(row));

  const pg = new PGlite();
  try {
    await pg.exec(`create table s (id int, channel text, "commissionTry" numeric(14,2), "commissionPct" numeric(6,2), "totalAmountTry" numeric(14,2))`);
    for (const [i, [r]] of CASES.entries())
      await pg.query(`insert into s values ($1,$2,$3,$4,$5)`, [i, r.channel, r.commissionTry, r.commissionPct, r.totalAmountTry]);
    for (const asOf of [ON, LATE]) {
      const rows = (await pg.query<{ id: number; v: string | null }>(`select id, ${estimatedCommissionSql(undefined, asOf)}::text v from s order by id`)).rows;
      assert.deepEqual(rows.map(r => (r.v == null ? null : Number(r.v))), CASES.map(([r]) => estimatedCommission(r, asOf)), "SQL = TS " + asOf.toISOString());
    }
  } finally { await pg.close(); }
  console.log("CFO-028 tahmini komisyon: EPTT oran × toplam, N11 API oranı (90 gün), kayıtlı tutar önce, Koçtaş/diğerleri UNKNOWN, SQL = TS passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
