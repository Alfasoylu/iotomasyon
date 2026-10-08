/**
 * AI CFO V1 — anomali tespiti (`lib/cfo-agent/anomalies.ts`), saf fonksiyon.
 *
 * DB/ağ gerektirmez: `CfoAgentSnapshot` elle kurulup `detectCfoAnomalies`e
 * verilir. Amaç kural eşiklerini doğrulamak değil (bunlar `config.ts`'te),
 * her kuralın DOĞRU tazelik sinyaline baktığını doğrulamak:
 * `ProductSignal.sourceFresh` (kanal satış verisi) ve `financialSourceFresh`
 * (Entegra maliyet + canonical doğrulama) `snapshot.ts`de BİLEREK ayrı iki
 * alan — biri fiyat/kanal, öbürü maliyet/kâr kurallarını kapatmalı. Bu test
 * olmadan ikisi karışsa (ör. yalnız `sourceFresh`e bakmak) derleme hata
 * vermez, yalnız yanlış anda anomali üretir/susar.
 *
 * Çalıştır: npx tsx __tests__/ai-cfo-anomalies.test.ts
 */
import assert from "node:assert/strict";
import { detectCfoAnomalies, shouldReopen, silencedRules } from "../lib/cfo-agent/anomalies";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { metric, unknown } from "../lib/cfo-agent/calculations";
import type { Anomaly, CfoAgentSnapshot, Metric, ProductSignal } from "../lib/cfo-agent/types";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  OK   ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.stack ?? e.message : e}`);
  }
}

const NOW = "2026-10-05T10:00:00.000Z";
const config = getCfoConfig({});

function baseProduct(overrides: Partial<ProductSignal> = {}): ProductSignal {
  return {
    sku: "SKU-1", channel: "TRENDYOL", isSet: false, trusted: true, sourceFresh: true,
    financialSourceFresh: true, inventorySourceFresh: true, catalogSku: "SKU-1",
    cost: metric(100), avgPrice: metric(200), commissionRate: metric(0.1), commissionSamples: 10,
    priceFloor: metric(150), zeroCommissionFloor: metric(120), unitProfit: metric(50),
    previousUnitProfit: metric(50), contribution: metric(500), previousMargin: metric(25), margin: metric(25),
    salesUnits30: metric(10), xmlUnits30: metric(10), salesVelocity: metric(1), xmlVelocity: metric(1),
    velocityGapPct: metric(0), velocity: metric(1), stockDays: metric(60), stockQty: 60, inboundQty: 0,
    inboundEta: null, inboundBeforeStockout: false, openPurchaseOrders: 0,
    momentum: metric(0), pricePeriod: "2026-10", ...overrides,
  };
}

function baseSnapshot(overrides: Partial<CfoAgentSnapshot> = {}): CfoAgentSnapshot {
  const zero: Metric = metric(0);
  return {
    schemaVersion: "2", calculationVersion: "alfas-gross-v4", generatedAt: NOW, timezone: "Europe/Istanbul",
    currency: "TRY", accountingBasis: "gross_incl_vat",
    dataQuality: { staleSources: [], missingFields: [], costCoveragePct: 100, matchingCoveragePct: 100,
      sourceWatermarks: [], excludedDummyStock: 0, zeroStockSkuCount: 0, commissionCoverage: [],
      fbaInventoryUnknown: true, duplicateCanonicalRows: 0, excludedUntrustedRows: 0 },
    sales: { lastHour: { grossRevenue: zero, orders: 0, aov: zero, complete: true },
      today: { grossRevenue: zero, orders: 0, aov: zero, complete: true },
      yesterday: { grossRevenue: zero, orders: 0, aov: zero, complete: true },
      last7Days: { grossRevenue: zero, orders: 0, aov: zero, complete: true },
      last30Days: { grossRevenue: zero, orders: 0, aov: zero, complete: true },
      monthToDate: { grossRevenue: zero, orders: 0, aov: zero, complete: true }, comparisons: [] },
    profitability: { grossRevenue: zero, revenueExVat: zero, vat: zero, refunds: zero, productCost: zero,
      commission: zero, shipping: zero, advertising: zero, otherVariableCosts: zero,
      contributionProfit: zero, contributionMargin: zero },
    profitabilityByPeriod: {}, channels: [],
    inventory: { costValue: zero, knownCostValue: zero, retailValue: zero, stockoutRiskValue: zero, deadStockValue: zero },
    products: [], deadStock: [],
    cash: { generalUnusedOverdraft: zero, totalCardDebt: zero, activeCards: 0, cash: zero,
      minimumProjectedPosition: metric(1000000), purposeLimit: zero, banksFresh: true, summaries: [] },
    procurement: { riskySkuCount: 0, openOrders: 0 },
    importPipeline: { inboundSkuCount: 0, coveragePct: zero },
    returns: { currentRate: unknown("no_sample"), previousRate: unknown("no_sample"), sample: 0, complete: false },
    evidence: [], ...overrides,
  };
}

function rules(anomalies: Anomaly[]): string[] { return anomalies.map((a) => a.rule); }

async function main() {
  console.log("\nAI CFO V1 — anomali tespiti testleri\n");

  check("financialSourceFresh=false iken PRICE_BELOW_FLOOR ÜRETMEZ (kanal taze olsa bile)", () => {
    const snap = baseSnapshot({
      products: [baseProduct({ sourceFresh: true, financialSourceFresh: false, avgPrice: metric(100), priceFloor: metric(150) })],
    });
    assert(!rules(detectCfoAnomalies(snap, config)).includes("PRICE_BELOW_FLOOR"));
  });

  check("financialSourceFresh=true + sourceFresh=true iken PRICE_BELOW_FLOOR ÜRETİR", () => {
    const snap = baseSnapshot({
      products: [baseProduct({ sourceFresh: true, financialSourceFresh: true, avgPrice: metric(100), priceFloor: metric(150) })],
    });
    assert(rules(detectCfoAnomalies(snap, config)).includes("PRICE_BELOW_FLOOR"));
  });

  check("financialSourceFresh=false ama sourceFresh=true iken PRICE_DEAD_BAND HÂLÂ ÜRETİR (yalnız kanal fiyatına bakar)", () => {
    const snap = baseSnapshot({
      products: [baseProduct({ sourceFresh: true, financialSourceFresh: false, avgPrice: metric(210) })],
    });
    assert(rules(detectCfoAnomalies(snap, config)).includes("PRICE_DEAD_BAND"));
  });

  check("sourceFresh=false iken PRICE_DEAD_BAND ÜRETMEZ (kanal verisi bayat)", () => {
    const snap = baseSnapshot({
      products: [baseProduct({ sourceFresh: false, financialSourceFresh: true, avgPrice: metric(210) })],
    });
    assert(!rules(detectCfoAnomalies(snap, config)).includes("PRICE_DEAD_BAND"));
  });

  check("financialSourceFresh=false iken NEGATIVE_PROFIT (ürün) ÜRETMEZ", () => {
    const snap = baseSnapshot({
      products: [baseProduct({ sourceFresh: true, financialSourceFresh: false, unitProfit: metric(-10), previousUnitProfit: metric(10) })],
    });
    assert(!rules(detectCfoAnomalies(snap, config)).includes("NEGATIVE_PROFIT"));
  });

  check("financialSourceFresh=true iken NEGATIVE_PROFIT (ürün) ÜRETİR", () => {
    const snap = baseSnapshot({
      products: [baseProduct({ sourceFresh: true, financialSourceFresh: true, unitProfit: metric(-10), previousUnitProfit: metric(10) })],
    });
    assert(rules(detectCfoAnomalies(snap, config)).includes("NEGATIVE_PROFIT"));
  });

  check("costCoveragePct eşiğin altındaysa COST_COVERAGE üretir ve ürün kuralları susar", () => {
    const snap = baseSnapshot({
      dataQuality: { staleSources: [], missingFields: [], costCoveragePct: 10, matchingCoveragePct: 100,
        sourceWatermarks: [], excludedDummyStock: 0, zeroStockSkuCount: 0, commissionCoverage: [],
        fbaInventoryUnknown: true, duplicateCanonicalRows: 0, excludedUntrustedRows: 0 },
      products: [baseProduct({ unitProfit: metric(-10), previousUnitProfit: metric(10) })],
    });
    const found = rules(detectCfoAnomalies(snap, config));
    assert(found.includes("COST_COVERAGE"));
    assert(!found.includes("NEGATIVE_PROFIT"));
  });

  check("mükerrer satır şirket çapında kapı değil: marj kuralları çalışır, DUPLICATE_SALES_ROWS uyarısı gelir (Cowork 2026-10-08)", () => {
    const snap = baseSnapshot({
      dataQuality: { staleSources: [], missingFields: [], costCoveragePct: 100, matchingCoveragePct: 100,
        sourceWatermarks: [], excludedDummyStock: 0, zeroStockSkuCount: 0, commissionCoverage: [],
        fbaInventoryUnknown: true, duplicateCanonicalRows: 2, excludedUntrustedRows: 0 },
      products: [baseProduct({ sourceFresh: true, financialSourceFresh: true, unitProfit: metric(-10), previousUnitProfit: metric(10) })],
    });
    const found = rules(detectCfoAnomalies(snap, config));
    assert(found.includes("NEGATIVE_PROFIT"), "tek tekrar marj/kâr kurallarını susturmaz");
    assert(found.includes("DUPLICATE_SALES_ROWS"));
    assert(!silencedRules(snap, config).some(r => r.includes("mükerrer")));
  });

  check("stockDays eşiğin altındaysa STOCKOUT üretir (XML taze olmalı)", () => {
    const snap = baseSnapshot({
      products: [baseProduct({ stockDays: metric(5), stockQty: 5 })],
    });
    const found = rules(detectCfoAnomalies(snap, config));
    assert(found.includes("STOCKOUT"));
  });

  check("XML bayatsa STOCKOUT üretmez (kanıtlanamayan stok sayısına güvenilmez)", () => {
    const snap = baseSnapshot({
      dataQuality: { staleSources: ["XML"], missingFields: [], costCoveragePct: 100, matchingCoveragePct: 100,
        sourceWatermarks: [], excludedDummyStock: 0, zeroStockSkuCount: 0, commissionCoverage: [],
        fbaInventoryUnknown: true, duplicateCanonicalRows: 0, excludedUntrustedRows: 0 },
      products: [baseProduct({ stockDays: metric(5), stockQty: 5 })],
    });
    assert(!rules(detectCfoAnomalies(snap, config)).includes("STOCKOUT"));
  });

  check("trusted=false ise ürün satırı tamamen atlanır", () => {
    const snap = baseSnapshot({
      products: [baseProduct({ trusted: false, unitProfit: metric(-999), stockDays: metric(1), stockQty: 1 })],
    });
    assert.deepEqual(detectCfoAnomalies(snap, config), []);
  });

  check("nakit kritik eşiğin altındaysa CASH_CRITICAL üretir ve en öne sıralanır", () => {
    const snap = baseSnapshot({
      cash: { generalUnusedOverdraft: metric(0), totalCardDebt: metric(0), activeCards: 0, cash: metric(0),
        minimumProjectedPosition: metric(config.cashFloorTry - 1), purposeLimit: metric(0), banksFresh: true, summaries: [] },
      products: [baseProduct({ stockDays: metric(5), stockQty: 5 })],
    });
    const result = detectCfoAnomalies(snap, config);
    assert.equal(result[0]?.rule, "CASH_CRITICAL");
  });

  check("KMH faizi dahil dip tabanın altındaysa projeksiyon üstünde olsa da CASH_CRITICAL üretir (Cowork sırası 3/3)", () => {
    const cash = (withInterest: number | null, proj: number | null = config.cashFloorTry + 100_000) => baseSnapshot({
      cash: { generalUnusedOverdraft: metric(0), totalCardDebt: metric(0), activeCards: 0, cash: metric(0),
        minimumProjectedPosition: proj == null ? unknown("projection_unavailable") : metric(proj),
        purposeLimit: metric(0), banksFresh: true, summaries: [], minimumWithInterestTry: withInterest },
    });
    const hit = cash(config.cashFloorTry - 1);
    const r = detectCfoAnomalies(hit, config);
    assert.equal(r[0]?.rule, "CASH_CRITICAL");
    assert.equal(hit.evidence.find(e => r[0].evidenceIds.includes(e.id) && e.query === "trigger")?.value, "kmh_interest");
    assert(!rules(detectCfoAnomalies(cash(config.cashFloorTry + 1), config)).includes("CASH_CRITICAL"), "faizli dip de tabanın üstünde");
    assert(!rules(detectCfoAnomalies(cash(null), config)).includes("CASH_CRITICAL"), "faizli dip yoksa projeksiyona bakar");
    assert(!rules(detectCfoAnomalies(cash(config.cashFloorTry - 1, null), config)).includes("CASH_CRITICAL"), "projeksiyon bilinmiyorsa susar");
    const both = cash(config.cashFloorTry - 2, config.cashFloorTry - 1);
    const rb = detectCfoAnomalies(both, config);
    assert.equal(both.evidence.find(e => rb[0].evidenceIds.includes(e.id) && e.query === "trigger")?.value, "projection");
  });

  check("banksFresh=false iken nakit bayat olsa da CASH_CRITICAL üretmez", () => {
    const snap = baseSnapshot({
      cash: { generalUnusedOverdraft: metric(0), totalCardDebt: metric(0), activeCards: 0, cash: metric(0),
        minimumProjectedPosition: metric(config.cashFloorTry - 1), purposeLimit: metric(0), banksFresh: false, summaries: [] },
    });
    assert(!rules(detectCfoAnomalies(snap, config)).includes("CASH_CRITICAL"));
  });

  check("aynı snapshot iki kez çağrılınca aynı fingerprint/id üretir (idempotent)", () => {
    const snap = baseSnapshot({ products: [baseProduct({ stockDays: metric(5), stockQty: 5 })] });
    const first = detectCfoAnomalies(baseSnapshot({ products: [baseProduct({ stockDays: metric(5), stockQty: 5 })] }), config);
    const second = detectCfoAnomalies(snap, config);
    assert.equal(first.find((a) => a.rule === "STOCKOUT")?.fingerprint, second.find((a) => a.rule === "STOCKOUT")?.fingerprint);
  });

  check("shouldReopen: cooldown süresi geçtiyse true (etki aynı kalsa bile)", () => {
    const anomaly = { impact: { value: 100, formula: "x", inputs: {}, basis: "gross_incl_vat" as const, estimated: false } } as Anomaly;
    const now = new Date("2026-10-05T10:00:00Z");
    const previous = { createdAt: new Date("2026-10-01T10:00:00Z"), impact: 100 };
    assert.equal(shouldReopen(anomaly, previous, now, 72), true);
  });

  check("shouldReopen: cooldown içinde ve etki küçük artışta false", () => {
    const anomaly = { impact: { value: 110, formula: "x", inputs: {}, basis: "gross_incl_vat" as const, estimated: false } } as Anomaly;
    const now = new Date("2026-10-02T10:00:00Z");
    const previous = { createdAt: new Date("2026-10-01T10:00:00Z"), impact: 100 };
    assert.equal(shouldReopen(anomaly, previous, now, 72), false);
  });

  check("shouldReopen: cooldown içinde ama etki 1.5 kattan fazla büyüdüyse true", () => {
    const anomaly = { impact: { value: 160, formula: "x", inputs: {}, basis: "gross_incl_vat" as const, estimated: false } } as Anomaly;
    const now = new Date("2026-10-02T10:00:00Z");
    const previous = { createdAt: new Date("2026-10-01T10:00:00Z"), impact: 100 };
    assert.equal(shouldReopen(anomaly, previous, now, 72), true);
  });

  // TL etkisi (2026-10-07): sıralama TL'ye göre; kâr bilinmiyorsa STOCKOUT ciro riskiyle (etiketli) dolar
  check("TL etkisi: STOCKOUT kâr / ciro riski, PRICE_BELOW_FLOOR fiyat açığı, DEAD_STOCK para maliyeti; sıralama TL'ye göre", () => {
    const days = config.stockoutDays - 5;
    const profit = detectCfoAnomalies(baseSnapshot({ products: [baseProduct({ stockDays: metric(5), stockQty: 5 })] }), config).find(a => a.rule === "STOCKOUT")!;
    assert.equal(profit.impact?.kind, "lost_profit"); assert.equal(profit.impact?.value, 50 * 1 * days);
    const revenue = detectCfoAnomalies(baseSnapshot({ products: [baseProduct({ stockDays: metric(5), stockQty: 5, unitProfit: unknown("cost_unknown") })] }), config).find(a => a.rule === "STOCKOUT")!;
    assert.equal(revenue.impact?.kind, "revenue_at_risk"); assert.equal(revenue.impact?.value, 200 * 1 * days); assert.equal(revenue.impact?.estimated, true);
    assert.equal(revenue.evidenceIds.length, 7, "ciro riski için ortalama fiyat kanıtı eklenir (stok adedi kanıtı dahil: şablonlu bulgu sipariş miktarını hesaplar)");
    const price = detectCfoAnomalies(baseSnapshot({ products: [baseProduct({ avgPrice: metric(100), priceFloor: metric(150) })] }), config).find(a => a.rule === "PRICE_BELOW_FLOOR")!;
    assert.equal(price.impact?.kind, "price_gap"); assert.equal(price.impact?.value, (150 - 100) * 1 * 30);
    const dead = detectCfoAnomalies(baseSnapshot({ deadStock: [{ sku: "OLU-1", value: metric(100000), alarm: "KIRMIZI", findingId: null }] }), config).find(a => a.rule === "DEAD_STOCK")!;
    assert.equal(dead.impact?.kind, "capital_cost"); assert.equal(dead.impact?.value, 2830); assert.equal(dead.weight, 2830);
    // aynı önemdeki iki anomali TL etkisine göre sıralanır
    const both = detectCfoAnomalies(baseSnapshot({ products: [baseProduct({ avgPrice: metric(100), priceFloor: metric(150) })],
      deadStock: [{ sku: "OLU-1", value: metric(100000), alarm: "KIRMIZI", findingId: null }] }), config).filter(a => a.severity === "critical");
    assert.deepEqual(both.map(a => a.rule).slice(0, 2), ["DEAD_STOCK", "PRICE_BELOW_FLOOR"], "2.830 TL > 1.500 TL");
  });

  console.log(failed ? `\n${failed} test BAŞARISIZ.\n` : "\nTüm testler geçti.\n");
  if (failed) process.exit(1);
}

main();
