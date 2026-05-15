import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { getCampaignCandidates } from "@/services/outreach-service";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; categoryId?: string }>;
}) {
  await requirePermission(PERMISSIONS.CAMPAIGNS_CREATE);
  const { productId, categoryId } = await searchParams;

  if (!productId && !categoryId) notFound();

  const [candidateResult, context] = await Promise.all([
    getCampaignCandidates(productId, categoryId),
    resolveContext(productId, categoryId),
  ]);

  if (!candidateResult.databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Kampanya</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Veritabanı geçici olarak kullanılamıyor
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          WhatsApp Kampanyası
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Kampanya oluştur
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          {context.productName
            ? `Ürün: ${context.productName}`
            : context.categoryName
              ? `Kategori: ${context.categoryName}`
              : null}
          {" · "}
          {candidateResult.candidates.length} potansiyel alıcı bulundu
        </p>
      </div>

      <Card className="p-6">
        <CampaignForm
          productId={productId}
          categoryId={categoryId}
          productName={context.productName}
          categoryName={context.categoryName}
          candidates={candidateResult.candidates}
        />
      </Card>
    </div>
  );
}

async function resolveContext(productId?: string, categoryId?: string) {
  if (productId) {
    const p = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    return { productName: p?.name, categoryName: undefined };
  }
  if (categoryId) {
    const c = await prisma.productCategory.findUnique({
      where: { id: categoryId },
      select: { name: true },
    });
    return { productName: undefined, categoryName: c?.name };
  }
  return {};
}
