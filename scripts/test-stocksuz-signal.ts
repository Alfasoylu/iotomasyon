/**
 * Stoksuz · AL sinyalinin gerçek prod verisinde test/sanity check.
 *
 * Çalıştırma:
 *   npx tsx scripts/test-stocksuz-signal.ts
 *
 * Görür:
 *   1. stoğu=0 + lifetimeQty>0 ürün sayısı (potansiyel STOKSUZ_AL adayları)
 *   2. İlk 10 örnek + hesaplamalar
 *   3. Toplam tahmin
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv();
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const now = new Date();

  console.log("══════════════════════════════════════════════════════════════");
  console.log("STOKSUZ · AL sanity check — gerçek prod verisi");
  console.log("══════════════════════════════════════════════════════════════\n");

  // 1) Stoğu 0 olan ürünleri çek
  const zeroStockProducts = await prisma.product.findMany({
    where: { isActive: true, stockQuantity: 0 },
    select: { id: true, name: true, sku: true, importUnitCostUsd: true, unitCostUsd: true },
  });
  console.log(`1) Stoğu 0 aktif ürün                   : ${zeroStockProducts.length}`);

  // 2) Lifetime sales
  const productIds = zeroStockProducts.map((p) => p.id);
  const lifetime = await prisma.marketplaceSalesRecord.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _sum: { quantity: true },
    _min: { orderDate: true },
  });
  const lifetimeMap = new Map<string, { qty: number; firstDate: Date | null }>();
  for (const r of lifetime) {
    if (!r.productId) continue;
    lifetimeMap.set(r.productId, {
      qty: r._sum.quantity ?? 0,
      firstDate: r._min.orderDate,
    });
  }

  const stocksuzSatisli = zeroStockProducts.filter((p) => (lifetimeMap.get(p.id)?.qty ?? 0) > 0);
  console.log(`2) Stoğu 0 + lifetime satışlı           : ${stocksuzSatisli.length}`);
  console.log(`   (Yeni signal logic ile hepsi STOKSUZ_AL alacak)\n`);

  // 3) Maliyet/fiyat coverage
  const withCost = stocksuzSatisli.filter(
    (p) => p.importUnitCostUsd != null || p.unitCostUsd != null,
  );
  console.log(`   ├─ Maliyet bilinen                  : ${withCost.length}`);
  console.log(`   └─ Maliyet boş (recommendedQty hesabı historical ile)  : ${stocksuzSatisli.length - withCost.length}\n`);

  // 4) İlk 10 örnek + recommendedQty
  console.log("══════════════════════════════════════════════════════════════");
  console.log("Top 10 STOKSUZ · AL adayı (en çok satılmıştan az'a)");
  console.log("══════════════════════════════════════════════════════════════");
  const sorted = stocksuzSatisli
    .map((p) => {
      const info = lifetimeMap.get(p.id)!;
      const monthsElapsed = info.firstDate
        ? Math.max(
            1,
            (now.getFullYear() - info.firstDate.getFullYear()) * 12 +
              (now.getMonth() - info.firstDate.getMonth()) +
              1,
          )
        : 12;
      const monthlyAvg = info.qty / monthsElapsed;
      const recommendedQty = Math.max(5, Math.ceil(monthlyAvg * 3));
      const hasCost = p.importUnitCostUsd != null || p.unitCostUsd != null;
      return {
        sku: p.sku,
        name: p.name,
        lifetimeQty: info.qty,
        monthsElapsed,
        monthlyAvg: monthlyAvg.toFixed(2),
        recommendedQty,
        hasCost,
      };
    })
    .sort((a, b) => b.lifetimeQty - a.lifetimeQty)
    .slice(0, 10);

  console.log("\nSKU".padEnd(20) + "LIFETIME".padStart(10) + "AKTİF AY".padStart(10) + "AYLIK".padStart(10) + "ÖNERİ".padStart(8) + "  MALIYET");
  console.log("─".repeat(78));
  for (const r of sorted) {
    console.log(
      (r.sku ?? "—").substring(0, 18).padEnd(20) +
        String(r.lifetimeQty).padStart(10) +
        String(r.monthsElapsed).padStart(10) +
        String(r.monthlyAvg).padStart(10) +
        String(r.recommendedQty).padStart(8) +
        "  " + (r.hasCost ? "✓" : "—"),
    );
  }

  // 5) recommendedQty dağılımı
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("recommendedQty histogram (önerilen sipariş adetleri)");
  console.log("══════════════════════════════════════════════════════════════");
  const allRecs = stocksuzSatisli.map((p) => {
    const info = lifetimeMap.get(p.id)!;
    const monthsElapsed = info.firstDate
      ? Math.max(
          1,
          (now.getFullYear() - info.firstDate.getFullYear()) * 12 +
            (now.getMonth() - info.firstDate.getMonth()) +
            1,
        )
      : 12;
    const monthlyAvg = info.qty / monthsElapsed;
    return Math.max(5, Math.ceil(monthlyAvg * 3));
  });
  const buckets = { "5":  0, "6-10": 0, "11-25": 0, "26-50": 0, "51-100": 0, "100+": 0 };
  for (const q of allRecs) {
    if (q === 5) buckets["5"]++;
    else if (q <= 10) buckets["6-10"]++;
    else if (q <= 25) buckets["11-25"]++;
    else if (q <= 50) buckets["26-50"]++;
    else if (q <= 100) buckets["51-100"]++;
    else buckets["100+"]++;
  }
  for (const [k, v] of Object.entries(buckets)) {
    const bar = "█".repeat(Math.min(50, Math.round(v / 5)));
    console.log(`${k.padEnd(10)} ${String(v).padStart(4)} ${bar}`);
  }

  const totalRecQty = allRecs.reduce((s, q) => s + q, 0);
  console.log(`\n► Toplam önerilen sipariş adedi (tüm stoksuz acillerin toplamı): ${totalRecQty}`);
  console.log(`► PO oluştur butonu artık ${stocksuzSatisli.length} ürünü dahil edecek.`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
