import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { TrendyolConfigForm } from "@/components/trendyol/trendyol-config-form";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

export default async function TrendyolAdminPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const config = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Yönetim / Trendyol</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Trendyol API Yapılandırması</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Trendyol Satıcı API'ye bağlanmak için kimlik bilgilerinizi girin. Yalnızca okuma işlemleri gerçekleştirilir.
        </p>
      </div>

      {/* Status badge */}
      {config && (
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${config.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {config.isEnabled ? "Entegrasyon aktif" : "Entegrasyon pasif"}
          </span>
          {config.supplierId && (
            <span className="text-xs text-slate-400">Satıcı ID: <span className="font-mono text-slate-600">{config.supplierId}</span></span>
          )}
          <span className="text-xs text-slate-400">Son güncelleme: {fmt(config.updatedAt)}</span>
        </div>
      )}

      <Card className="p-6">
        <TrendyolConfigForm
          initialValues={{
            supplierId: config?.supplierId ?? "",
            apiKey: config?.apiKey ?? "",
            apiSecret: config?.apiSecret ?? "",
            isEnabled: config?.isEnabled ?? false,
          }}
        />
      </Card>

      {/* Info card */}
      <Card className="p-6 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Nasıl bulunur?</p>
        <ol className="space-y-1.5 text-sm text-slate-600 list-decimal list-inside">
          <li>Trendyol Satıcı Paneli'ne giriş yapın (satici.trendyol.com)</li>
          <li>Sağ üst köşede profil → <strong>Hesap Bilgileri</strong> seçin</li>
          <li><strong>API Bilgileri</strong> sekmesine gidin</li>
          <li>API Kullanıcı Adı → API Anahtarı, API Şifresi → Gizli Anahtar</li>
          <li>Satıcı ID, panel URL'sindeki sayısal değerdir</li>
        </ol>
      </Card>
    </div>
  );
}
