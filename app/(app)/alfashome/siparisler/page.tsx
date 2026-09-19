import { CircleAlert, Package, ShoppingCart } from "lucide-react";

import { AlfasBaglantiHatasi } from "@/components/alfashome/baglanti-hatasi";
import { EmptyState } from "@/components/layout/empty-state";
import { KpiCard } from "@/components/layout/kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import {
  alfasPara,
  fetchAlfasOrders,
  odemeEtiketi,
} from "@/lib/alfashome/client";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

/**
 * ALFAS Home siparişleri — SALT OKUNUR.
 *
 * Veri ALFAS mağazasının Medusa arka ucundan, salt okunur `/crm/orders`
 * ucundan geliyor (bkz. lib/alfashome/client.ts). Panelden sipariş durumu
 * değiştirilemez, iade/iptal yapılamaz: o kararlar Medusa Admin'de bilerek
 * verilir ve geri alınamaz işlemlerin panelden yanlışlıkla tetiklenmemesi
 * gerekir (reklam panelindeki aynı ilke).
 *
 * ⚠️ HER İSTEKTE TAZE (`force-dynamic` + `cache: no-store`). Bayat sipariş
 * listesi "sipariş gelmemiş" diye okunur ve depo sevkiyatı gecikir.
 */
export const dynamic = "force-dynamic";

export default async function AlfasSiparislerPage() {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Bu sayfa için yetkiniz yok"
        hint="ALFAS siparişleri için `executive.read` izni gerekir."
      />
    );
  }

  const sonuc = await fetchAlfasOrders(50);

  const th =
    "py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]";
  const thR = th.replace("text-left", "text-right");
  const td = "py-3 px-4";
  const tdR = "py-3 px-4 text-right tabular-nums";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingCart}
        breadcrumb={[{ label: "ALFAS Home" }, { label: "Siparişler" }]}
        title="ALFAS Home Siparişleri"
        subtitle="alfashome.com üzerinden gelen son siparişler. Yalnız okuma — sipariş durumu, iade ve iptal Medusa Admin'den yönetilir."
      />

      {!sonuc.ok ? (
        <AlfasBaglantiHatasi hata={sonuc.hata} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Sipariş"
              value={sonuc.adet.toLocaleString("tr-TR")}
              hint="Son 50 sipariş listelenir"
            />
            <KpiCard label="Ciro (listelenen)" value={alfasPara(sonuc.ciro, sonuc.para)} />
            <KpiCard
              label="Ortalama sepet"
              value={
                sonuc.adet > 0 ? alfasPara(Math.round(sonuc.ciro / sonuc.adet), sonuc.para) : "—"
              }
              hint="Ciro ÷ sipariş"
            />
          </div>

          {sonuc.siparisler.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Henüz sipariş yok"
              hint="Bağlantı çalışıyor; ALFAS tarafında kayıtlı sipariş bulunmuyor."
            />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                    <th className={th}>Sipariş</th>
                    <th className={th}>Tarih</th>
                    <th className={th}>Müşteri</th>
                    <th className={th}>Ürünler</th>
                    <th className={thR}>Tutar</th>
                    <th className={th}>Ödeme</th>
                  </tr>
                </thead>
                <tbody>
                  {sonuc.siparisler.map((o) => {
                    const od = odemeEtiketi(o.odeme);
                    return (
                      <tr key={o.id} className="border-b border-[var(--border-subtle)] align-top">
                        <td className={`${td} tabular-nums`}>#{o.no ?? "—"}</td>
                        <td className={`${td} whitespace-nowrap text-[var(--text-secondary)]`}>
                          {o.tarih ? formatDateTime(new Date(o.tarih)) : "—"}
                        </td>
                        <td className={td}>
                          <div>{o.musteri ?? "—"}</div>
                          {/* E-posta ve şehir alt satırda: sevkiyat ve iletişim
                              için gereken asgari bilgi, ayrı sayfa gerekmesin. */}
                          <div className="text-xs text-[var(--text-tertiary)]">
                            {[o.eposta, o.sehir].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </td>
                        <td className={`${td} text-[var(--text-secondary)]`}>
                          {o.kalemler.length === 0
                            ? "—"
                            : o.kalemler.map((k) => `${k.adet}× ${k.ad}`).join(", ")}
                        </td>
                        <td className={`${tdR} font-medium`}>{alfasPara(o.tutar, o.para)}</td>
                        <td className={td}>
                          {/* Renk DURUM bildirir: ödenmemiş sipariş kargoya
                              verilmemeli, bu yüzden göze çarpıyor. */}
                          <span
                            className="text-xs font-medium"
                            style={{
                              color:
                                od.ton === "success"
                                  ? "var(--ok)"
                                  : od.ton === "danger"
                                    ? "var(--danger)"
                                    : od.ton === "warning"
                                      ? "var(--warn)"
                                      : undefined,
                            }}
                          >
                            {od.etiket}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          <p className="text-xs text-[var(--text-tertiary)]">
            {formatDateTime(sonuc.guncellendi)} itibarıyla · Kaynak: alfashome.com (salt okunur) ·
            Tutarlar KDV dahil.
          </p>
        </>
      )}
    </div>
  );
}
