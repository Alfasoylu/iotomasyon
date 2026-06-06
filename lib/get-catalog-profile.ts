import "server-only";

import { prisma } from "@/lib/prisma";

import {
  FALLBACK_PROFILES,
  GENERAL_PROFILE,
  type CatalogProfile,
  type CatalogPriceMode,
} from "./catalog-mapping";

/**
 * DB-aware catalog profile resolver.
 *
 * Industry.slug → CatalogProfile.slug join. Bulunamazsa GENERAL_PROFILE.
 * DB hatası durumunda FALLBACK_PROFILES'a düşer (PDF üretimi bloke olmaz).
 *
 * Admin UI: /admin/catalog-profiles
 */
export async function getCatalogProfile(
  industrySlug: string | null | undefined,
): Promise<CatalogProfile> {
  if (!industrySlug) return GENERAL_PROFILE;

  try {
    const row = await prisma.catalogProfile.findUnique({
      where: { slug: industrySlug },
      select: {
        slug: true,
        title: true,
        subtitle: true,
        categorySlugs: true,
        defaultPriceMode: true,
        enabled: true,
      },
    });
    if (row && row.enabled) {
      return {
        slug: row.slug,
        title: row.title,
        subtitle: row.subtitle,
        categorySlugs: row.categorySlugs,
        defaultPriceMode: row.defaultPriceMode as CatalogPriceMode,
      };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("getCatalogProfile: DB read failed, fallback to hard-coded", err);
  }

  // DB miss / disabled / error → fallback (yeni doğru kategorilerle)
  return FALLBACK_PROFILES[industrySlug] ?? GENERAL_PROFILE;
}

export async function listAllCatalogProfiles(): Promise<CatalogProfile[]> {
  try {
    const rows = await prisma.catalogProfile.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: {
        slug: true,
        title: true,
        subtitle: true,
        categorySlugs: true,
        defaultPriceMode: true,
      },
    });
    return rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      subtitle: r.subtitle,
      categorySlugs: r.categorySlugs,
      defaultPriceMode: r.defaultPriceMode as CatalogPriceMode,
    }));
  } catch {
    return [GENERAL_PROFILE, ...Object.values(FALLBACK_PROFILES)];
  }
}
