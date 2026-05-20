import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { MessageTemplatesManager } from "@/components/admin/message-templates-manager";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function MessageTemplatesPage() {
  await requirePermission(PERMISSIONS.CAMPAIGNS_READ);

  const templates = await prisma.messageTemplate.findMany({
    orderBy: [{ isActive: "desc" }, { usageCount: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        icon={MessageSquare}
        breadcrumb={[{ label: "Yönetim" }, { label: "Mesaj Şablonları" }]}
        title="WhatsApp Mesaj Şablonları"
        subtitle="Sık kullandığın WhatsApp mesajlarını şablon olarak kaydet — müşteri detayında 1 tıkla doldur."
      />

      <Card className="p-4">
        <p className="text-xs text-slate-600">
          <strong>Kullanılabilir değişkenler:</strong>{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{"{{musteri_adi}}"}</code>{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{"{{firma}}"}</code>{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{"{{teklif_no}}"}</code>{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{"{{son_gorusme}}"}</code>{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{"{{telefon}}"}</code>{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{"{{sehir}}"}</code>
        </p>
      </Card>

      <MessageTemplatesManager templates={templates} />
    </div>
  );
}
