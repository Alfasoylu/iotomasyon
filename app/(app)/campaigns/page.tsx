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

function FunnelBar({ sent, total }: { sent: number; total: number }) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-slate-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400">{pct}% gönderildi</span>
    </div>
  );
}

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
          {campaigns.map((c) => {
            const { funnel } = c;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <Card className="p-4 hover:border-slate-300 transition">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: name + date + message */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {c.product?.name ?? c.category?.name ?? "Kampanya"}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(c.createdAt)}</p>
                      <FunnelBar sent={funnel.sent} total={funnel.total} />
                    </div>

                    {/* Right: conversion stats */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <Badge tone={STATUS_TONE[c.status] ?? "default"}>
                        {STATUS_LABELS[c.status] ?? c.status}
                      </Badge>
                      <Badge>{funnel.total} alıcı</Badge>
                      {funnel.replied > 0 && (
                        <Badge tone="default">
                          {funnel.replied} cevap
                        </Badge>
                      )}
                      {funnel.quoted > 0 && (
                        <Badge tone="warning">
                          {funnel.quoted} teklif
                        </Badge>
                      )}
                      {funnel.won > 0 && (
                        <Badge tone="success">
                          {funnel.won} kazanıldı
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Revenue line */}
                  {funnel.revenue > 0 ? (
                    <p className="mt-2 text-xs font-semibold text-emerald-700">
                      💰 {funnel.revenue.toLocaleString("tr-TR")} {c.product ? "TRY" : ""}
                    </p>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
