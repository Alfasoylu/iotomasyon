import "server-only";

import { prisma } from "@/lib/prisma";
import { calcImportCost, calcRevenue, calcProfit } from "@/lib/importer-cost";
import { getCurrentFx } from "@/lib/fx/current";
import { forecastMonthlySales, buildMonthlySalesMap, effectiveMonthlyUnits as pickEffectiveMonthly } from "@/lib/sales-forecast";
import { forecastV2ForConsumers, v2DecisionDemand } from "@/lib/forecast/consumer";
import { capitalScore, type CapitalScore } from "./score";
import { deadStockValue, isCostBasis } from "@/lib/cfo/dead-stock-value";

// Sermaye sağlığı — TEK hesap (2026-10-07 panel taraması: /admin/sermaye-saglik, /admin/capital, /admin/executive ve
// dashboard manşeti dört ayrı kopyaydı; üç farklı kur, iki farklı "ölü stok" ve iki farklı bağlı sermaye kuralı vardı).
// Artık sayılar CFO'nun kaynaklarından gelir:
//   kur            → lib/fx/current.ts (USD/TRY CFO kur defteri cfo_kur; elle girilen aylık kur bayattı)
//   bağlı sermaye  → cfo_stok_deger.maliyet_degeri (gercek_stok) = stok × birim maliyet; yer tutucu stoklar hariç
//   ölü stok       → cfo_olu_stok (CFO'nun ölü stok kuralı; /cfo/olu-stok ile aynı liste); TL yalnız maliyet esaslı (dead-stock-value)
// Talep (aylık kâr / acil sipariş için) Forecast V2 köprüsünden; bayrak kapalıyken eski 3 tablo + mevsim tahmini.
// Salt-okunur.

export type CapitalFx = { usdTry: number; rmbPerUsd: number | null; fromCfo: boolean; source: string };

/** Tek kur kaynağı (lib/fx/current.ts): USD/TRY CFO kur defterinden. */
export async function loadCapitalFx(): Promise<CapitalFx> {
  const fx = await getCurrentFx();
  return { usdTry: fx.usdTry, rmbPerUsd: fx.rmbPerUsd, fromCfo: fx.usdTrySource.startsWith("cfo_"), source: fx.usdTrySource };
}

export type HealthProduct = {
  id: string; name: string; sku: string; brand: string | null; stockQuantity: number; minimumStock: number; categoryName: string;
  t30g: number; prevT30g: number; effectiveMonthlyUnits: number; lifetimeSold: number;
  /** cfo_stok_deger.maliyet_degeri; yer tutucu stok ya da maliyeti olmayan ürün → 0 */
  lockedTry: number; costMissing: boolean; realStock: boolean;
  monthlyProfitTry: number; prevMonthlyProfitTry: number; stockDays: number | null;
};
export type DeadRow = { sku: string; productId: string | null; name: string; stock: number; lockedTry: number | null; saleValueTry: number | null; alarm: string; reason: string | null; lastSale: string | null };

export type CapitalHealth = {
  fx: CapitalFx; v2On: boolean; products: HealthProduct[];
  lockedTry: number; costMissingCount: number;
  monthlyExpectedTry: number; prevMonthlyExpectedTry: number; annualRoiPct: number; prevAnnualRoiPct: number;
  dead: { rows: DeadRow[]; totalTry: number; unknownCostCount: number; saleValueTry: number };
  urgentCount: number; liquidation: HealthProduct[]; stars: HealthProduct[];
  categories: { name: string; lockedTry: number; productCount: number; monthlyProfitTry: number }[];
  score: CapitalScore;
};

const CANCELLED = `("status" IS NULL OR ("status" NOT ILIKE '%iptal%' AND "status" NOT ILIKE '%iade%' AND "status" NOT ILIKE '%cancel%'))`;

