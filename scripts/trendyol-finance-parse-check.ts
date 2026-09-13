/**
 * Faz 91 — Trendyol finans ayrıştırıcı doğrulama aracı (DB'ye yazmaz).
 *
 * Kullanım:
 *   npx tsx scripts/trendyol-finance-parse-check.ts "C:\\Users\\...\\Downloads"
 *
 * Klasördeki her .xlsx/.pdf dosyasını lib/trendyol-finance/parse.ts ile
 * ayrıştırır ve tür + satır sayısı + toplam tutar özetini yazar. Trendyol yeni
 * bir dosya varyantı yayınladığında tanınmayanları hızlıca görmek için.
 */

import fs from "node:fs";
import path from "node:path";
import { parseFile, extractSourceRef, UnsupportedFileError } from "../lib/trendyol-finance/parse";

const dir = process.argv[2];
if (!dir) {
  console.error("Kullanım: npx tsx scripts/trendyol-finance-parse-check.ts <klasör|dosya>");
  process.exit(1);
}

const files = fs.statSync(dir).isDirectory()
  ? fs
      .readdirSync(dir)
      .filter((f) => /\.(xlsx|pdf)$/i.test(f) && !f.startsWith("~$"))
      .map((f) => path.join(dir, f))
  : [dir];

let ok = 0;
let fail = 0;

for (const file of files) {
  const name = path.basename(file);
  try {
    const res = parseFile(name, fs.readFileSync(file));
    const ref = extractSourceRef(name);

    if (res.kind === "INVOICE_LIST") {
      const total = res.invoices.reduce((s, i) => s + i.amountTry, 0);
      console.log(`✔ ${res.kind.padEnd(18)} ${res.invoices.length} fatura, net ${total.toFixed(2)} TL — ${name}`);
    } else if (res.kind === "SETTLEMENT") {
      const seller = res.settlements.reduce((s, i) => s + (i.sellerShareTry ?? 0), 0);
      const comm = res.settlements.reduce((s, i) => s + (i.trendyolShareTry ?? 0), 0);
      console.log(`✔ ${res.kind.padEnd(18)} ${res.settlements.length} satır, hakediş ${seller.toFixed(2)} / komisyon ${comm.toFixed(2)} — ref ${ref}`);
    } else if (res.kind === "INVOICE_PDF") {
      const p = res.pdf;
      console.log(`✔ ${res.kind.padEnd(18)} ${p.invoiceNo} · net ${p.netTry} + KDV ${p.vatTry} = ${p.grossTry} · %${p.vatRatePct} · ${p.itemName ?? "—"}`);
    } else {
      const total = res.lines.reduce((s, l) => s + l.amountTry, 0);
      console.log(`✔ ${res.kind.padEnd(18)} ${res.lines.length} satır, ${total.toFixed(2)} TL — ref ${ref}`);
    }
    ok++;
  } catch (e) {
    fail++;
    const msg = e instanceof UnsupportedFileError ? e.message : String(e);
    console.log(`✘ ${"TANINMADI".padEnd(18)} ${name}\n    ${msg}`);
  }
}

console.log(`\n${ok} dosya ayrıştırıldı, ${fail} tanınmadı.`);
