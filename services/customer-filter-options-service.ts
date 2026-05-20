/**
 * services/customer-filter-options-service.ts — Phase 99
 *
 * /customers sayfasında cascading dropdown'lar için distinct değerleri çeker.
 * - Şehir listesi (Customer.city distinct, NOT NULL)
 * - İlçe listesi (Customer.district distinct, opsiyonel şehir filter)
 * - Industry hiyerarşisi (parent + children)
 * - Kategori (ProductCategory listesi)
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export interface FilterOptions {
  cities: Array<{ city: string; count: number }>;
  districts: Map<string, Array<{ district: string; count: number }>>;
  industryGroups: Array<{
    id: string;
    name: string;
    slug: string;
    sortOrder: number;
    children: Array<{ id: string; name: string; slug: string; sortOrder: number }>;
  }>;
  categories: Array<{ id: string; name: string; slug: string }>;
}

export async function getCustomerFilterOptions(): Promise<FilterOptions> {
  const [cityRows, industries, categories] = await Promise.all([
    prisma.customer.groupBy({
      by: ["city", "district"],
      where: { isActive: true, city: { not: null } },
      _count: { _all: true },
    }),
    prisma.industry.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, parentId: true, sortOrder: true },
    }),
    prisma.productCategory.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Şehir + ilçe topla
  const cityCounts = new Map<string, number>();
  const districtsByCity = new Map<string, Array<{ district: string; count: number }>>();
  for (const r of cityRows) {
    if (!r.city) continue;
    cityCounts.set(r.city, (cityCounts.get(r.city) ?? 0) + r._count._all);
    if (r.district) {
      const list = districtsByCity.get(r.city) ?? [];
      list.push({ district: r.district, count: r._count._all });
      districtsByCity.set(r.city, list);
    }
  }
  // Şehirleri count DESC sırala
  const cities = Array.from(cityCounts.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr"));
  // İlçeleri her şehir için count DESC
  for (const list of districtsByCity.values()) {
    list.sort((a, b) => b.count - a.count || a.district.localeCompare(b.district, "tr"));
  }

  // Industry parent/child grupla
  const parents = industries.filter((i) => !i.parentId);
  const industryGroups = parents.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    sortOrder: p.sortOrder,
    children: industries
      .filter((c) => c.parentId === p.id)
      .map((c) => ({ id: c.id, name: c.name, slug: c.slug, sortOrder: c.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  return {
    cities,
    districts: districtsByCity,
    industryGroups,
    categories,
  };
}
