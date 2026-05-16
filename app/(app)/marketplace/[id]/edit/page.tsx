import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { ListingForm } from "@/components/marketplace/listing-form";

export const dynamic = "force-dynamic";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.MARKETPLACE_LISTINGS_WRITE);
  const { id } = await params;

  const [listing, products, users] = await Promise.all([
    prisma.marketplaceListing.findUnique({ where: { id } }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, sku: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!listing) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Pazar Yerleri</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Listeleme düzenle</h1>
      </div>
      <Card className="p-6">
        <ListingForm
          mode="edit"
          listingId={listing.id}
          products={products}
          users={users}
          initialValues={{
            productId: listing.productId,
            platform: listing.platform,
            platformListingId: listing.platformListingId ?? "",
            listingUrl: listing.listingUrl ?? "",
            listingBarcode: listing.listingBarcode ?? "",
            listingSku: listing.listingSku ?? "",
            listingTitle: listing.listingTitle ?? "",
            status: listing.status,
            notes: listing.notes ?? "",
            responsibleId: listing.responsibleId ?? "",
          }}
        />
      </Card>
    </div>
  );
}
