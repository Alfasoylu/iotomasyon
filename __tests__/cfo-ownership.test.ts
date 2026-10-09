import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { isPersonalAccount, isPersonalCard, personalAccountSql, personalCardSql } from "../lib/cfo/ownership";

// Şirket / şahsi TEK sınıflama (CFO-006): hesap türü "ŞAHSİ" kelimesi (Türkçe katlanmış), kart sahibi "Alp". TS ve SQL aynı sonucu verir.
// Üretim 09.10 hesap/kart listesi eski kurallarla aynı sınıflanır. Çalıştır: node --import tsx __tests__/cfo-ownership.test.ts
const ACCOUNTS: [string, boolean][] = [
  ["Vadesiz + KMH", false], ["Vadesiz", false], ["Vadesiz DÖVİZ", false], ["Vadesiz + KMH (ŞAHSİ)", true],
  ["vadesiz + kmh (şahsi)", true], ["Şahsi", true], ["SAHSI hesap", true], ["ŞAHSİYET", false], ["", false],
];
const CARDS: [string | null, boolean][] = [
  ["Alp", true], [" alp ", true], ["ALP", true], ["Şirket", false], ["Alfa — Alperen (ana kart)", false], ["Alfa — Fatih (ek kart)", false], [null, false],
];

async function main() {
  // eski JS kuralı /ŞAHSİ/i küçük harf "şahsi"yi yakalamıyordu (İ'nin küçüğü "i̇") — yeni kural yakalar
  assert.equal(/ŞAHSİ/i.test("vadesiz + kmh (şahsi)"), false, "eski kuralın kusuru (belgelendi)");
  for (const [t, want] of ACCOUNTS) assert.equal(isPersonalAccount(t), want, `hesap: ${t}`);
  for (const [h, want] of CARDS) assert.equal(isPersonalCard(h), want, `kart: ${h}`);
  assert.equal(isPersonalAccount(null), false);

  const db = new PGlite();
  try {
    for (const [t, want] of ACCOUNTS) {
      const [r] = (await db.query<{ p: boolean }>(`select ${personalAccountSql("$1::text")} as p`, [t])).rows;
      assert.equal(r.p, want, `SQL hesap: ${t}`);
    }
    for (const [h, want] of CARDS) {
      const [r] = (await db.query<{ p: boolean }>(`select ${personalCardSql("$1::text")} as p`, [h])).rows;
      assert.equal(r.p, want, `SQL kart: ${h}`);
    }
  } finally { await db.close(); }
  console.log("Şirket/şahsi tek sınıflama: hesap türü ŞAHSİ (Türkçe katlanmış), kart sahibi Alp; TS = SQL; eski küçük-harf kusuru kapandı passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
