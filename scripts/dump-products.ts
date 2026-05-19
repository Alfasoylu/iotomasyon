/**
 * Dump all products (XML-imported + manually added) to JSON for classification.
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/dump-products.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or DIRECT_URL env required");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      category: true,
      xmlImported: true,
      productKind: true,
    },
    orderBy: [{ xmlImported: "desc" }, { name: "asc" }],
  });

  const xml = products.filter((p) => p.xmlImported);
  const manual = products.filter((p) => !p.xmlImported);

  console.error(`Total: ${products.length} | XML: ${xml.length} | Manual: ${manual.length}`);
  console.log(JSON.stringify(products, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
