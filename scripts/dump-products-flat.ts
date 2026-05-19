import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: cs! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const cats = await prisma.productCategory.findMany({
    select: { id: true, name: true, slug: true, parentId: true, _count: { select: { products: true } } },
  });
  console.error("Existing categories:", cats.length);
  console.log("__CATEGORIES__");
  console.log(JSON.stringify(cats, null, 2));

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, brand: true, categoryId: true },
    orderBy: { name: "asc" },
  });
  console.log("__PRODUCTS__");
  for (const p of products) {
    console.log(`${p.id}\t${p.sku}\t${p.brand ?? ""}\t${p.categoryId ?? ""}\t${p.name}`);
  }
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
