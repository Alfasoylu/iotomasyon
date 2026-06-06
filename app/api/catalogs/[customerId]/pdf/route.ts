/**
 * Faz 1 — Katalog PDF Endpoint
 *
 * GET /api/catalogs/[customerId]/pdf?profile=<slug>&priceMode=<mode>&brand=<csv>&coverNote=<text>&onlyStock=<0|1>
 *
 * Permission: CATALOGS_CREATE (ADMIN + SALES).
 * priceMode=wholesale → ek CATALOGS_WHOLESALE_MODE permission (sadece ADMIN).
 */

import { NextResponse } from "next/server";

import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { type CatalogPriceMode } from "@/lib/catalog-mapping";
import { getCatalogProfile } from "@/lib/get-catalog-profile";
import {
  buildCatalogPdf,
  type CatalogPdfCategorySection,
  type CatalogPdfProduct,
} from "@/lib/catalog-pdf-generator";
import {
  CATALOG_PRICE_SELECT,
  catalogPriceFilter,
  resolveCatalogPrice,
} from "@/lib/catalog-price";
import { getCompanySettings } from "@/lib/get-company-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PRICE_MODES = new Set<CatalogPriceMode>(["wholesale", "retail", "hidden"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const user = await getCurrentSession();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  if (!(await checkPermission(user, PERMISSIONS.CATALOGS_CREATE))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { customerId } = await params;
  const url = new URL(request.url);

  // Profile selection
  const profileSlug = url.searchParams.get("profile");
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      company: true,
      city: true,
      industry: { select: { slug: true, name: true } },
    },
  });
  if (!customer) return new NextResponse("Customer not found", { status: 404 });

  // DB-driven catalog profile — Industry.slug ile join.
  // profileSlug query param ile override edilebilir (UI'da kullanılır).
  const profile = await getCatalogProfile(profileSlug ?? customer.industry?.slug);

  // Price mode
  const requestedMode = url.searchParams.get("priceMode") as CatalogPriceMode | null;
  let priceMode: CatalogPriceMode = profile.defaultPriceMode;
  if (requestedMode && PRICE_MODES.has(requestedMode)) {
    priceMode = requestedMode;
  }

  // Wholesale permission check
  if (priceMode === "wholesale") {
    if (!(await checkPermission(user, PERMISSIONS.CATALOGS_WHOLESALE_MODE))) {
      // Downgrade silently to retail rather than 403 — UI should prevent SALES from selecting wholesale
      priceMode = "retail";
    }
  }

  // Brand filter (csv)
  const brandsRaw = url.searchParams.get("brand");
  const brandFilter = brandsRaw
    ? brandsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const onlyStock = url.searchParams.get("onlyStock") !== "0";
  const coverNote = url.searchParams.get("coverNote")?.slice(0, 500) ?? null;

  // Fetch products for each category in profile
  // ⚠ Prisma `slug IN (...)` order'ı korumaz — categorySlugs array order'ına göre yeniden sırala.
  const categoriesFromDb = await prisma.productCategory.findMany({
    where: { slug: { in: profile.categorySlugs } },
    select: { id: true, name: true, slug: true },
  });
  const byCatalogSlug = new Map(categoriesFromDb.map((c) => [c.slug, c]));
  const categories = profile.categorySlugs
    .map((s) => byCatalogSlug.get(s))
    .filter((c): c is { id: string; name: string; slug: string } => !!c);

  const sections: CatalogPdfCategorySection[] = [];
  for (const cat of categories) {
    const where: Record<string, unknown> = {
      isActive: true,
      categoryId: cat.id,
    };
    if (onlyStock) where.stockQuantity = { gt: 0 };
    if (brandFilter.length > 0) where.brand = { in: brandFilter };

    // Fiyatı olan ürünleri filtrele — manual override VEYA XML fallback
    const priceFilter = catalogPriceFilter(priceMode);
    if (priceFilter) Object.assign(where, priceFilter);

    const products = await prisma.product.findMany({
      where: where as Parameters<typeof prisma.product.findMany>[0] extends infer T
        ? T extends { where?: infer W }
          ? NonNullable<W>
          : never
        : never,
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        brand: true,
        stockQuantity: true,
        imageUrl: true,
        ...CATALOG_PRICE_SELECT,
      },
      // Sıralama:
      //   1. catalogSortOrder > 0 olanlar üstte (admin manuel sırası, küçük önce)
      //   2. catalogSortOrder = 0 olanlar otomatik (stockQuantity desc, name asc)
      // Prisma'da "0 son" sıralama için: önce non-zero ascending, sonra 0'lar stok+isim.
      // Pragmatik çözüm: catalogSortOrder asc (0'lar başta) yerine COALESCE(NULLIF(0, ...))
      // taklidi yapamayız tek pass'te. Bu yüzden iki orderBy: sortOrder asc, stock desc, name asc.
      // 0'lı ürünler eşit sıralanır ve stok+ad ile düzenlenir, manuel olanlar (1+) en üstte.
      orderBy: [
        { catalogSortOrder: "asc" },
        { stockQuantity: "desc" },
        { name: "asc" },
      ],
      take: 60, // hard cap per category
    });

    if (products.length === 0) continue;

    const mapped: CatalogPdfProduct[] = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      brand: p.brand,
      stockQuantity: p.stockQuantity,
      imageUrl: p.imageUrl,
      priceUsd: resolveCatalogPrice(p, priceMode),
    }));

    sections.push({
      categoryName: cat.name,
      products: mapped,
    });
  }

  const validity = new Date();
  validity.setDate(validity.getDate() + 30);

  const companySettings = await getCompanySettings();

  const bytes = await buildCatalogPdf({
    customer: {
      name: customer.name,
      company: customer.company,
      city: customer.city,
      industryName: customer.industry?.name ?? null,
    },
    salesRepName: user.name,
    profile,
    priceMode,
    coverNote,
    sections,
    generatedAt: new Date(),
    validityDate: validity,
    companySettings,
  });

  const safeName =
    (customer.company ?? customer.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "katalog";

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="katalog-${safeName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
