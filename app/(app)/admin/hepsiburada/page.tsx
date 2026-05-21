import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { HepsiburadaConfigForm } from "@/components/hepsiburada/hepsiburada-config-form";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

export default async function HepsiburadaAdminPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const config = await prisma.hepsiburadaConfig.findUnique({ where: { id: "singleton" } });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          Yönetim / Hepsiburada
        </p>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Hepsiburada API Yapılandırması
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Hepsiburada Marketplace API&apos;ye bağlanmak için kimlik bilgilerinizi girin.
          Yalnızca okuma işlemleri gerçekleştirilir — ürün/stok/fiyat push Entegra
          üzerinden gönderilir.
        </p>
      </div>

      {/* Status */}
      {config && (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${
              config.isEnabled
                ? "bg-[var(--ok-dim)] text-[var(--ok)] border-[var(--ok-border)]"
                : "bg-[var(--surface-3)] text-[var(--text-muted)] border-[var(--border-subtle)]"
            }`}
          >
            {config.isEnabled ? "Entegrasyon aktif" : "Entegrasyon pasif"}
          </span>
          {config.merchantId && (
            <span className="text-xs text-[var(--text-muted)]">
              Mağaza ID:{" "}
              <span className="font-mono tabular-nums text-[var(--text-secondary)] break-all">{config.merchantId}</span>
            </span>
          )}
          <span className="text-xs text-[var(--text-muted)]">Son güncelleme: {fmt(config.updatedAt)}</span>
          {config.lastSyncAt && (
            <span className="text-xs text-[var(--text-muted)]">Son senkron: {fmt(config.lastSyncAt)}</span>
          )}
        </div>
      )}

      <Card className="p-6">
        <HepsiburadaConfigForm
          initialValues={{
            merchantId: config?.merchantId ?? "",
            username: config?.username ?? "",
            password: config?.password ?? "",
            storeName: config?.storeName ?? "",
            isEnabled: config?.isEnabled ?? false,
          }}
        />
      </Card>

      {/* Info */}
      <Card className="p-6 space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          Nasıl bulunur?
        </p>
        <ol className="space-y-1.5 text-sm text-[var(--text-secondary)] list-decimal list-inside">
          <li>
            Hepsiburada Mağaza Yönetim Paneli&apos;ne giriş yapın (merchant.hepsiburada.com)
          </li>
          <li>Sol menüden <strong>Entegrasyon</strong> &rarr; <strong>Entegratör Bilgileri</strong></li>
          <li>
            <strong>Mağaza ID</strong> sayfanın üst kısmında UUID formatında görünür
            (örn. <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-xs font-mono">ed812a85-…</code>)
          </li>
          <li>
            <strong>Entegratörlerim</strong> bölümünde mevcut entegratörü seçin ya da{" "}
            <strong>Entegratör ekle</strong> ile yeni bir tane oluşturun
          </li>
          <li>
            <strong>Servis Anahtarı</strong> butonuna tıklayın → username + password
            karşınıza çıkar. Yeni oluşturulan entegratör <strong>Beklemede</strong> ise
            Hepsiburada tarafından onaylanmasını bekleyin (genelde 1-2 iş günü).
          </li>
          <li>
            Bu sayfaya geri dönüp 3 değeri girin, <strong>Kaydet</strong> sonra{" "}
            <strong>Bağlantıyı test et</strong>.
          </li>
        </ol>
        <p className="text-xs text-[var(--text-muted)] mt-2">
          Bağlantı testi <code className="font-mono">mpop.hepsiburada.com/product/api/products/all-products-of-merchant/&#123;merchantId&#125;</code>{" "}
          endpoint&apos;ine 1 ürünlük çağrı atar.
        </p>
      </Card>
    </div>
  );
}
