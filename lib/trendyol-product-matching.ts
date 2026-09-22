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
 * Kullanım:
 *   const productId = await matchTrendyolProductId(merchantSku, barcode);
 */

import { prisma } from "./prisma";

async function trimBarcode(barcode: string): Promise<string> {
  // Barkodun sonundaki tek hanayı kaldırır
  // Örn: 2123401250160 → 212340125016
  if (barcode.length > 1) {
    return barcode.slice(0, -1);
  }
  return barcode;
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
      const mapping = await prisma.marketplaceProductMapping.findFirst({
        where: {
          platform: "TRENDYOL",
          platformBarcode: barcode,
        },
        select: { productId: true },
      });

      if (mapping?.productId) {
        return mapping.productId;
      }
    } catch (err) {
      console.error("[trendyol-matching] Yöntem 1 hatası:", err);
    }
  }

  // Yöntem 2: Product.sku = merchantSku (büyük/küçük harf duyarsız)
  if (merchantSku) {
    try {
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
        return product.id;
      }
    } catch (err) {
      console.error("[trendyol-matching] Yöntem 2 hatası:", err);
    }
  }

  // Yöntem 3: Product.sku = barkodun sonundaki fazladan tek hane atılmış hali
  if (barcode) {
    try {
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
        return product.id;
      }
    } catch (err) {
      console.error("[trendyol-matching] Yöntem 3 hatası:", err);
    }
  }

  // Eşleştirme bulunamadı
  return null;
}

/**
 * Batch işlemler için optimized eşleştirme
 *
 * @param records merchantSku ve barcode içeren kayıtlar
 * @returns id → productId map'i
 */
export async function matchTrendyolProductIdBatch(
  records: Array<{
    id: string;
    merchantSku: string | null;
    barcode: string | null;
  }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  // Tüm barcode'ları topla
  const barcodes = new Set(records.map((r) => r.barcode).filter(Boolean) as string[]);
  const merchantSkus = new Set(records.map((r) => r.merchantSku).filter(Boolean) as string[]);

  if (barcodes.size === 0 && merchantSkus.size === 0) {
    return result;
  }

  // Yöntem 1: Tüm mapping'leri bir sorguda getir
  if (barcodes.size > 0) {
    const mappings = await prisma.marketplaceProductMapping.findMany({
      where: {
        platform: "TRENDYOL",
        platformBarcode: {
          in: Array.from(barcodes),
        },
      },
      select: { platformBarcode: true, productId: true },
    });

    const mappingMap = new Map(mappings.map((m) => [m.platformBarcode, m.productId]));

    for (const record of records) {
      if (record.barcode && mappingMap.has(record.barcode)) {
        result.set(record.id, mappingMap.get(record.barcode)!);
        continue;
      }
    }
  }

  // Yöntem 2: SKU'lar için ürünleri topla (henüz eşleştirilmemiş olanlar)
  const unmatched = records.filter((r) => !result.has(r.id) && r.merchantSku);
  if (unmatched.length > 0) {
    const products = await prisma.product.findMany({
      where: {
        sku: {
          in: unmatched.map((r) => r.merchantSku!),
          mode: "insensitive",
        },
      },
      select: { id: true, sku: true },
    });

    const skuMap = new Map(products.map((p) => [p.sku.toLowerCase(), p.id]));

    for (const record of unmatched) {
      if (record.merchantSku) {
        const productId = skuMap.get(record.merchantSku.toLowerCase());
        if (productId) {
          result.set(record.id, productId);
        }
      }
    }
  }

  // Yöntem 3: Kırpılmış barkodlar (henüz eşleştirilmemiş olanlar)
  const unmatched2 = records.filter((r) => !result.has(r.id) && r.barcode);
  if (unmatched2.length > 0) {
    const trimmedBarcodes = new Map(
      await Promise.all(
        unmatched2.map(async (r) => [r.id, await trimBarcode(r.barcode!)])
      )
    );

    const products = await prisma.product.findMany({
      where: {
        sku: {
          in: Array.from(trimmedBarcodes.values()),
          mode: "insensitive",
        },
      },
      select: { id: true, sku: true },
    });

    const skuMap = new Map(products.map((p) => [p.sku.toLowerCase(), p.id]));

    for (const record of unmatched2) {
      const trimmed = trimmedBarcodes.get(record.id);
      if (trimmed) {
        const productId = skuMap.get(trimmed.toLowerCase());
        if (productId) {
          result.set(record.id, productId);
        }
      }
    }
  }

  return result;
}
