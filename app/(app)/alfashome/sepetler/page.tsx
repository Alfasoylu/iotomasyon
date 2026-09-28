import { CircleAlert, ShoppingBasket } from "lucide-react";

import { AlfasBaglantiHatasi } from "@/components/alfashome/baglanti-hatasi";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { SepetGovdesi } from "@/components/alfashome/sepet-govdesi";
import { fetchAlfasCarts } from "@/lib/alfashome/client";
import { gosterParam, siralaParam } from "@/lib/alfashome/sepetler";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

/**
 * ALFAS Home SEPETLER — terk edilen ve sepette bekleyen ürünler. SALT OKUNUR.
 *
 * Bu sayfa mail GÖNDERMEZ, sepete dokunmaz. "Mail gitti mi / ne zaman gidecek /
 * gecikti mi" kararını ALFAS verir (mail gönderen job ile AYNI fonksiyonlar —
 * bkz. lib/alfashome/sepetler.ts); panel yalnız gösterir.
 *
 * ⚠️ "KAYITLI" = ŞİFRELİ HESABI OLAN. ALFAS sepete e-posta yazılınca misafir bir
 * müşteri kaydı da açar; kaydı olan herkes üye değildir. Üyelik kararı ALFAS'ta
 * `has_account`'a bakarak verilir, sorgu başarısız olursa "bilinmiyor" döner.
 *
 * ⚠️ HER İSTEKTE TAZE — bayat sepet listesi, "az önce bıraktı"yı "saatlerdir
 * yok" gösterir ve operatör aktif müşteriyi arar.
 *
 * ⚠️ HER AÇILIŞ ALFAS'IN VERİTABANINI UYANDIRIR (25.09.2026'da aylık compute payı
 * bu türden sürekli sorgularla tükenmişti). Bu yüzden sayfa kendini YENİLEMEZ
 * (otomatik yenileme yok) ve ALFAS tarafı taramayı pencereyle sınırlar.
 */
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ goster?: string; sirala?: string }> };

export default async function AlfasSepetlerPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Bu sayfa için yetkiniz yok"
        hint="ALFAS sepetleri için `executive.read` izni gerekir."
      />
    );
  }

  const sp = await searchParams;
  const goster = gosterParam(sp.goster);
  const sirala = siralaParam(sp.sirala);

  const sonuc = await fetchAlfasCarts(200, 30);

  const th =
    "py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]";
  const thR = th.replace("text-left", "text-right");
  const td = "py-3 px-4";
  const tdR = "py-3 px-4 text-right tabular-nums";
  const tarih = (iso: string) => formatDateTime(new Date(iso));

  const href = (g: string, s: string) =>
    `/alfashome/sepetler?goster=${g}${s !== "yeni" ? `&sirala=${s}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingBasket}
        breadcrumb={[{ label: "ALFAS Home" }, { label: "Sepetler" }]}
        title="ALFAS Home Sepetleri"
        subtitle="alfashome.com'da terk edilen ve sepette bekleyen ürünler: kayıtlı/kayıtsız ayrımı ve hatırlatma maili durumu. Yalnız okuma."
      />

      {!sonuc.ok ? (
        <AlfasBaglantiHatasi hata={sonuc.hata} />
      ) : (
        <SepetGovdesi
          sonuc={sonuc}
          goster={goster}
          sirala={sirala}
          th={th}
          thR={thR}
          td={td}
          tdR={tdR}
          tarih={tarih}
          href={href}
        />
      )}
    </div>
  );
}
