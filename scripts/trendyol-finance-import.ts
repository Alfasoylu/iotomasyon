/**
 * Faz 91 — Trendyol finans dosyalarını komut satırından içe aktarır.
 *
 * Panel yükleme alanıyla aynı yazıcıyı kullanır (lib/trendyol-finance/import.ts),
 * yalnız çok sayıda dosyayı toplu işlemek için kısayol. Panelden yüklemek de
 * aynı sonucu verir.
 *
 * Kullanım:
 *   npx tsx scripts/trendyol-finance-import.ts <klasör|dosya> [--email you@example.com]
 *
 * Fatura listesi (Faturalar_*.xlsx) önce işlenir — detay dosyalarının fatura
 * başlığına bağlanabilmesi için başlıkların önce var olması gerekir.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// `lib/prisma` "server-only" import eder; bu paket Next.js dışında çalışınca
// throw ediyor. Script bir sunucu bağlamı olduğundan modülü boş bir modülle
// değiştiriyoruz. Bu yüzden yazıcı ancak dinamik import ile yüklenebilir.
const req = createRequire(import.meta.url);
req.cache[req.resolve("server-only")] = {
  id: "server-only",
  filename: "server-only",
  loaded: true,
  exports: {},
} as never;

const target = process.argv[2];
if (!target) {
  console.error("Kullanım: npx tsx scripts/trendyol-finance-import.ts <klasör|dosya> [--email x@y.z]");
  process.exit(1);
}

const emailIdx = process.argv.indexOf("--email");
const email = emailIdx > 0 ? (process.argv[emailIdx + 1] ?? null) : null;

const files = fs.statSync(target).isDirectory()
  ? fs
      .readdirSync(target)
      .filter((f) => /\.(xlsx|pdf)$/i.test(f) && !f.startsWith("~$"))
      .map((f) => path.join(target, f))
  : [target];

// Fatura listesi önce: detay eşleştirmesi başlıkların varlığına dayanıyor.
files.sort((a, b) => {
  const rank = (f: string) => (/Faturalar_/i.test(path.basename(f)) ? 0 : 1);
  return rank(a) - rank(b) || a.localeCompare(b);
});

async function main() {
  const { importTrendyolFinanceFile: importFile } = await import(
    "../lib/trendyol-finance/import"
  );

  let ok = 0;
  let failed = 0;

  for (const file of files) {
    const name = path.basename(file);
    const res = await importFile(name, fs.readFileSync(file), email);

    if (res.ok) ok++;
    else failed++;

    console.log(`${res.ok ? "✔" : "✘"} ${(res.kind ?? "—").padEnd(18)} ${name}`);
    console.log(`    ${res.message}`);
  }

  console.log(`\n${ok} dosya işlendi, ${failed} başarısız.`);
}

main();
