import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv();
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const total = await prisma.marketplaceSalesRecord.count();
  const linked = await prisma.marketplaceSalesRecord.count({ where: { productId: { not: null } } });

  console.log(`Toplam MarketplaceSalesRecord: ${total.toLocaleString("tr-TR")}`);
  console.log(`Ürünle eşleşen              : ${linked.toLocaleString("tr-TR")} (${((linked / total) * 100).toFixed(1)}%)`);

  console.log("\nKanal başına (top 15):");
  const byChannel = await prisma.marketplaceSalesRecord.groupBy({
    by: ["channel"],
    _count: true,
    orderBy: { _count: { channel: "desc" } },
    take: 15,
  });
  for (const row of byChannel) {
    console.log(`  ${row.channel.padEnd(20)} ${row._count.toLocaleString("tr-TR")}`);
  }

  console.log("\nYıl başına satış:");
  // Prisma'da yıl groupBy yok — raw SQL
  const byYear = await prisma.$queryRaw<Array<{ yr: string; cnt: bigint; total: string | null }>>`
    SELECT
      EXTRACT(YEAR FROM "orderDate")::text AS yr,
      COUNT(*) AS cnt,
      SUM("totalAmountTry")::text AS total
    FROM "MarketplaceSalesRecord"
    GROUP BY EXTRACT(YEAR FROM "orderDate")
    ORDER BY yr DESC
  `;
  for (const row of byYear) {
    const totalNum = row.total ? Number(row.total) : 0;
    const totalFmt = totalNum.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
    console.log(`  ${row.yr}  ${row.cnt.toString().padStart(8)} sipariş  ₺${totalFmt}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
