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
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Yönetim / Hepsiburada
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Hepsiburada API Yapılandırması
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Hepsiburada Marketplace API&apos;ye bağlanmak için kimlik bilgilerinizi girin.
          Yalnızca okuma işlemleri gerçekleştirilir — ürün/stok/fiyat push Entegra
          üzerinden gönderilir.
        </p>
      </div>

      {/* Status */}
      {config && (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              config.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {config.isEnabled ? "Entegrasyon aktif" : "Entegrasyon pasif"}
          </span>
          {config.merchantId && (
            <span className="text-xs text-slate-400">
              Mağaza ID:{" "}
              <span className="font-mono text-slate-600 break-all">{config.merchantId}</span>
            </span>
          )}
          <span className="text-xs text-slate-400">Son güncelleme: {fmt(config.updatedAt)}</span>
          {config.lastSyncAt && (
            <span className="text-xs text-slate-400">Son senkron: {fmt(config.lastSyncAt)}</span>
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
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Nasıl bulunur?
        </p>
        <ol className="space-y-1.5 text-sm text-slate-600 list-decimal list-inside">
          <li>
            Hepsiburada Mağaza Yönetim Paneli&apos;ne giriş yapın (merchant.hepsiburada.com)
          </li>
          <li>Sol menüden <strong>Entegrasyon</strong> &rarr; <strong>Entegratör Bilgileri</strong></li>
          <li>
            <strong>Mağaza ID</strong> sayfanın üst kısmında UUID formatında görünür
            (örn. <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">ed812a85-…</code>)
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
        <p className="text-xs text-slate-400 mt-2">
          Bağlantı testi <code>mpop.hepsiburada.com/product/api/products/all-products-of-merchant/&#123;merchantId&#125;</code>{" "}
          endpoint&apos;ine 1 ürünlük çağrı atar.
        </p>
      </Card>
    </div>
  );
}
