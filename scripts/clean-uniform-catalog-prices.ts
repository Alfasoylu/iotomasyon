/**
 * Yanlış uniform manuel fiyatları temizle.
 *
 * Tespit kuralı: aynı wholesalePriceUsd değerine 10+ ürün sahipse,
 * bu accidental bulk-set'tir (gerçek özel fiyat olamaz). Null'a çek,
 * catalog XML fallback'e düşer.
 *
 * Usage:
 *   npx tsx scripts/clean-uniform-catalog-prices.ts            # dry-run
 *   npx tsx scripts/clean-uniform-catalog-prices.ts --apply    # yaz
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv();
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const APPLY = process.argv.includes("--apply");
const MIN_COUNT_THRESHOLD = 10; // Aynı fiyata 10+ ürün varsa uniform set sayılır

// Sadece açıkça artificial olan .99 paternleri (kullanıcı onayladı).
// Küçük fractional değerler ($1.67, $5.83, vb.) backfill'den meşru olabilir, dokunmayız.
const WHOLESALE_KNOWN_BAD = ["38.99", "311.99", "194.99", "116.99"];
const RETAIL_KNOWN_BAD = ["49.99", "399.99", "249.99", "149.99"];

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (yazacak)" : "DRY-RUN"}\n`);

  // Wholesale uniform değerler
  const wholesaleSuspect = await prisma.$queryRaw<Array<{ price: string; cnt: bigint }>>`
    SELECT "wholesalePriceUsd"::text as price, COUNT(*) as cnt
    FROM "Product"
    WHERE "isActive" = true AND "wholesalePriceUsd" IS NOT NULL
    GROUP BY "wholesalePriceUsd"
    HAVING COUNT(*) >= ${MIN_COUNT_THRESHOLD}
    ORDER BY cnt DESC
  `;
  console.log(`Wholesale uniform fiyatlar (${MIN_COUNT_THRESHOLD}+ ürün/fiyat):`);
  let wholesaleAffected = 0;
  for (const r of wholesaleSuspect) {
    console.log(`  $${r.price.padEnd(12)} → ${r.cnt} ürün`);
    wholesaleAffected += Number(r.cnt);
  }
  console.log(`  TOPLAM: ${wholesaleAffected} ürün\n`);

  // Retail uniform değerler
  const retailSuspect = await prisma.$queryRaw<Array<{ price: string; cnt: bigint }>>`
    SELECT "retailPriceUsd"::text as price, COUNT(*) as cnt
    FROM "Product"
    WHERE "isActive" = true AND "retailPriceUsd" IS NOT NULL
    GROUP BY "retailPriceUsd"
    HAVING COUNT(*) >= ${MIN_COUNT_THRESHOLD}
    ORDER BY cnt DESC
  `;
  console.log(`Retail uniform fiyatlar (${MIN_COUNT_THRESHOLD}+ ürün/fiyat):`);
  let retailAffected = 0;
  for (const r of retailSuspect) {
    console.log(`  $${r.price.padEnd(12)} → ${r.cnt} ürün`);
    retailAffected += Number(r.cnt);
  }
  console.log(`  TOPLAM: ${retailAffected} ürün\n`);

  // Temizlenecek sadece known-bad listesi (yukarıdaki WHOLESALE/RETAIL_KNOWN_BAD)
  console.log(`\n── Aksiyon kapsamı (sadece known-bad .99 paternleri) ──`);
  const wholesalePrices = WHOLESALE_KNOWN_BAD;
  const retailPrices = RETAIL_KNOWN_BAD;

  // Wholesale silinecek + XML kapsama
  const wQuoted = wholesalePrices.map((p) => `'${p}'`).join(",");
  const wAffectedRows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) as cnt FROM "Product" WHERE "isActive" = true AND "wholesalePriceUsd"::text IN (${wQuoted})`,
  );
  const wAffected = Number(wAffectedRows[0]?.cnt ?? 0);
  const wWillCoverRows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) as cnt FROM "Product" p
     INNER JOIN "XmlProductData" x ON x."productId" = p.id
     WHERE p."isActive" = true
       AND p."wholesalePriceUsd"::text IN (${wQuoted})
       AND x."xmlBayiPrice" IS NOT NULL`,
  );
  const wWillCover = Number(wWillCoverRows[0]?.cnt ?? 0);
  console.log(`  Wholesale silinecek: ${wAffected} ürün → XML bayi fallback ${wWillCover} ürünü yakalar (${((wWillCover / Math.max(1, wAffected)) * 100).toFixed(0)}%)`);

  // Retail silinecek + XML kapsama
  const rQuoted = retailPrices.map((p) => `'${p}'`).join(",");
  const rAffectedRows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) as cnt FROM "Product" WHERE "isActive" = true AND "retailPriceUsd"::text IN (${rQuoted})`,
  );
  const rAffected = Number(rAffectedRows[0]?.cnt ?? 0);
  const rWillCoverRows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) as cnt FROM "Product" p
     INNER JOIN "XmlProductData" x ON x."productId" = p.id
     WHERE p."isActive" = true
       AND p."retailPriceUsd"::text IN (${rQuoted})
       AND x."xmlPrice4" IS NOT NULL`,
  );
  const rWillCover = Number(rWillCoverRows[0]?.cnt ?? 0);
  console.log(`  Retail silinecek   : ${rAffected} ürün → XML public fallback ${rWillCover} ürünü yakalar (${((rWillCover / Math.max(1, rAffected)) * 100).toFixed(0)}%)`);

  if (!APPLY) {
    console.log("\n[DRY-RUN] Yazma yapmadı. --apply ile koş.");
    await prisma.$disconnect();
    return;
  }

  // Apply: uniform değerleri null'a çek
  console.log("\nApplying...");
  let wResult = 0;
  let rResult = 0;
  if (wholesalePrices.length > 0) {
    const r = await prisma.$executeRawUnsafe(
      `UPDATE "Product" SET "wholesalePriceUsd" = NULL WHERE "isActive" = true AND "wholesalePriceUsd"::text IN (${wholesalePrices.map((p) => `'${p}'`).join(",")})`,
    );
    wResult = r;
  }
  if (retailPrices.length > 0) {
    const r = await prisma.$executeRawUnsafe(
      `UPDATE "Product" SET "retailPriceUsd" = NULL WHERE "isActive" = true AND "retailPriceUsd"::text IN (${retailPrices.map((p) => `'${p}'`).join(",")})`,
    );
    rResult = r;
  }
  console.log(`  wholesalePriceUsd → NULL: ${wResult} ürün`);
  console.log(`  retailPriceUsd → NULL: ${rResult} ürün`);
  console.log("Done.");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
