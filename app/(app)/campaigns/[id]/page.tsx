import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CampaignFunnel } from "@/components/campaigns/campaign-funnel";
import { RecipientList } from "@/components/campaigns/recipient-list";
import { getCampaignById } from "@/services/outreach-service";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  ACTIVE: "Aktif",
  COMPLETED: "Tamamlandı",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { databaseAvailable, campaign } = await getCampaignById(id);

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold text-slate-950">Kampanya geçici olarak kullanılamıyor</h1>
      </div>
    );
  }

  if (!campaign) notFound();

  const contextLink = campaign.product
    ? { href: `/products/${campaign.product.id}`, label: campaign.product.name }
    : campaign.category
      ? { href: `/categories/${campaign.category.id}`, label: campaign.category.name }
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            WhatsApp Kampanyası
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {contextLink ? contextLink.label : "Kampanya"}
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <Badge>{STATUS_LABELS[campaign.status] ?? campaign.status}</Badge>
            <Badge>{campaign.recipients.length} alıcı</Badge>
            {contextLink ? (
              <Link
                href={contextLink.href}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Kaynağa dön
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {/* Conversion funnel */}
      <CampaignFunnel funnel={campaign.funnel} currency={campaign.currency} />

      {/* Offer details */}
      {campaign.offerText || campaign.price ? (
        <Card className="p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            {campaign.offerText ? (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Teklif</p>
                <p className="mt-1 text-slate-900">{campaign.offerText}</p>
              </div>
            ) : null}
            {campaign.price ? (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Fiyat</p>
                <p className="mt-1 font-medium text-slate-900">
                  {campaign.price} {campaign.currency}
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Recipients */}
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          WhatsApp linkleri ve mesajlar
        </h2>
        <RecipientList
          recipients={campaign.recipients}
          message={campaign.message}
          offerText={campaign.offerText}
          price={campaign.price}
          currency={campaign.currency}
        />
      </Card>
    </div>
  );
}
