import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv();
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  // 1) Kataloğda görünen SKU'ların gerçek fiyatları
  const skus = [
    "IPSET126000", "IPSET244000", "ASY9935000", "IPSET4810000",
    "IPSET482000", "IPSET8200", "IPSET8500",
  ];

  console.log("Kataloğun ilk 8 SKU'sunun fiyat durumu:\n");
  for (const sku of skus) {
    const p = await prisma.product.findFirst({
      where: { sku },
      select: {
        sku: true,
        name: true,
        wholesalePriceUsd: true,
        retailPriceUsd: true,
        xmlData: {
          select: { xmlBayiPrice: true, xmlPrice4: true },
        },
      },
    });
    if (!p) {
      console.log(`  ${sku}: NOT FOUND`);
      continue;
    }
    console.log(`  ${p.sku.padEnd(14)} wholesale=${String(p.wholesalePriceUsd ?? "—").padStart(8)}  retail=${String(p.retailPriceUsd ?? "—").padStart(8)}  xmlBayi=${String(p.xmlData?.xmlBayiPrice ?? "—").padStart(8)}  xmlPrice4=${String(p.xmlData?.xmlPrice4 ?? "—").padStart(8)}`);
  }

  // 2) wholesalePriceUsd dağılımı — aynı fiyatı paylaşan ürün var mı?
  console.log("\n\nwholesalePriceUsd dağılımı (top 10):");
  const top = await prisma.$queryRaw<Array<{ price: string; cnt: bigint }>>`
    SELECT "wholesalePriceUsd"::text as price, COUNT(*) as cnt
    FROM "Product"
    WHERE "isActive" = true AND "wholesalePriceUsd" IS NOT NULL
    GROUP BY "wholesalePriceUsd"
    ORDER BY cnt DESC
    LIMIT 10
  `;
  for (const r of top) {
    console.log(`  $${r.price.padEnd(10)} → ${r.cnt} ürün`);
  }

  // 3) 38.99 değerine sahip kaç ürün?
  const at38 = await prisma.product.count({
    where: { wholesalePriceUsd: 38.99 },
  });
  console.log(`\n38.99 USD'ye sahip ürün sayısı: ${at38}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
