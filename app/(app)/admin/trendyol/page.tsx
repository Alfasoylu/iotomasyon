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
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Yönetim / Trendyol</p>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Trendyol API Yapılandırması</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Trendyol Satıcı API&apos;ye bağlanmak için kimlik bilgilerinizi girin. Yalnızca okuma işlemleri gerçekleştirilir.
        </p>
      </div>

      {/* Status badge */}
      {config && (
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${config.isEnabled ? "bg-[var(--ok-dim)] text-[var(--ok)] border-[var(--ok-border)]" : "bg-[var(--surface-3)] text-[var(--text-muted)] border-[var(--border-subtle)]"}`}>
            {config.isEnabled ? "Entegrasyon aktif" : "Entegrasyon pasif"}
          </span>
          {config.supplierId && (
            <span className="text-xs text-[var(--text-muted)]">Satıcı ID: <span className="font-mono tabular-nums text-[var(--text-secondary)]">{config.supplierId}</span></span>
          )}
          <span className="text-xs text-[var(--text-muted)]">Son güncelleme: {fmt(config.updatedAt)}</span>
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
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Nasıl bulunur?</p>
        <ol className="space-y-1.5 text-sm text-[var(--text-secondary)] list-decimal list-inside">
          <li>Trendyol Satıcı Paneli&apos;ne giriş yapın (satici.trendyol.com)</li>
          <li>Sağ üst köşede profil → <strong>Hesap Bilgileri</strong> seçin</li>
          <li><strong>API Bilgileri</strong> sekmesine gidin</li>
          <li>API Kullanıcı Adı → API Anahtarı, API Şifresi → Gizli Anahtar</li>
          <li>Satıcı ID, panel URL&apos;sindeki sayısal değerdir</li>
        </ol>
      </Card>
    </div>
  );
}
