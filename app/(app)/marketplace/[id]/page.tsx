import { notFound } from "next/navigation";
import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL: "Trendyol", HEPSIBURADA: "Hepsiburada", N11: "N11",
  PTTAVM: "PTT AVM", KOCTAS: "Koçtaş", TEKNOSA: "Teknosa", TEMU: "Temu", CUSTOM: "Diğer",
};
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif", INACTIVE: "Pasif", SUSPENDED: "Askıya alındı", UNKNOWN: "Bilinmiyor",
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INACTIVE: "bg-slate-100 text-slate-500",
  SUSPENDED: "bg-red-100 text-red-700",
  UNKNOWN: "bg-amber-100 text-amber-700",
};

function fmt(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-slate-50 last:border-0">
      <span className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-700 break-all">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.MARKETPLACE_LISTINGS_READ);
  const { id } = await params;

  const listing = await prisma.marketplaceListing.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      responsible: { select: { name: true } },
    },
  });

  if (!listing) notFound();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Pazar Yerleri</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {PLATFORM_LABELS[listing.platform] ?? listing.platform}
            {listing.listingTitle && (
              <span className="ml-3 text-lg font-normal text-slate-400">— {listing.listingTitle}</span>
            )}
          </h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[listing.status] ?? "bg-slate-100 text-slate-500"}`}>
              {STATUS_LABELS[listing.status] ?? listing.status}
            </span>
            <span className="text-sm text-slate-500">
              Ürün:{" "}
              <Link href={`/products/${listing.product.id}`} className="font-mono text-slate-700 hover:text-slate-950 underline-offset-2 hover:underline">
                {listing.product.sku}
              </Link>
              {" "}— {listing.product.name}
            </span>
          </div>
        </div>
        <Link href={`/marketplace/${id}/edit`}>
          <Button variant="secondary">Düzenle</Button>
        </Link>
      </div>

      <Card className="p-6">
        <Row label="Platform" value={PLATFORM_LABELS[listing.platform] ?? listing.platform} />
        <Row label="Durum" value={STATUS_LABELS[listing.status] ?? listing.status} />
        <Row label="Listeleme ID" value={listing.platformListingId} />
        <Row label="Listeleme SKU" value={listing.listingSku} />
        <Row label="Listeleme Barkod" value={listing.listingBarcode} />
        <Row label="Listeleme Başlığı" value={listing.listingTitle} />
        <Row label="URL" value={listing.listingUrl} />
        <Row label="Son kontrol" value={fmt(listing.lastCheckedAt)} />
        <Row label="Sorumlu" value={listing.responsible?.name} />
        <Row label="Notlar" value={listing.notes} />
        <Row label="Oluşturulma" value={fmt(listing.createdAt)} />
        <Row label="Son güncelleme" value={fmt(listing.updatedAt)} />
      </Card>

      {listing.listingUrl && (
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Listeleme bağlantısı</p>
          <a
            href={listing.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 underline break-all"
          >
            {listing.listingUrl}
          </a>
        </Card>
      )}

      <div className="flex gap-3">
        <Link href="/marketplace">
          <Button variant="secondary">← Tüm listelemelere dön</Button>
        </Link>
      </div>
    </div>
  );
}
