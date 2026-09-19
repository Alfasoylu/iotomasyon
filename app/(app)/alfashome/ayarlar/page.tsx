import { CircleAlert, Settings } from "lucide-react";

import { AlfasAyarFormu } from "@/components/alfashome/ayar-formu";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { alfasBaglanti, envBaglanti, tokenIpucu } from "@/lib/alfashome/config";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

/**
 * ALFAS Home bağlantı ayarları.
 *
 * NEDEN BU SAYFA VAR: adres ve jeton env değişkeni olarak tutulunca her
 * değişiklik Vercel paneline girmeyi ve yeniden dağıtım beklemeyi
 * gerektiriyordu. Trendyol/Hepsiburada kimlik bilgileri de veritabanında
 * (aynı mimari); buradan kaydedilen değer ANINDA geçerli olur.
 *
 * ⚠️ KAYITLI JETON EKRANA/HTML'E BASILMAZ — yalnız "kayıtlı" ve son 4 hane
 * görünür (bkz. lib/alfashome/config.ts → tokenIpucu).
 */
export const dynamic = "force-dynamic";

export default async function AlfasAyarlarPage() {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Bu sayfa için yetkiniz yok"
        hint="ALFAS bağlantı ayarları için `executive.read` izni gerekir."
      />
    );
  }

  let kayit: { baseUrl: string; token: string; isEnabled: boolean; lastOkAt: Date | null; updatedAt: Date } | null =
    null;
  try {
    kayit = await prisma.alfashomeConfig.findUnique({ where: { id: "singleton" } });
  } catch {
    // Tablo yok / DB erişilemedi → form boş açılır, env yedeği gösterilir.
  }

  const etkin = await alfasBaglanti();
  const env = envBaglanti();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={Settings}
        breadcrumb={[{ label: "ALFAS Home" }, { label: "Ayarlar" }]}
        title="ALFAS Home Bağlantısı"
        subtitle="Sipariş ve üye sayfalarının okuduğu salt okunur bağlantı. Panel ALFAS'ta hiçbir şey değiştiremez."
      />

      {/* Durum şeridi: hangi kaynak etkin, en son ne zaman çalıştı. */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium"
          style={
            etkin.kaynak
              ? { color: "var(--ok)", borderColor: "var(--ok-border)", background: "var(--ok-dim)" }
              : { color: "var(--text-muted)", borderColor: "var(--border-subtle)" }
          }
        >
          {etkin.kaynak === "panel"
            ? "Panel ayarı etkin"
            : etkin.kaynak === "env"
              ? "Ortam değişkeni etkin"
              : "Bağlantı yapılandırılmadı"}
        </span>
        {kayit?.lastOkAt && (
          <span className="text-xs text-[var(--text-muted)]">
            Son başarılı okuma: {formatDateTime(new Date(kayit.lastOkAt))}
          </span>
        )}
        {kayit?.updatedAt && (
          <span className="text-xs text-[var(--text-muted)]">
            Son kayıt: {formatDateTime(new Date(kayit.updatedAt))}
          </span>
        )}
      </div>

      <Card className="p-6">
        <AlfasAyarFormu
          initialValues={{
            baseUrl: kayit?.baseUrl || env.baseUrl || "",
            isEnabled: kayit?.isEnabled ?? false,
            tokenVar: Boolean(kayit?.token),
            tokenIpucu: kayit?.token ? tokenIpucu(kayit.token) : "",
          }}
        />
      </Card>

      <Card className="space-y-3 p-6">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          Jeton nereden geliyor?
        </p>
        <ol className="list-inside list-decimal space-y-1.5 text-sm text-[var(--text-secondary)]">
          <li>
            Rastgele bir dizi üretin (32+ karakter). ALFAS 24 karakterden kısa jetonu bilerek
            reddeder — kısa jeton kaba kuvvetle denenebilir.
          </li>
          <li>
            ALFAS tarafında Railway → Variables → <code>CRM_API_TOKEN</code> olarak kaydedin.
          </li>
          <li>Aynı değeri yukarıdaki alana yazıp kaydedin, sonra “Bağlantıyı dene”.</li>
        </ol>
        <p className="text-xs text-[var(--text-tertiary)]">
          Bu jeton ALFAS&apos;ta yalnız <code>/crm/orders</code> ve <code>/crm/members</code>{" "}
          uçlarını açar (sipariş/üye okuma). Medusa admin anahtarı DEĞİLDİR; ürün silme, fiyat
          değiştirme veya iade yetkisi vermez.
        </p>
        {env.baseUrl && !kayit?.isEnabled && (
          <p className="text-xs text-[var(--text-tertiary)]">
            Şu an ortam değişkenleri kullanılıyor ({env.baseUrl}). Buradan kaydedeceğiniz ayar
            onların önüne geçer.
          </p>
        )}
      </Card>
    </div>
  );
}
