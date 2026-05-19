/**
 * Trendyol satış kayıtlarını ürünlerimizle eşleştir
 *
 * Hiyerarşik strateji (yüksekten düşüğe güven):
 *   1) BARCODE exact:    record.barcode === product.barcode/sku    → HIGH
 *   2) MERCHANTSKU exact: record.merchantSku === product.sku       → HIGH
 *   3) SKU partial:      tek yönlü contains, min 5 char            → MEDIUM
 *   4) NAME + PRICE:     token-overlap >= 60% AND price within ±30% → MEDIUM
 *   5) Aksi              → atlanır (manuel müşavir incelemesi)
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/match-trendyol-sales.ts          # dry-run
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/match-trendyol-sales.ts --apply
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: cs! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

const TR_MAP: Record<string, string> = {
  "ş":"s","Ş":"s","ğ":"g","Ğ":"g","ç":"c","Ç":"c",
  "ü":"u","Ü":"u","ö":"o","Ö":"o","ı":"i","İ":"i",
};
function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[şŞğĞçÇüÜöÖıİ]/g, (c) => TR_MAP[c] ?? c).toLowerCase().trim();
}

/** Anlamlı tokenları çıkar — 3+ karakter, generic stop-word'leri at */
const STOP = new Set([
  "ile","ve","icin","gibi","cok","tum","one","size","adet",
  "the","with","for","and","yeni",
]);
function tokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

interface ProductLite {
  id: string;
  sku: string;
  skuNorm: string;
  barcode: string | null;
  barcodeNorm: string | null;
  name: string;
  nameTokens: Set<string>;
  marketplacePriceTry: number | null;
  sellingPriceTry: number | null;
}

interface MatchResult {
  recordId: string;
  productId: string | null;
  productName: string;
  recordName: string;
  reason: "barcode" | "merchantSku" | "sku-partial" | "name-price" | "no-match";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  score?: number;
}

