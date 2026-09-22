/**
 * Trendyol Satış Kayıtlarında ProductId Eşleştirmesi
 *
 * TrendyolSalesRecord'lara yazarken productId'yi otomatik olarak bulmaya çalışır.
 *
 * Eşleştirme hiyerarşisi (yüksekten düşüğe):
 *   1. MarketplaceProductMapping (platform='TRENDYOL') barcode eşleşmesi → HIGH
 *   2. Product.sku = merchantSku (büyük/küçük harf duyarsız) → HIGH
 *   3. Product.sku = barkodun sonundaki fazladan tek hane atılmış hali → MEDIUM
 *
 * ⚠️ BELİRSİZ BARKOD EŞLEŞTİRİLMEZ. Bir barkod MarketplaceProductMapping'te
 * birden fazla FARKLI productId'ye bağlıysa hangisinin doğru olduğunu kod
 * bilemez; kayıt NULL bırakılır ve alt yöntemlere DE düşülmez. Rastgele birini
 * seçmek (findFirst) satışı yanlış ürüne yazar: ciro, stok ve kâr o üründe
 * şişer, diğerinde eksilir ve hata hiçbir yerde görünmez.
 * 22.09.2026 ölçümü: 1 barkod (14112021000001) 2 ayrı ürüne bağlı ve bu barkodu
 * taşıyan 245 satış kaydı var.
 *
 * Kullanım:
 *   const productId = await matchTrendyolProductId(merchantSku, barcode);
 */

import { prisma } from "./prisma";

/** Barkodun sonundaki fazladan tek haneyi kaldırır (2123401250160 → 212340125016) */
function trimBarcode(barcode: string): string {
  return barcode.length > 1 ? barcode.slice(0, -1) : barcode;
}

/** Bir barkoda bağlı FARKLI productId'ler. 0 = eşleşme yok, >1 = belirsiz. */
async function mappedProductIds(barcode: string): Promise<string[]> {
  const rows = await prisma.marketplaceProductMapping.findMany({
    where: { platform: "TRENDYOL", platformBarcode: barcode },
    select: { productId: true },
    distinct: ["productId"],
  });
  return rows.map((r) => r.productId);
}

/** Verilen SKU'ları büyük/küçük harf duyarsız arar; lowercase(sku) → productId */
async function productsBySku(skus: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = Array.from(new Set(skus));

  // Prisma `in` filtresi `mode: "insensitive"` DESTEKLEMEZ (sessizce yok sayılır),
  // bu yüzden OR + equals kullanılır. Sorgu şişmesin diye parçalara bölünür.
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200);
    const products = await prisma.product.findMany({
      where: {
        OR: chunk.map((sku) => ({
          sku: { equals: sku, mode: "insensitive" as const },
        })),
      },
      select: { id: true, sku: true },
    });
    for (const p of products) map.set(p.sku.toLowerCase(), p.id);
  }
  return map;
}

/**
 * Trendyol satış kaydı için productId'yi bulmaya çalışır
 *
 * @param merchantSku Trendyol merchant SKU
 * @param barcode Trendyol barcode
 * @returns Bulunan productId veya null
 */
export async function matchTrendyolProductId(
  merchantSku: string | null,
  barcode: string | null
): Promise<string | null> {
  // Yöntem 1: MarketplaceProductMapping (platform='TRENDYOL') barcode eşleşmesi
  if (barcode) {
    try {
      const ids = await mappedProductIds(barcode);

      // Belirsiz barkod: alt yöntemlere düşmeden NULL dön (yukarıdaki nota bak)
      if (ids.length > 1) {
        console.warn(
          `[trendyol-matching] Barkod ${barcode} ${ids.length} farklı ürüne bağlı — eşleştirme yapılmadı`
        );
        return null;
      }
      if (ids.length === 1) return ids[0];
    } catch (err) {
      console.error("[trendyol-matching] Yöntem 1 hatası:", err);
    }
  }

  // Yöntem 2: Product.sku = merchantSku (büyük/küçük harf duyarsız)
  if (merchantSku) {
    try {
      const product = await prisma.product.findFirst({
        where: { sku: { equals: merchantSku, mode: "insensitive" } },
        select: { id: true },
      });
      if (product) return product.id;
    } catch (err) {
      console.error("[trendyol-matching] Yöntem 2 hatası:", err);
    }
  }

  // Yöntem 3: Product.sku = barkodun sonundaki fazladan tek hane atılmış hali
  if (barcode) {
    try {
      const product = await prisma.product.findFirst({
        where: { sku: { equals: trimBarcode(barcode), mode: "insensitive" } },
        select: { id: true },
      });
      if (product) return product.id;
    } catch (err) {
      console.error("[trendyol-matching] Yöntem 3 hatası:", err);
    }
  }

  return null;
}

/**
 * Batch işlemler için optimized eşleştirme.
 * Tek tek çağırmakla AYNI kararları verir (belirsiz barkod dahil).
 *
 * @param records merchantSku ve barcode içeren kayıtlar
 * @returns id → productId map'i (eşleşmeyen kayıt map'te yer almaz)
 */
export async function matchTrendyolProductIdBatch(
  records: Array<{
    id: string;
    merchantSku: string | null;
    barcode: string | null;
  }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const barcodes = Array.from(
    new Set(records.map((r) => r.barcode).filter((b): b is string => !!b))
  );

  // Yöntem 1: barkod → FARKLI productId kümesi
  const byBarcode = new Map<string, Set<string>>();
  if (barcodes.length > 0) {
    const mappings = await prisma.marketplaceProductMapping.findMany({
      where: { platform: "TRENDYOL", platformBarcode: { in: barcodes } },
      select: { platformBarcode: true, productId: true },
    });
    for (const m of mappings) {
      if (!m.platformBarcode) continue;
      const set = byBarcode.get(m.platformBarcode) ?? new Set<string>();
      set.add(m.productId);
      byBarcode.set(m.platformBarcode, set);
    }
  }

  // Belirsiz barkodlar: hiçbir yöntemle eşleştirilmez
  const ambiguous = new Set<string>();
  for (const [barcode, ids] of byBarcode) {
    if (ids.size > 1) {
      ambiguous.add(barcode);
      console.warn(
        `[trendyol-matching] Barkod ${barcode} ${ids.size} farklı ürüne bağlı — eşleştirme yapılmadı`
      );
    }
  }

  const pending: typeof records = [];
  for (const r of records) {
    if (r.barcode && ambiguous.has(r.barcode)) continue; // NULL kalır
    const ids = r.barcode ? byBarcode.get(r.barcode) : undefined;
    if (ids && ids.size === 1) {
      result.set(r.id, ids.values().next().value!);
      continue;
    }
    pending.push(r);
  }

  // Yöntem 2: Product.sku = merchantSku
  const skuMap = await productsBySku(
    pending.map((r) => r.merchantSku).filter((s): s is string => !!s)
  );
  const pending2: typeof records = [];
  for (const r of pending) {
    const id = r.merchantSku ? skuMap.get(r.merchantSku.toLowerCase()) : undefined;
    if (id) result.set(r.id, id);
    else pending2.push(r);
  }

  // Yöntem 3: kırpılmış barkod
  const trimmedMap = await productsBySku(
    pending2.map((r) => r.barcode).filter((b): b is string => !!b).map(trimBarcode)
  );
  for (const r of pending2) {
    if (!r.barcode) continue;
    const id = trimmedMap.get(trimBarcode(r.barcode).toLowerCase());
    if (id) result.set(r.id, id);
  }

  return result;
}
