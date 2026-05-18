import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { ListingForm } from "@/components/marketplace/listing-form";

export const dynamic = "force-dynamic";

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  await requirePermission(PERMISSIONS.MARKETPLACE_LISTINGS_WRITE);
  const { productId } = await searchParams;

  const [products, users] = await Promise.all([
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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 hover:text-slate-900 transition"
        >
          ← Pazar Yerleri
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Yeni listeleme ekle</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Bir ürünün pazar yerindeki listeleme bilgilerini kayıt altına alın.
        </p>
      </div>
      <Card className="p-6">
        <ListingForm
          mode="create"
          products={products}
          users={users}
          initialValues={
            productId
              ? {
                  productId,
                  platform: "TRENDYOL",
                  platformListingId: "",
                  listingUrl: "",
                  listingBarcode: "",
                  listingSku: "",
                  listingTitle: "",
                  status: "UNKNOWN",
                  notes: "",
                  responsibleId: "",
                }
              : undefined
          }
        />
      </Card>
    </div>
  );
}
