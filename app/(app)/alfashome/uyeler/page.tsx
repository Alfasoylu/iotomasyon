import { CircleAlert, Users } from "lucide-react";

import { AlfasBaglantiHatasi } from "@/components/alfashome/baglanti-hatasi";
import { EmptyState } from "@/components/layout/empty-state";
import { KpiCard } from "@/components/layout/kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { alfasPara, fetchAlfasMembers } from "@/lib/alfashome/client";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

/**
 * ALFAS Home üyeleri — SALT OKUNUR.
 *
 * ⚠️ "ÜYE" = ALFAS MÜŞTERİ KAYDI, hepsi hesap açmış değil. Üç yoldan kayıt
 * oluşuyor: sitede hesap açan müşteri, misafir olarak sipariş veren (Medusa
 * siparişte kayıt açar) ve **e-posta katmanına abone olan** kişi. Bu yüzden
 * tabloda "Tür" kolonu var ve KPI satırı üçünü ayrı sayıyor: "482 üye" yazıp
 * bunların çoğunun yalnız e-posta bırakmış olduğunu gizlemek, listeyi olduğundan
 * değerli gösterirdi.
 *
 * ⚠️ HER İSTEKTE TAZE — bayat üye listesi, gönderilen kampanyanın kime
 * gittiğini yanlış gösterir.
 */
export const dynamic = "force-dynamic";

export default async function AlfasUyelerPage() {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Bu sayfa için yetkiniz yok"
        hint="ALFAS üyeleri için `executive.read` izni gerekir."
      />
    );
  }

  const sonuc = await fetchAlfasMembers(200);

  const th =
    "py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]";
  const thR = th.replace("text-left", "text-right");
  const td = "py-3 px-4";
  const tdR = "py-3 px-4 text-right tabular-nums";

  /** Kayıt türü: hesap / alıcı / abone. Kod tahmin etmez, alanlara bakar. */
  function tur(u: { hesap_var: boolean; siparis_adet: number; kaynak: string | null }) {
    if (u.hesap_var) return "Hesaplı üye";
    if (u.siparis_adet > 0) return "Misafir alıcı";
    if (u.kaynak === "eposta-katmani") return "E-posta abonesi";
    return "Kayıt";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        breadcrumb={[{ label: "ALFAS Home" }, { label: "Üyeler" }]}
        title="ALFAS Home Üyeleri"
        subtitle="alfashome.com müşteri kayıtları: hesap açanlar, misafir alıcılar ve e-posta aboneleri. Yalnız okuma."
      />

      {!sonuc.ok ? (
        <AlfasBaglantiHatasi hata={sonuc.hata} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Kayıt"
              value={sonuc.adet.toLocaleString("tr-TR")}
              hint="Son 200 kayıt listelenir"
            />
            <KpiCard
              label="Hesaplı üye"
              value={sonuc.hesapli.toLocaleString("tr-TR")}
              hint="Sitede şifre belirleyip hesap açanlar"
            />
            <KpiCard
              label="Alıcı"
              value={sonuc.alici.toLocaleString("tr-TR")}
              tone={sonuc.alici > 0 ? "success" : "neutral"}
              hint="En az bir siparişi olan kayıt"
            />
            <KpiCard
              label="Toplam harcama"
              value={alfasPara(
                sonuc.uyeler.reduce((s, u) => s + u.harcama, 0),
                "try"
              )}
              hint="Listelenen kayıtların sipariş toplamı"
            />
          </div>

          {sonuc.uyeler.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Henüz üye yok"
              hint="Bağlantı çalışıyor; ALFAS tarafında kayıtlı müşteri bulunmuyor."
            />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                    <th className={th}>Üye</th>
                    <th className={th}>Tür</th>
                    <th className={th}>Kayıt</th>
                    <th className={thR}>Sipariş</th>
                    <th className={thR}>Harcama</th>
                    <th className={th}>Son sipariş</th>
                  </tr>
                </thead>
                <tbody>
                  {sonuc.uyeler.map((u) => (
                    <tr key={u.id} className="border-b border-[var(--border-subtle)] align-top">
                      <td className={td}>
                        <div>{u.ad ?? u.eposta ?? "—"}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">
                          {[u.ad ? u.eposta : null, u.telefon].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className={`${td} text-[var(--text-secondary)]`}>{tur(u)}</td>
                      <td className={`${td} whitespace-nowrap text-[var(--text-secondary)]`}>
                        {u.kayit ? formatDateTime(new Date(u.kayit)) : "—"}
                      </td>
                      <td className={tdR}>{u.siparis_adet || "—"}</td>
                      <td className={`${tdR} ${u.harcama > 0 ? "font-medium" : ""}`}>
                        {u.harcama > 0 ? alfasPara(u.harcama, "try") : "—"}
                      </td>
                      <td className={`${td} whitespace-nowrap text-[var(--text-secondary)]`}>
                        {u.son_siparis ? formatDateTime(new Date(u.son_siparis)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <p className="text-xs text-[var(--text-tertiary)]">
            {formatDateTime(sonuc.guncellendi)} itibarıyla · Kaynak: alfashome.com (salt okunur) ·
            Sipariş sayısı ve harcama, kayıt ile siparişler müşteri kimliği ya da e-posta üzerinden
            eşleştirilerek hesaplanır.
          </p>
        </>
      )}
    </div>
  );
}
