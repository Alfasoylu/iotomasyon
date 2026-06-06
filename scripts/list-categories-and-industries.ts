import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv();
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  console.log("── Kategoriler (ProductCategory, parent=null) ──");
  const cats = await prisma.productCategory.findMany({
    where: { parentId: null },
    select: { slug: true, name: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
  for (const c of cats) {
    console.log(`  ${c.slug.padEnd(40)} ${c.name.padEnd(40)} ${c._count.products} ürün`);
  }

  console.log("\n── Endüstriler (Industry) ──");
  const inds = await prisma.industry.findMany({
    select: { slug: true, name: true, _count: { select: { customers: true } } },
    orderBy: { name: "asc" },
  });
  for (const i of inds) {
    console.log(`  ${i.slug.padEnd(40)} ${i.name.padEnd(40)} ${i._count.customers} müşteri`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
