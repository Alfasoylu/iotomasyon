import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv();
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const total = await prisma.product.count({ where: { isActive: true } });
  const wholesaleManual = await prisma.product.count({
    where: { isActive: true, wholesalePriceUsd: { not: null } },
  });
  const wholesaleViaXml = await prisma.product.count({
    where: {
      isActive: true,
      wholesalePriceUsd: null,
      xmlData: { is: { xmlBayiPrice: { not: null } } },
    },
  });
  const retailManual = await prisma.product.count({
    where: { isActive: true, retailPriceUsd: { not: null } },
  });
  const retailViaXml = await prisma.product.count({
    where: {
      isActive: true,
      retailPriceUsd: null,
      xmlData: { is: { xmlPrice4: { not: null } } },
    },
  });

  console.log(`Aktif ürün: ${total}\n`);
  console.log("BAYİ modu kapsamı:");
  console.log(`  Manuel wholesalePriceUsd dolu : ${wholesaleManual}`);
  console.log(`  XML fallback (xmlBayiPrice)   : ${wholesaleViaXml}`);
  console.log(`  TOPLAM kapsama                : ${wholesaleManual + wholesaleViaXml} / ${total} (${(((wholesaleManual + wholesaleViaXml) / total) * 100).toFixed(1)}%)`);
  console.log();
  console.log("PERAKENDE modu kapsamı:");
  console.log(`  Manuel retailPriceUsd dolu    : ${retailManual}`);
  console.log(`  XML fallback (xmlPrice4)      : ${retailViaXml}`);
  console.log(`  TOPLAM kapsama                : ${retailManual + retailViaXml} / ${total} (${(((retailManual + retailViaXml) / total) * 100).toFixed(1)}%)`);

  // Top 10 wholesale fiyat dağılımı (uniform-set bulgusu)
  console.log("\nTop wholesale fiyat dağılımı (manuel kalanlar):");
  const top = await prisma.$queryRaw<Array<{ price: string; cnt: bigint }>>`
    SELECT "wholesalePriceUsd"::text as price, COUNT(*) as cnt
    FROM "Product"
    WHERE "isActive" = true AND "wholesalePriceUsd" IS NOT NULL
    GROUP BY "wholesalePriceUsd"
    ORDER BY cnt DESC
    LIMIT 10
  `;
  for (const r of top) {
    console.log(`  $${r.price.padEnd(12)} → ${r.cnt} ürün`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
