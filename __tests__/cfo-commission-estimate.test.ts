import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { estimatedCommission, estimatedCommissionSql, ESTIMATED_COMMISSION_CHANNELS } from "../lib/cfo/commission-estimate";

// CFO-028 karar 1 (Alperen 2026-10-10): EPTT'de tutar boşken Entegra oranı × KDV dahil toplam = TAHMİNİ komisyon. Kayıtlı tutar varsa
// tahmin yok; diğer kanallar tahmin almaz (UNKNOWN); oran 0/boş ya da toplam boşsa tahmin yok. SQL ifadesi ile TS aynası aynı sonucu verir.
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
  [{ channel: "N11", commissionTry: null, commissionPct: 15, totalAmountTry: 400 }, null],
  [{ channel: "TRENDYOL", commissionTry: null, commissionPct: 17, totalAmountTry: 400 }, null],
];

async function main() {
  assert.deepEqual([...ESTIMATED_COMMISSION_CHANNELS], ["EPTT"], "yalnız EPTT (diğer kanallar oran belgesine kadar UNKNOWN)");
  for (const [row, want] of CASES) assert.equal(estimatedCommission(row), want, JSON.stringify(row));

  const pg = new PGlite();
  try {
    await pg.exec(`create table s (id int, channel text, "commissionTry" numeric(14,2), "commissionPct" numeric(6,2), "totalAmountTry" numeric(14,2))`);
    for (const [i, [r]] of CASES.entries())
      await pg.query(`insert into s values ($1,$2,$3,$4,$5)`, [i, r.channel, r.commissionTry, r.commissionPct, r.totalAmountTry]);
    const rows = (await pg.query<{ id: number; v: string | null }>(`select id, ${estimatedCommissionSql()}::text v from s order by id`)).rows;
    assert.deepEqual(rows.map(r => (r.v == null ? null : Number(r.v))), CASES.map(([, want]) => want), "SQL = TS");
  } finally { await pg.close(); }
  console.log("CFO-028 EPTT tahmini komisyon: yalnız tutar boşken oran × toplam, kayıtlı tutar önce, diğer kanallar UNKNOWN, SQL = TS passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
