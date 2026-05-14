import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { listCampaigns } from "@/services/outreach-service";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  ACTIVE: "Aktif",
  COMPLETED: "Tamamlandı",
};

const STATUS_TONE: Record<string, "default" | "success" | "warning"> = {
  DRAFT: "default",
  ACTIVE: "warning",
  COMPLETED: "success",
};

export default async function CampaignsPage() {
  const { databaseAvailable, campaigns } = await listCampaigns();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          WhatsApp Outreach
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Kampanyalar</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Ürün ve kategori bazlı WhatsApp kampanyalarınızı yönetin.
        </p>
      </div>

      {!databaseAvailable ? (
        <Card className="border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Veritabanı geçici olarak kullanılamıyor.
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-500">Henüz kampanya oluşturulmadı.</p>
          <p className="mt-2 text-xs text-slate-400">
            Ürün veya kategori detay sayfasından kampanya başlatabilirsiniz.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`}>
              <Card className="flex items-center justify-between p-4 hover:border-slate-300 transition">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {c.product?.name ?? c.category?.name ?? "Kampanya"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{formatDateTime(c.createdAt)}</p>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-1">{c.message.slice(0, 80)}…</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge tone={STATUS_TONE[c.status] ?? "default"}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </Badge>
                  <Badge>{c._count.recipients} alıcı</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