export async function loadCapitalHealth(now = new Date()): Promise<CapitalHealth> {
  const fx = await loadCapitalFx();
  const since30 = new Date(now.getTime() - 30 * 86400000);
  const since60 = new Date(now.getTime() - 60 * 86400000);

  const [products, monthlyRows, windowRows, stockValue, deadRows] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, sku: true, brand: true, stockQuantity: true, minimumStock: true,
        sourceCostRmb: true, weightKg: true, customsRatePct: true, importPaymentFeePct: true, shippingMethodPref: true,
        onlineSalesPotential: true, unitCostTry: true,
        productCategory: { select: { name: true } },
        xmlData: { select: { xmlTrendyolPrice: true } },
        marketplacePrices: { where: { marketplace: "TRENDYOL" }, select: { priceTry: true }, take: 1 },
      },
    }),
    prisma.$queryRawUnsafe<Array<{ productId: string; month: Date; units: bigint }>>(`
      SELECT "productId", DATE_TRUNC('month', "orderDate")::date AS month, SUM("quantity")::bigint AS units
        FROM (SELECT "productId", "orderDate", "quantity", "status" FROM "MarketplaceSalesRecord" WHERE "productId" IS NOT NULL
              UNION ALL SELECT "productId", "orderDate", "quantity", "status" FROM "TrendyolSalesRecord" WHERE "productId" IS NOT NULL
              UNION ALL SELECT "productId", "orderDate", "quantity", "status" FROM "HepsiburadaSalesRecord" WHERE "productId" IS NOT NULL) c
       WHERE ${CANCELLED}
       GROUP BY "productId", DATE_TRUNC('month', "orderDate")`),
    prisma.$queryRawUnsafe<Array<{ productId: string; units: bigint; period: string }>>(`
      SELECT "productId", SUM("quantity")::bigint AS units, CASE WHEN "orderDate" >= $1 THEN 'curr' ELSE 'prev' END AS period
        FROM (SELECT "productId", "orderDate", "quantity", "status" FROM "MarketplaceSalesRecord" WHERE "productId" IS NOT NULL
              UNION ALL SELECT "productId", "orderDate", "quantity", "status" FROM "TrendyolSalesRecord" WHERE "productId" IS NOT NULL
              UNION ALL SELECT "productId", "orderDate", "quantity", "status" FROM "HepsiburadaSalesRecord" WHERE "productId" IS NOT NULL) c
       WHERE ${CANCELLED} AND "orderDate" >= $2
       GROUP BY "productId", period`, since30, since60),
    prisma.$queryRaw<Array<{ id: string; gercek_stok: boolean; maliyet_degeri: unknown; birim_maliyet: unknown }>>`
      select id, gercek_stok, maliyet_degeri, birim_maliyet from cfo_stok_deger`,
    prisma.$queryRaw<Array<{ sku: string; ad: string; stok: number; bagli_sermaye: unknown; deger_kaynagi: string | null; alarm: string; alarm_sebep: string | null; son_satis: Date | null }>>`
      select sku, ad, stok, bagli_sermaye, deger_kaynagi, alarm, alarm_sebep, son_satis from cfo_olu_stok order by bagli_sermaye desc nulls last`,
  ]);

  const monthlyByProduct = buildMonthlySalesMap(monthlyRows.map(r => ({ productId: r.productId, month: r.month, units: r.units })));
  const t30 = new Map<string, number>(), prev30 = new Map<string, number>();
  for (const r of windowRows) (r.period === "curr" ? t30 : prev30).set(r.productId, Number(r.units));
  const valueById = new Map(stockValue.map(r => [r.id, r]));
  const v2 = await forecastV2ForConsumers();

  const enriched: HealthProduct[] = products.map(p => {
    const monthlyMap = monthlyByProduct.get(p.id) ?? new Map<string, number>();
    let lifetimeSold = 0;
    for (const v of monthlyMap.values()) lifetimeSold += v;
    const effectiveMonthlyUnits = v2 ? v2DecisionDemand(v2, p.id) : pickEffectiveMonthly(forecastMonthlySales(monthlyMap, now), p.onlineSalesPotential);
    const trendyolPriceTry = p.marketplacePrices[0]?.priceTry != null ? Number(p.marketplacePrices[0].priceTry)
      : p.xmlData?.xmlTrendyolPrice != null ? Number(p.xmlData.xmlTrendyolPrice) * fx.usdTry : null;
    const cost = calcImportCost({
      sourceCostRmb: p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null, weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
      importPaymentFeePct: p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : null,
      shippingMethodPref: p.shippingMethodPref, rmbUsdRate: fx.rmbPerUsd, trendyolPriceTry, usdTryRate: fx.usdTry,
    });
    const revenue = calcRevenue({ trendyolPriceTry, usdTryRate: fx.usdTry });
    const netProfitTry = cost && revenue ? calcProfit(cost, revenue).netProfitUsd * fx.usdTry : null;
    const prevT30g = prev30.get(p.id) ?? 0;
    const sv = valueById.get(p.id);
    const realStock = sv ? sv.gercek_stok : false;
    const lockedTry = sv && sv.gercek_stok ? Number(sv.maliyet_degeri ?? 0) : 0;
    return {
      id: p.id, name: p.name, sku: p.sku, brand: p.brand, stockQuantity: p.stockQuantity, minimumStock: p.minimumStock,
      categoryName: p.productCategory?.name ?? "Diğer", t30g: t30.get(p.id) ?? 0, prevT30g, effectiveMonthlyUnits, lifetimeSold,
      lockedTry, realStock, costMissing: realStock && !(Number(sv?.birim_maliyet ?? 0) > 0),
      monthlyProfitTry: netProfitTry != null ? netProfitTry * effectiveMonthlyUnits : 0,
      prevMonthlyProfitTry: netProfitTry != null ? netProfitTry * prevT30g : 0,
      stockDays: realStock && effectiveMonthlyUnits > 0 ? Math.round((p.stockQuantity / effectiveMonthlyUnits) * 30) : null,
    };
  });

  const bySku = new Map(products.map(p => [p.sku.toLowerCase(), p.id]));
  const dead: DeadRow[] = deadRows.map(r => ({
    sku: r.sku, productId: bySku.get(String(r.sku).toLowerCase()) ?? null, name: r.ad, stock: Number(r.stok),
    lockedTry: isCostBasis(r) ? Number(r.bagli_sermaye) : null, saleValueTry: isCostBasis(r) || r.bagli_sermaye == null ? null : Number(r.bagli_sermaye),
    alarm: r.alarm, reason: r.alarm_sebep, lastSale: r.son_satis ? new Date(r.son_satis).toISOString().slice(0, 10) : null,
  }));

  const lockedTry = enriched.reduce((s, p) => s + p.lockedTry, 0);
  const monthlyExpectedTry = enriched.reduce((s, p) => s + Math.max(0, p.monthlyProfitTry), 0);
  const prevMonthlyExpectedTry = enriched.reduce((s, p) => s + Math.max(0, p.prevMonthlyProfitTry), 0);
  const roi = (m: number) => (lockedTry > 0 ? ((m * 12) / lockedTry) * 100 : 0);
  // CFO-020: ölü stok TL yalnız maliyet esaslı (lib/cfo/dead-stock-value.ts) — satış değeriyle dolan satırlar ayrı, bağlı sermayeye bölünmez.
  const deadValue = deadStockValue(deadRows), deadTotal = deadValue.costTry;
  const urgentCount = enriched.filter(p => p.stockDays != null && p.stockDays > 0 && p.stockDays < 14).length;
  const liquidationAll = enriched.filter(p => p.lockedTry > 0 && p.t30g === 0 && p.lifetimeSold > 0).sort((a, b) => b.lockedTry - a.lockedTry);

  const cat = new Map<string, CapitalHealth["categories"][number]>();
  for (const p of enriched) {
    const c = cat.get(p.categoryName) ?? { name: p.categoryName, lockedTry: 0, productCount: 0, monthlyProfitTry: 0 };
    c.lockedTry += p.lockedTry; c.productCount += 1; c.monthlyProfitTry += Math.max(0, p.monthlyProfitTry);
    cat.set(p.categoryName, c);
  }

  return {
    fx, v2On: v2 != null, products: enriched, lockedTry, costMissingCount: enriched.filter(p => p.costMissing).length,
    monthlyExpectedTry, prevMonthlyExpectedTry, annualRoiPct: roi(monthlyExpectedTry), prevAnnualRoiPct: roi(prevMonthlyExpectedTry),
    dead: { rows: dead, totalTry: deadTotal, unknownCostCount: deadValue.unknownCostSku, saleValueTry: deadValue.saleValueTry }, urgentCount, liquidation: liquidationAll,
    stars: enriched.filter(p => p.monthlyProfitTry > 0).sort((a, b) => b.monthlyProfitTry - a.monthlyProfitTry),
    categories: [...cat.values()].sort((a, b) => b.lockedTry - a.lockedTry),
    score: capitalScore({ annualRoiPct: roi(monthlyExpectedTry), deadRatio: lockedTry > 0 ? deadTotal / lockedTry : 0, urgentCount, liquidationCount: liquidationAll.length }),
  };
}
