/**
 * Faz 4 — Public Katalog Web Sayfası
 *
 * Sales rep tarafından paylaşılan token üzerinden açılır. Login gerektirmez.
 * Müşteri:
 *   - Sektör başlığı + ürün gridi + USD net (KDV hariç) fiyat görür
 *   - "İlgilendim" butonuyla ilgi belirtir (CatalogProductInterest event)
 *   - WhatsApp / telefon ile iletişime geçer
 *
 * Açılma + ilgi event'leri sales rep'e 24 saat içinde otomatik takip görevi oluşturur.
 */

import { notFound } from "next/navigation";
import { Phone, MessageCircle, Mail, MapPin } from "lucide-react";

import { COMPANY_SETTINGS } from "@/lib/company-settings";
import {
  getCatalogProfile,
  CATALOG_PROFILES,
  GENERAL_PROFILE,
} from "@/lib/catalog-mapping";
import { getShareByToken, recordShareView } from "@/services/catalog-share-service";
import { prisma } from "@/lib/prisma";
import { CatalogInterestButton } from "@/components/catalog/catalog-interest-button";

export const dynamic = "force-dynamic";

export default async function PublicCatalogPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await getShareByToken(token);
  if (!share) notFound();

  // Expiry check
  if (share.expiresAt < new Date()) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-md text-center">
          <h1 className="text-2xl font-bold text-slate-900">Bu katalog süresi dolmuş</h1>
          <p className="mt-3 text-sm text-slate-600">
            Bu katalog linkinin geçerliliği {new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(share.expiresAt)} tarihinde sona ermiştir.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Yeni bir katalog için bizimle iletişime geçin:{" "}
            <a href={`tel:${COMPANY_SETTINGS.phone}`} className="text-orange-600 font-semibold">
              {COMPANY_SETTINGS.phone}
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Track view (fire-and-forget; await briefly so first view is recorded before render)
  await recordShareView(share.id).catch(() => {});

  // Resolve profile
  const profile =
    share.profileSlug === GENERAL_PROFILE.slug
      ? GENERAL_PROFILE
      : CATALOG_PROFILES[share.profileSlug] ?? getCatalogProfile(null);

  // Fetch products by section
  const categories = await prisma.productCategory.findMany({
    where: { slug: { in: profile.categorySlugs } },
    select: { id: true, name: true, slug: true },
  });

  const sections: Array<{
    categoryName: string;
    products: Array<{
      id: string;
      sku: string;
      name: string;
      description: string | null;
      brand: string | null;
      imageUrl: string | null;
      stockQuantity: number;
      priceUsd: number | null;
    }>;
  }> = [];

  for (const cat of categories) {
    const where: Record<string, unknown> = { isActive: true, categoryId: cat.id };
    if (share.onlyStock) where.stockQuantity = { gt: 0 };
    if (share.brandFilter.length > 0) where.brand = { in: share.brandFilter };
    if (share.priceMode === "wholesale") where.wholesalePriceUsd = { not: null };
    else if (share.priceMode === "retail") where.retailPriceUsd = { not: null };

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
        imageUrl: true,
        stockQuantity: true,
        wholesalePriceUsd: true,
        retailPriceUsd: true,
      },
      orderBy: [{ stockQuantity: "desc" }, { name: "asc" }],
      take: 50,
    });

    if (products.length === 0) continue;

    sections.push({
      categoryName: cat.name,
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        brand: p.brand,
        imageUrl: p.imageUrl,
        stockQuantity: p.stockQuantity,
        priceUsd:
          share.priceMode === "wholesale"
            ? p.wholesalePriceUsd
              ? Number(p.wholesalePriceUsd)
              : null
            : share.priceMode === "retail"
              ? p.retailPriceUsd
                ? Number(p.retailPriceUsd)
                : null
              : null,
      })),
    });
  }

  const totalProducts = sections.reduce((sum, s) => sum + s.products.length, 0);
  const phoneDigits = COMPANY_SETTINGS.phone.replace(/\D/g, "");
  const phoneSecondaryDigits = COMPANY_SETTINGS.phoneSecondary.replace(/\D/g, "");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header (sticky) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={COMPANY_SETTINGS.logoUrl}
              alt={COMPANY_SETTINGS.companyName}
              className="h-9 w-9 flex-shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{COMPANY_SETTINGS.companyName}</p>
              <p className="text-[10px] text-slate-500 truncate">{COMPANY_SETTINGS.tagline}</p>
            </div>
          </div>
          <a
            href={`tel:${phoneDigits}`}
            className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Phone className="h-3.5 w-3.5" />
            Ara
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-slate-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-400">
            {share.customerIndustryName ?? "Ürün Kataloğu"}
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">{profile.title}</h1>
          <p className="mt-2 text-sm text-slate-300">{profile.subtitle}</p>

          <div className="mt-6 rounded-xl bg-orange-500/10 border border-orange-400/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-orange-400">Hazırlanan Müşteri</p>
            <p className="mt-1 text-base font-semibold text-white">
              {share.customerCompany ?? share.customerName}
            </p>
            {share.sentByName && (
              <p className="mt-1 text-xs text-slate-300">
                Hazırlayan: {share.sentByName} · {COMPANY_SETTINGS.companyName}
              </p>
            )}
          </div>

          {share.coverNote && (
            <div className="mt-4 rounded-xl bg-white/10 p-4 text-sm leading-6 text-slate-100">
              {share.coverNote}
            </div>
          )}

          {share.priceMode !== "hidden" && (
            <p className="mt-4 text-[11px] text-slate-400">
              Tüm fiyatlar USD bazında ve <strong>KDV hariçtir</strong>. Faturada TCMB kuru üzerinden TL hesaplanır.
            </p>
          )}
        </div>
      </section>

      {/* Sections */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        {sections.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              Bu sektör için şu anda gösterilebilecek ürün bulunmuyor. Lütfen bizimle iletişime geçin.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <p className="text-xs text-slate-500">{totalProducts} ürün · {sections.length} kategori</p>
            {sections.map((section) => (
              <section key={section.categoryName}>
                <h2 className="mb-4 text-lg font-bold text-slate-900">
                  {section.categoryName}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    ({section.products.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {section.products.map((p) => (
                    <article
                      key={p.id}
                      className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100"
                    >
                      <div className="aspect-square bg-slate-50">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-300">
                            Görsel
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{p.name}</h3>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{p.sku}</p>
                        {p.brand && (
                          <p className="text-[11px] text-slate-500">{p.brand}</p>
                        )}
                        <p
                          className={`mt-2 text-[11px] font-medium ${
                            p.stockQuantity > 0 ? "text-emerald-700" : "text-slate-500"
                          }`}
                        >
                          {p.stockQuantity > 0 ? "● Stokta" : "○ Sipariş üzerine"}
                        </p>
                        {share.priceMode !== "hidden" && p.priceUsd != null ? (
                          <p className="mt-2 text-xl font-bold text-slate-900">
                            ${p.priceUsd.toFixed(2)}{" "}
                            <span className="text-[10px] font-normal text-slate-500">KDV hariç</span>
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">Fiyat için iletişime geçin</p>
                        )}
                        <CatalogInterestButton
                          shareToken={token}
                          productId={p.id}
                          productName={p.name}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* CTA */}
        <section className="mt-12 rounded-2xl bg-orange-500 p-6 text-white">
          <h2 className="text-xl font-bold">Sipariş ve sorularınız için</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a
              href={`tel:${phoneDigits}`}
              className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-3"
            >
              <Phone className="h-5 w-5" />
              <div>
                <p className="text-[10px] uppercase tracking-widest">Telefon</p>
                <p className="font-semibold">{COMPANY_SETTINGS.phone}</p>
              </div>
            </a>
            <a
              href={`https://wa.me/9${phoneSecondaryDigits}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-3"
            >
              <MessageCircle className="h-5 w-5" />
              <div>
                <p className="text-[10px] uppercase tracking-widest">WhatsApp</p>
                <p className="font-semibold">{COMPANY_SETTINGS.phoneSecondary}</p>
              </div>
            </a>
          </div>
          <div className="mt-3 flex flex-col gap-1 text-xs text-white/80 sm:flex-row sm:gap-4">
            <a href={`mailto:${COMPANY_SETTINGS.email}`} className="flex items-center gap-1">
              <Mail className="h-3 w-3" /> {COMPANY_SETTINGS.email}
            </a>
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {COMPANY_SETTINGS.address}
            </span>
          </div>
        </section>

        {/* Footer terms */}
        <footer className="mt-10 border-t border-slate-200 pt-6 text-[11px] text-slate-500">
          <p className="font-semibold">{COMPANY_SETTINGS.legalName}</p>
          <p className="mt-1">VD: {COMPANY_SETTINGS.taxOffice} · VN: {COMPANY_SETTINGS.taxNumber}</p>
          <p className="mt-3">
            {share.priceMode !== "hidden"
              ? "Tüm fiyatlar USD bazında ve KDV hariçtir. Faturada TCMB kuru üzerinden TL hesaplanır."
              : "Fiyatlar için iletişime geçin."}{" "}
            Geçerlilik:{" "}
            {new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(share.expiresAt)}
          </p>
        </footer>
      </main>
    </div>
  );
}
