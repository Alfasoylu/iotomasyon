/**
 * 1) Eski boş kategorileri sil
 * 2) 3 minor yanlış sınıflandırmayı düzelt
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: cs! });
const prisma = new PrismaClient({ adapter });

const OLD_EMPTY_SLUGS = [
  "metal-dedektoru-eski", // placeholder, will resolve via name
];

// Old categories to delete (by name match, since their slugs may collide)
const OLD_NAMES = [
  "METAL DEDEKTÖRÜ", // 1 product was here (Anunnaki Pointer) but now moved
  "Telsiz",
  "Güvenlik Sistemleri",
  "Kamera Sistemleri",
  "IP Kamera",
  "Kamera Kayıt Cihazı",
  "AHD Kamera",
];

// Manual fixes: SKU pattern → target slug
const FIXES = [
  {
    matcher: { name: { contains: "Joystick Potansiyometre 3 Eksen 5K" } },
    targetSlug: "elektronik-modul-gelistirme",
    label: "Joystick Potansiyometre 3 Eksen 5K → Elektronik Modül",
  },
  {
    matcher: { name: { contains: "Makey Makey" } },
    targetSlug: "ev-esyasi-kirtasiye-dekoratif",
    label: "Makey Makey Deluxe Kit → Ev Eşyası, Kırtasiye & Dekoratif",
  },
  {
    matcher: { name: { contains: "MX3 Air Mouse" } },
    targetSlug: "bilgisayar-cevre-baglanti",
    label: "MX3 Air Mouse → Bilgisayar Çevre Birimi",
  },
];

async function main() {
  // ── Fix misclassifications
  console.log("═══ Yanlış sınıflandırmalar düzeltiliyor ═══");
  for (const fix of FIXES) {
    const target = await prisma.productCategory.findUnique({ where: { slug: fix.targetSlug } });
    if (!target) {
      console.log(`  ✗ Hedef kategori bulunamadı: ${fix.targetSlug}`);
      continue;
    }
    // Find matching products
    const matches = await prisma.product.findMany({
      where: { ...fix.matcher, isActive: true },
      select: { id: true, name: true, productCategory: { select: { name: true } } },
    });
    if (matches.length === 0) {
      console.log(`  - Eşleşen ürün yok: ${fix.label}`);
      continue;
    }
    const ids = matches.map((m) => m.id);
    await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { categoryId: target.id },
    });
    console.log(`  ✓ ${fix.label} (${matches.length} ürün)`);
    for (const m of matches) {
      console.log(`      [${m.productCategory?.name ?? "?"}] ${m.name}`);
    }
  }

  // ── Delete old empty categories
  console.log("\n═══ Eski boş kategoriler siliniyor ═══");
  for (const name of OLD_NAMES) {
    const cat = await prisma.productCategory.findFirst({
      where: { name },
      include: {
        _count: { select: { products: true, children: true } },
      },
    });
    if (!cat) {
      console.log(`  - Yok: "${name}"`);
      continue;
    }
    if (cat._count.products > 0) {
      console.log(`  ✗ "${name}" silinmiyor — ${cat._count.products} ürün bağlı!`);
      continue;
    }
    // Set children's parentId to null first (SetNull is configured but be explicit)
    if (cat._count.children > 0) {
      await prisma.productCategory.updateMany({
        where: { parentId: cat.id },
        data: { parentId: null },
      });
      console.log(`    ${cat._count.children} alt kategori parent=null yapıldı`);
    }
    await prisma.productCategory.delete({ where: { id: cat.id } });
    console.log(`  ✓ Silindi: "${name}" (slug: ${cat.slug})`);
  }

  // ── Final summary
  console.log("\n═══ Güncel kategori listesi ═══");
  const cats = await prisma.productCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  for (const c of cats) {
    console.log(`  ${c._count.products.toString().padStart(5)} | ${c.name}`);
  }
  console.log(`\n  Toplam kategori: ${cats.length}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
