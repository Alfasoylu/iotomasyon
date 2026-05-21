/**
 * Backfill Product.wholesalePriceUsd and retailPriceUsd from XmlProductData.xmlBayiPrice.
 *
 * Rules:
 *   - wholesalePriceUsd = xmlBayiPrice (1:1)
 *   - retailPriceUsd    = xmlBayiPrice * 1.20
 *   - Only active products
 *   - Only fill where the target is currently NULL (manual overrides preserved)
 *
 * Usage:
 *   npx tsx scripts/backfill-catalog-from-xml.ts --dry-run
 *   npx tsx scripts/backfill-catalog-from-xml.ts --execute
 */

import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv();

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL veya DIRECT_URL bulunamadı.");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

const RETAIL_MULTIPLIER = 1.2;

async function main() {
  const flag = process.argv[2] ?? "";
  const isDry = flag === "--dry-run" || flag === "";
  const isExec = flag === "--execute";
  if (!isDry && !isExec) {
    console.error('Usage: tsx scripts/backfill-catalog-from-xml.ts [--dry-run | --execute]');
    process.exit(1);
  }

  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      xmlData: { is: { xmlBayiPrice: { not: null } } },
    },
    select: {
      id: true,
      sku: true,
      name: true,
      wholesalePriceUsd: true,
      retailPriceUsd: true,
      xmlData: { select: { xmlBayiPrice: true } },
    },
  });

  let willFillWholesale = 0;
  let willFillRetail = 0;
  let skippedWholesale = 0;
  let skippedRetail = 0;

  type Update = { id: string; wholesale: number | null; retail: number | null };
  const updates: Update[] = [];

  for (const p of rows) {
    const bayi = p.xmlData?.xmlBayiPrice ? Number(p.xmlData.xmlBayiPrice) : null;
    if (bayi == null || !Number.isFinite(bayi) || bayi <= 0) continue;

    const wholesale =
      p.wholesalePriceUsd == null ? Math.round(bayi * 100) / 100 : null;
    const retail =
      p.retailPriceUsd == null
        ? Math.round(bayi * RETAIL_MULTIPLIER * 100) / 100
        : null;

    if (wholesale != null) willFillWholesale++;
    else skippedWholesale++;
    if (retail != null) willFillRetail++;
    else skippedRetail++;

    if (wholesale != null || retail != null) {
      updates.push({ id: p.id, wholesale, retail });
    }
  }

  console.log("─".repeat(70));
  console.log(`XmlBayiPrice mevcut + isActive ürün sayısı: ${rows.length}`);
  console.log(`Doldurulacak wholesalePriceUsd: ${willFillWholesale}`);
  console.log(`Korunan (zaten dolu) wholesale: ${skippedWholesale}`);
  console.log(`Doldurulacak retailPriceUsd   : ${willFillRetail} (× ${RETAIL_MULTIPLIER})`);
  console.log(`Korunan (zaten dolu) retail   : ${skippedRetail}`);
  console.log("─".repeat(70));

  if (rows.length > 0) {
    const sample = rows.slice(0, 5);
    console.log("Örnek 5 ürün:");
    for (const p of sample) {
      const bayi = Number(p.xmlData!.xmlBayiPrice);
      console.log(
        `  ${p.sku.padEnd(20)} bayi=$${bayi.toFixed(2).padStart(8)} ` +
          `w=${p.wholesalePriceUsd == null ? "→fill" : "keep"} ` +
          `r=${p.retailPriceUsd == null ? "→fill" : "keep"} | ${p.name.slice(0, 40)}`,
      );
    }
    console.log("─".repeat(70));
  }

  if (isDry) {
    console.log("DRY RUN — hiçbir değişiklik yapılmadı.");
    console.log("Uygulamak için: npx tsx scripts/backfill-catalog-from-xml.ts --execute");
    await prisma.$disconnect();
    return;
  }

  console.log(`EXECUTE: ${updates.length} satır güncelleniyor...`);
  let done = 0;
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    await prisma.$transaction(
      chunk.map((u) =>
        prisma.product.update({
          where: { id: u.id },
          data: {
            ...(u.wholesale != null ? { wholesalePriceUsd: u.wholesale } : {}),
            ...(u.retail != null ? { retailPriceUsd: u.retail } : {}),
          },
        }),
      ),
    );
    done += chunk.length;
    process.stdout.write(`\r  ${done}/${updates.length}`);
  }
  console.log("\nTamamlandı.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
