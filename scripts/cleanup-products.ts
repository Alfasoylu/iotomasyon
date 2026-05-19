/**
 * Veri temizliği:
 * 1) Marka normalizasyonu — yüksek güven dupe'lar
 * 2) Placeholder ürünleri deactivate et (sadece numara olan boş kayıtlar)
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/cleanup-products.ts            # dry-run
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/cleanup-products.ts --apply
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: cs! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

// Yüksek güven brand normalizasyon (case/typo) — sadece kesin olanlar
const BRAND_MAP: Record<string, string> = {
  "Annunnaki": "Anunnaki",       // typo (2 ürün)
  "ANUNNAKI": "Anunnaki",         // caps
  "ALFA": "Alfa",                  // caps
  "A Alfa": "Alfa",                // typo with space
  "Alfas": "ALFAS",                // case mismatch
  "Soylu elektronik": "SOYLU ELEKTRONİK",  // case mismatch
  "ARMİNE": "Armine",              // caps
};

// Bilinçli olarak skip:
// - BAOFENG vs Boafeng (muhtemelen farklı markalar)
// - Armine Trend (alt-marka)
// - Alfa Soylu (alt-marka/sahip adı)
// - Diğer (meta marka)
// - Tek üründe görünen tüm diğer markalar

async function main() {
  // ── 1) Marka normalizasyonu ─────────────────────────────────────────────
  console.log("\n═══ Marka normalizasyonu ═══");
  let totalRenamed = 0;
  for (const [from, to] of Object.entries(BRAND_MAP)) {
    const count = await prisma.product.count({ where: { brand: from } });
    if (count === 0) {
      console.log(`  - "${from}" bulunamadı, atla`);
      continue;
    }
    if (APPLY) {
      const result = await prisma.product.updateMany({
        where: { brand: from },
        data: { brand: to },
      });
      console.log(`  ✓ "${from}" → "${to}" (${result.count} ürün)`);
      totalRenamed += result.count;
    } else {
      console.log(`  [DRY] "${from}" → "${to}" (${count} ürün)`);
      totalRenamed += count;
    }
  }

  // ── 2) Placeholder ürünleri deactivate et ───────────────────────────────
  console.log("\n═══ Placeholder ürünler (sadece numaradan ibaret) ═══");
  // Adı tamamen sayıdan oluşan ürünler (^[0-9]{4,6}$ gibi)
  const placeholders = await prisma.product.findMany({
    where: {
      isActive: true,
      AND: [
        { name: { not: "" } },
        // Postgres regex: ^[0-9]+$
        { name: { not: { contains: " " } } },
      ],
    },
    select: { id: true, name: true, sku: true, brand: true },
  });
  const numericOnly = placeholders.filter((p) => /^\d{4,8}$/.test(p.name));

  console.log(`  ${numericOnly.length} placeholder bulundu:`);
  for (const p of numericOnly) {
    console.log(`    [${p.sku ?? "?"}] name="${p.name}" brand="${p.brand ?? ""}"`);
  }

  if (APPLY && numericOnly.length > 0) {
    const result = await prisma.product.updateMany({
      where: { id: { in: numericOnly.map((p) => p.id) } },
      data: { isActive: false },
    });
    console.log(`  ✓ ${result.count} placeholder ürün deactivate edildi (isActive=false)`);
  } else if (!APPLY) {
    console.log(`  [DRY] ${numericOnly.length} ürün deactivate edilecek`);
  }

  // ── 3) Özet ──────────────────────────────────────────────────────────────
  console.log("\n═══ Özet ═══");
  if (APPLY) {
    const totalActive = await prisma.product.count({ where: { isActive: true } });
    const totalInactive = await prisma.product.count({ where: { isActive: false } });
    console.log(`  Aktif ürün: ${totalActive}`);
    console.log(`  Pasif ürün: ${totalInactive}`);

    // Güncel brand dağılımı
    const brands = await prisma.product.groupBy({
      by: ["brand"],
      _count: true,
      where: { isActive: true },
      orderBy: { _count: { brand: "desc" } },
    });
    console.log(`  Distinct brand (aktif): ${brands.length}`);
    console.log(`  ${totalRenamed} ürünün markası normalize edildi`);
  } else {
    console.log(`  Dry-run. --apply ekleyerek uygula.`);
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
