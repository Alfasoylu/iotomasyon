/**
 * services/lead-source-roi-service.ts — Lead Source + Şehir ROI analytics
 *
 * Phase 96b:
 * - Source bazlı: toplam müşteri, görüşülmüş, teklifli, kazanılmış, conversion %
 * - Şehir bazlı: top 10 + toplam customer + active deals
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export interface SourceROI {
  source: string;
  totalCustomers: number;
  contactedCustomers: number;
  customersWithQuote: number;
  customersWon: number;
  conversionPct: number;       // won / total
  contactRatePct: number;       // contacted / total
  totalQuoteAmount: number;
  totalWonAmount: number;
}

export interface CityStats {
  city: string;
  totalCustomers: number;
  contactedCustomers: number;
  customersWon: number;
  totalWonAmount: number;
}

export interface LeadSourceROISummary {
  sources: SourceROI[];
  cities: CityStats[];
  totalCustomers: number;
}

const ENTEGRA_SOURCE_PREFIX = "Entegra import";

export async function getLeadSourceROI(): Promise<LeadSourceROISummary> {
  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      source: true,
      city: true,
      status: true,
      lastContactedAt: true,
    },
  });

  const customersWithQuoteSum = await prisma.quote.groupBy({
    by: ["customerId"],
    _sum: { total: true },
  });
  const quoteSumByCustomer = new Map<string, number>();
  const customersWithQuoteSet = new Set<string>();
  for (const q of customersWithQuoteSum) {
    customersWithQuoteSet.add(q.customerId);
    quoteSumByCustomer.set(q.customerId, Number(q._sum.total ?? 0));
  }

  const wonQuotes = await prisma.quote.groupBy({
    by: ["customerId"],
    where: { status: "WON" },
    _sum: { total: true },
  });
  const wonSumByCustomer = new Map<string, number>();
  for (const q of wonQuotes) {
    wonSumByCustomer.set(q.customerId, Number(q._sum.total ?? 0));
  }

  const sourceMap = new Map<string, SourceROI>();
  const cityMap = new Map<string, CityStats>();

  for (const c of customers) {
    let sourceLabel = c.source?.trim() || "(Belirsiz)";
    if (sourceLabel.startsWith(ENTEGRA_SOURCE_PREFIX)) {
      sourceLabel = "Entegra (Pazaryeri)";
    }

    const cur =
      sourceMap.get(sourceLabel) ?? {
        source: sourceLabel,
        totalCustomers: 0,
        contactedCustomers: 0,
        customersWithQuote: 0,
        customersWon: 0,
        conversionPct: 0,
        contactRatePct: 0,
        totalQuoteAmount: 0,
        totalWonAmount: 0,
      };
    cur.totalCustomers++;
    if (c.lastContactedAt) cur.contactedCustomers++;
    if (customersWithQuoteSet.has(c.id)) {
      cur.customersWithQuote++;
      cur.totalQuoteAmount += quoteSumByCustomer.get(c.id) ?? 0;
    }
    if (c.status === "WON") {
      cur.customersWon++;
      cur.totalWonAmount += wonSumByCustomer.get(c.id) ?? 0;
    }
    sourceMap.set(sourceLabel, cur);

    if (c.city?.trim()) {
      const cityKey = c.city.trim();
      const cityCur =
        cityMap.get(cityKey) ?? {
          city: cityKey,
          totalCustomers: 0,
          contactedCustomers: 0,
          customersWon: 0,
          totalWonAmount: 0,
        };
      cityCur.totalCustomers++;
      if (c.lastContactedAt) cityCur.contactedCustomers++;
      if (c.status === "WON") {
        cityCur.customersWon++;
        cityCur.totalWonAmount += wonSumByCustomer.get(c.id) ?? 0;
      }
      cityMap.set(cityKey, cityCur);
    }
  }

  const sources = Array.from(sourceMap.values()).map((s) => ({
    ...s,
    conversionPct: s.totalCustomers > 0 ? Math.round((s.customersWon / s.totalCustomers) * 100) : 0,
    contactRatePct:
      s.totalCustomers > 0 ? Math.round((s.contactedCustomers / s.totalCustomers) * 100) : 0,
  }));
  sources.sort((a, b) => b.totalWonAmount - a.totalWonAmount || b.totalCustomers - a.totalCustomers);

  const cities = Array.from(cityMap.values());
  cities.sort((a, b) => b.totalCustomers - a.totalCustomers);
  const topCities = cities.slice(0, 15);

  return {
    sources,
    cities: topCities,
    totalCustomers: customers.length,
  };
}
