/**
 * Backfill TrendyolSalesRecord.productId
 *
 * TrendyolSalesRecord'larından productId'si NULL olanları ürünlerle eşleştir.
 *
 * Eşleştirme hiyerarşisi:
 *   1. MarketplaceProductMapping (platform='TRENDYOL') barcode eşleşmesi
 *   2. Product.sku = merchantSku (büyük/küçük harf duyarsız)
 *   3. Product.sku = barkodun sonundaki fazladan tek hane atılmış hali
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/backfill-trendyol-productid.ts          # dry-run
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/backfill-trendyol-productid.ts --apply
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!cs) throw new Error("DATABASE_URL gerekli");

const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

interface MatchResult {
  recordId: string;
  merchantSku: string | null;
  barcode: string | null;
  matchedProductId: string | null;
  matchMethod: "mapping_barcode" | "sku_exact" | "barcode_trimmed" | "nomatch";
}

async function trimBarcode(barcode: string): Promise<string> {
  // Barkodun sonundaki fazladan tek hanayı kaldırır
  // Örn: 2123401250160 → 212340125016
  if (barcode.length > 1) {
    return barcode.slice(0, -1);
  }
  return barcode;
}

async function matchProductId(
  merchantSku: string | null,
  barcode: string | null
): Promise<{ productId: string | null; method: string }> {
  // Yöntem 1: MarketplaceProductMapping (platform='TRENDYOL') barcode eşleşmesi
  if (barcode) {
    const mapping = await prisma.marketplaceProductMapping.findFirst({
      where: {
        platform: "TRENDYOL",
        platformBarcode: barcode,
      },
      select: { productId: true },
    });

    if (mapping?.productId) {
      return { productId: mapping.productId, method: "mapping_barcode" };
    }
  }

  // Yöntem 2: Product.sku = merchantSku (büyük/küçük harf duyarsız)
  if (merchantSku) {
    const product = await prisma.product.findFirst({
      where: {
        sku: {
          equals: merchantSku,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (product?.id) {
      return { productId: product.id, method: "sku_exact" };
    }
  }

  // Yöntem 3: Product.sku = barkodun sonundaki fazladan tek hane atılmış hali
  if (barcode) {
    const trimmed = await trimBarcode(barcode);
    const product = await prisma.product.findFirst({
      where: {
        sku: {
          equals: trimmed,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (product?.id) {
      return { productId: product.id, method: "barcode_trimmed" };
    }
  }

  return { productId: null, method: "nomatch" };
}

async function main() {
  console.log(`\n📊 TrendyolSalesRecord productId backfill — ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log("─".repeat(70));

  // Adım 1: productId'si NULL olan satış kayıtlarını bul (en çok 10.000)
  const nullRecords = await prisma.trendyolSalesRecord.findMany({
    where: { productId: null },
    select: {
      id: true,
      merchantSku: true,
      barcode: true,
    },
    take: 10000,
  });

  if (nullRecords.length === 0) {
    console.log("✅ Tüm satış kayıtları zaten productId'ye sahip!");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n🔍 Toplamda ${nullRecords.length} kayıt eşleştirilecek...\n`);

  // Adım 2: Her kayıt için eşleştirme dene
  const results: MatchResult[] = [];
  const matched: { id: string; productId: string }[] = [];
  let processed = 0;

  for (const record of nullRecords) {
    const { productId, method } = await matchProductId(
      record.merchantSku,
      record.barcode
    );

    results.push({
      recordId: record.id,
      merchantSku: record.merchantSku,
      barcode: record.barcode,
      matchedProductId: productId,
      matchMethod: method as any,
    });

    if (productId) {
      matched.push({ id: record.id, productId });
    }

    processed++;
    if (processed % 500 === 0) {
      console.log(`  ${processed}/${nullRecords.length} işlendi...`);
    }
  }

  // Adım 3: Rapor
  console.log("\n📋 Eşleştirme Raporu:");
  console.log("─".repeat(70));

  const byMethod = new Map<string, number>();
  for (const r of results) {
    const count = byMethod.get(r.matchMethod) || 0;
    byMethod.set(r.matchMethod, count + 1);
  }

  for (const [method, count] of byMethod) {
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  ${method.padEnd(20)} → ${count.toString().padStart(5)} (${pct}%)`);
  }

  console.log("─".repeat(70));
  console.log(`  Toplam eşleştirilen: ${matched.length} / ${results.length}`);
  console.log(
    `  Eşleştirilemeyenler:  ${results.length - matched.length} / ${results.length}`
  );

  if (matched.length === 0) {
    console.log(
      "\n⚠️  Hiçbir kayıt eşleştirilemedi. Kontrol edin ve tekrar deneyin."
    );
    await prisma.$disconnect();
    return;
  }

  // Adım 4: İlk 10 eşleştirmeyi göster
  console.log("\n📌 İlk 10 eşleştirme örneği:");
  console.log("─".repeat(70));
  for (const r of results.slice(0, 10)) {
    if (r.matchedProductId) {
      console.log(
        `  SKU: ${(r.merchantSku || "—").padEnd(15)} | ` +
          `Barcode: ${(r.barcode || "—").padEnd(15)} | ` +
          `Yöntem: ${r.matchMethod.padEnd(20)} | ✓`
      );
    }
  }

  // Adım 5: Apply veya Dry-run sonucu
  if (APPLY) {
    console.log("\n💾 Veritabanına yazılıyor...");

    // Batch update (20 kayıt per batch)
    const batchSize = 20;
    for (let i = 0; i < matched.length; i += batchSize) {
      const batch = matched.slice(i, i + batchSize);
      await Promise.all(
        batch.map(({ id, productId }) =>
          prisma.trendyolSalesRecord.update({
            where: { id },
            data: { productId },
          })
        )
      );
      console.log(`  ${Math.min(i + batchSize, matched.length)} / ${matched.length} yazıldı`);
    }

    console.log(`\n✅ Başarılı! ${matched.length} kayıt güncellendi.`);
  } else {
    console.log(
      `\n🔄 Dry-run tamamlandı. Apply için şunu çalıştırın:\n` +
        `   npx tsx scripts/backfill-trendyol-productid.ts --apply\n`
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Hata:", err);
  process.exit(1);
});
