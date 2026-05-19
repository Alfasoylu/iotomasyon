/**
 * Verify: count products per category from DB.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: cs! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const cats = await prisma.productCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  let total = 0;
  console.log("\n═══ Kategori bazlı ürün dağılımı ═══");
  for (const c of cats) {
    console.log(`  ${c._count.products.toString().padStart(5)} | ${c.name}`);
    total += c._count.products;
  }
  console.log(`  ${total.toString().padStart(5)} | TOPLAM (kategoriye atanmış)`);

  const orphan = await prisma.product.count({ where: { isActive: true, categoryId: null } });
  const inactiveCount = await prisma.product.count({ where: { isActive: false } });
  console.log(`\n  Aktif ama kategorisiz: ${orphan}`);
  console.log(`  Pasif ürün: ${inactiveCount}`);

  // Sample 3 products per category for spot-check
  console.log("\n═══ Her kategoriden 3 örnek ürün ═══");
  for (const c of cats) {
    const samples = await prisma.product.findMany({
      where: { categoryId: c.id, isActive: true },
      select: { name: true, brand: true },
      take: 3,
    });
    console.log(`\n▸ ${c.name}`);
    for (const s of samples) console.log(`    [${s.brand ?? "?"}] ${s.name}`);
  }
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
