import "server-only";

import type { Prisma } from "@prisma/client";

import type { CatalogPriceMode } from "./catalog-mapping";

/**
 * Katalog fiyat çözümleme — XML fallback ile.
 *
 * Mantık (öncelik sırası):
 *   - "wholesale" (bayi):
 *       1. Product.wholesalePriceUsd (elle override edilmiş manuel fiyat)
 *       2. XmlProductData.xmlBayiPrice (XML'den gelen toptan bayi fiyatı)
 *       3. null (fiyat yok)
 *
 *   - "retail" (perakende):
 *       1. Product.retailPriceUsd (elle override)
 *       2. XmlProductData.xmlPrice4 (XML'den gelen website public fiyatı)
 *       3. null
 *
 *   - "hidden":
 *       Her zaman null (fiyat gösterilmez)
 *
 * Bu fallback sayesinde:
 *   - Yeni XML ürünleri katalogda otomatik görünür (manuel backfill gerekmez)
 *   - Elle düzenlediğin fiyatlar XML sync'te ezilmez
 *   - "XML'i tekrar takip et" istersen wholesalePriceUsd/retailPriceUsd'i
 *     null'a çekersin (admin UI'da "Temizle" butonu)
 */

export interface CatalogPriceCandidate {
  wholesalePriceUsd: Prisma.Decimal | null;
  retailPriceUsd: Prisma.Decimal | null;
  xmlData: {
    xmlBayiPrice: Prisma.Decimal | null;
    xmlPrice4: Prisma.Decimal | null;
  } | null;
}

export function resolveCatalogPrice(
  product: CatalogPriceCandidate,
  mode: CatalogPriceMode,
): number | null {
  if (mode === "hidden") return null;

  if (mode === "wholesale") {
    if (product.wholesalePriceUsd != null) {
      return Number(product.wholesalePriceUsd);
    }
    const xmlBayi = product.xmlData?.xmlBayiPrice;
    return xmlBayi != null ? Number(xmlBayi) : null;
  }

  // retail
  if (product.retailPriceUsd != null) {
    return Number(product.retailPriceUsd);
  }
  const xmlPrice4 = product.xmlData?.xmlPrice4;
  return xmlPrice4 != null ? Number(xmlPrice4) : null;
}

/**
 * Prisma `where` clause: priceMode'a göre fiyatı olan ürünleri filtrele.
 *
 * Bayi modu için: wholesalePriceUsd dolu VEYA xmlData.xmlBayiPrice dolu
 * Perakende modu için: retailPriceUsd dolu VEYA xmlData.xmlPrice4 dolu
 * Hidden modu için: filtre yok (fiyat gösterilmediği için tümü gösterilir)
 */
export function catalogPriceFilter(
  mode: CatalogPriceMode,
): Prisma.ProductWhereInput | null {
  if (mode === "hidden") return null;

  if (mode === "wholesale") {
    return {
      OR: [
        { wholesalePriceUsd: { not: null } },
        { xmlData: { is: { xmlBayiPrice: { not: null } } } },
      ],
    };
  }

  // retail
  return {
    OR: [
      { retailPriceUsd: { not: null } },
      { xmlData: { is: { xmlPrice4: { not: null } } } },
    ],
  };
}

/**
 * Prisma `select` clause: catalog ürün listesi için minimum alan seti.
 * Hem manuel hem XML fiyatları çeker ki resolveCatalogPrice fallback yapabilsin.
 */
export const CATALOG_PRICE_SELECT = {
  wholesalePriceUsd: true,
  retailPriceUsd: true,
  xmlData: {
    select: {
      xmlBayiPrice: true,
      xmlPrice4: true,
    },
  },
} as const satisfies Prisma.ProductSelect;