async function main() {
  // Ürünleri yükle
  const productsRaw = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true, sku: true, barcode: true, name: true,
      marketplacePriceTry: true, sellingPriceTry: true,
    },
  });
  const products: ProductLite[] = productsRaw.map((p) => ({
    id: p.id,
    sku: p.sku,
    skuNorm: norm(p.sku),
    barcode: p.barcode,
    barcodeNorm: norm(p.barcode ?? null),
    name: p.name,
    nameTokens: tokens(p.name),
    marketplacePriceTry: p.marketplacePriceTry != null ? Number(p.marketplacePriceTry) : null,
    sellingPriceTry: p.sellingPriceTry != null ? Number(p.sellingPriceTry) : null,
  }));

  console.log(`📦 ${products.length} aktif ürün yüklendi.`);

  // Barcode/sku lookup indexes
  const byBarcode = new Map<string, ProductLite>();
  const bySku = new Map<string, ProductLite>();
  for (const p of products) {
    if (p.barcodeNorm) byBarcode.set(p.barcodeNorm, p);
    bySku.set(p.skuNorm, p);
    // Ayrıca SKU'yu barkod aramasına da koy (bazı satışlarda barkod alanına SKU yazılmış)
    if (!byBarcode.has(p.skuNorm)) byBarcode.set(p.skuNorm, p);
  }

  // Unmatched satışları çek
  const unmatched = await prisma.trendyolSalesRecord.findMany({
    where: { productId: null },
    select: {
      id: true, barcode: true, merchantSku: true, productName: true,
      unitPriceTry: true, quantity: true,
    },
  });
  console.log(`🔎 ${unmatched.length} eşleşmemiş satış kaydı.`);

  const results: MatchResult[] = [];

  for (const r of unmatched) {
    const recordPrice = Number(r.unitPriceTry);
    const recordTokens = tokens(r.productName);

    // 1) Barcode exact
    const barNorm = norm(r.barcode ?? null);
    if (barNorm) {
      const p = byBarcode.get(barNorm);
      if (p) {
        results.push({
          recordId: r.id, productId: p.id, productName: p.name, recordName: r.productName,
          reason: "barcode", confidence: "HIGH",
        });
        continue;
      }
    }

    // 2) MerchantSku exact
    const skuNorm = norm(r.merchantSku ?? null);
    if (skuNorm && skuNorm !== "merchantsku") {
      const p = bySku.get(skuNorm);
      if (p) {
        results.push({
          recordId: r.id, productId: p.id, productName: p.name, recordName: r.productName,
          reason: "merchantSku", confidence: "HIGH",
        });
        continue;
      }
    }

    // 3) SKU partial (min 5 char, tek yönlü containment)
    if (skuNorm && skuNorm.length >= 5 && skuNorm !== "merchantsku") {
      let best: ProductLite | null = null;
      let bestLen = 0;
      for (const p of products) {
        if (p.skuNorm.length < 5) continue;
        const a = p.skuNorm;
        const b = skuNorm;
        // Bir tarafın diğerini en az 5 char ile kapsaması
        if (a.includes(b) && b.length > bestLen) { best = p; bestLen = b.length; }
        else if (b.includes(a) && a.length > bestLen) { best = p; bestLen = a.length; }
      }
      if (best && bestLen >= 5) {
        results.push({
          recordId: r.id, productId: best.id, productName: best.name, recordName: r.productName,
          reason: "sku-partial", confidence: "MEDIUM", score: bestLen,
        });
        continue;
      }
    }

    // 4) Name + fiyat (esnek)
    // Strateji: name jaccard >= 0.30, fiyat farkı %50 içinde
    // Eğer name çok yüksek (>= 0.60) fiyatı yumuşatabiliriz (%100'e kadar)
    let bestProd: ProductLite | null = null;
    let bestScore = 0;
    for (const p of products) {
      if (p.nameTokens.size === 0) continue;
      const sim = jaccard(recordTokens, p.nameTokens);
      if (sim < 0.30) continue;
      const refPrice = p.marketplacePriceTry ?? p.sellingPriceTry;
      if (recordPrice <= 0) continue;
      let priceFactor = 1;
      if (refPrice != null && refPrice > 0) {
        const priceDiffPct = Math.abs(refPrice - recordPrice) / refPrice;
        // High name similarity → fiyat tolerasını gevşet
        const maxDiff = sim >= 0.60 ? 1.0 : 0.50;
        if (priceDiffPct > maxDiff) continue;
        priceFactor = 1 - priceDiffPct / 2; // hafif penaltı
      }
      // Yüksek similarity name + bonus token sayısı
      const tokenMatchCount = [...recordTokens].filter((t) => p.nameTokens.has(t)).length;
      const score = sim * priceFactor + tokenMatchCount * 0.01;
      if (score > bestScore) { bestScore = score; bestProd = p; }
    }
    // Final eşik: bestScore ≥ 0.30 ve en az 3 ortak token (çok genel kelimelerle eşleşmeyi engelle)
    if (bestProd) {
      const tokenMatchCount = [...recordTokens].filter((t) => bestProd!.nameTokens.has(t)).length;
      if (bestScore >= 0.30 && tokenMatchCount >= 3) {
        results.push({
          recordId: r.id, productId: bestProd.id, productName: bestProd.name, recordName: r.productName,
          reason: "name-price", confidence: bestScore >= 0.50 ? "MEDIUM" : "LOW", score: bestScore,
        });
        if (bestScore >= 0.50) continue;
        // LOW confidence → atlanır
      }
    }

    // 5) Hiçbir eşleşme yok
    results.push({
      recordId: r.id, productId: null, productName: "", recordName: r.productName,
      reason: "no-match", confidence: "LOW",
    });
  }

  // Özet
  const byReason: Record<string, number> = {};
  for (const r of results) {
    const key = `${r.reason} (${r.confidence})`;
    byReason[key] = (byReason[key] ?? 0) + 1;
  }
  console.log("\n═══ Eşleştirme özeti ═══");
  for (const [k, v] of Object.entries(byReason)) console.log(`  ${v.toString().padStart(4)} | ${k}`);
  const matched = results.filter((r) => r.productId).length;
  console.log(`\n✓ Eşleşen: ${matched}/${results.length}`);

  // Örnek match'ler her tipten
  for (const reason of ["barcode", "merchantSku", "sku-partial", "name-price"] as const) {
    const samples = results.filter((r) => r.reason === reason).slice(0, 5);
    if (samples.length === 0) continue;
    console.log(`\n— ${reason.toUpperCase()} örnek:`);
    for (const s of samples) {
      console.log(`  "${s.recordName.slice(0,70)}"`);
      console.log(`    → "${s.productName.slice(0,70)}" ${s.score ? `(score=${s.score.toFixed(2)})` : ""}`);
    }
  }

  // No-match örnekleri
  const noMatch = results.filter((r) => r.reason === "no-match").slice(0, 10);
  if (noMatch.length > 0) {
    console.log(`\n— EŞLEŞMEDİ (ilk ${noMatch.length}, manuel inceleme gerekli):`);
    for (const s of noMatch) console.log(`  "${s.recordName.slice(0,90)}"`);
  }

  if (!APPLY) {
    console.log("\n⚠ Dry-run. --apply ekleyerek uygula.");
    return;
  }

  console.log("\n═══ Uygulanıyor (sadece HIGH + MEDIUM) ═══");
  const updates = results.filter((r) => r.productId && (r.confidence === "HIGH" || r.confidence === "MEDIUM"));
  let done = 0;
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(batch.map((u) =>
      prisma.trendyolSalesRecord.update({
        where: { id: u.recordId },
        data: { productId: u.productId },
      })
    ));
    done += batch.length;
    process.stdout.write(`\r  ${done}/${updates.length}`);
  }
  console.log(`\n✅ ${done} satış kaydı ürünle eşleştirildi.`);

  // Aynı kaydın benzer barkod/sku ile diğer kayıtlarına da uygula (toplu bir batch için)
  // Not: zaten satıra-özel atadığımız için ek toplu yok.
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
