/**
 * /admin/procurement — 10.09.2026'da emekliye ayrıldı.
 *
 * "Tedarik Asistanı" aciliyete göre sıralı bir yeniden-sipariş listesiydi
 * (suggestedQty / suggestedCost). Panelde aynı soruya cevap veren sekiz yerden
 * biriydi; hesabı Trendyol'un 30 günlük satışından türetiyordu ve CFO'nun karar
 * defterini (cfo_order_line) okumuyordu. Sıradaki sipariş kararı /cfo/kazananlar'da
 * toplandı: orada hava ve deniz partileri ayrı durur, tavsiye edilen sipariş
 * tarihi, minimum ithalat tutarı ve nakit kapısı birlikte hesaplanır.
 *
 * Sayfa silinmedi; kayıtlı yer imleri ve eski bağlantılar buraya geliyor.
 * `lib/procurement.ts` duruyor — satın alma siparişi formu onu kullanmaya devam ediyor.
 */
import Link from "next/link";
import { Handshake, ArrowRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ImportOrderPointer } from "@/components/cfo/import-order-pointer";

export const dynamic = "force-dynamic";

export default async function ProcurementRetiredPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  return (
    <>
      <PageHeader
        icon={Handshake}
        title="Tedarik Asistanı"
        subtitle="Bu sayfa taşındı — sıradaki sipariş kararı tek sayfada toplandı."
      />

      <Card className="space-y-4 p-5">
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Tedarik Asistanı, stok gününe göre sıralanmış bir yeniden-sipariş listesiydi.
          Aynı listeyi Sermaye Sağlığı, Yönetici Özeti, Sermaye Dağılımı ve pano da kendi
          hesabıyla üretiyordu; hangisinin bağlayıcı olduğu belli değildi. Karar artık tek
          yerde.
        </p>

        <ImportOrderPointer neydi="Tedarik Asistanı listesi" />

        <p className="text-[12px] text-[var(--text-muted)]">
          Satın alma siparişi oluşturmak için:{" "}
          <Link href="/admin/purchase-orders/new" className="text-[var(--accent)] hover:underline">
            Yeni Satın Alma Siparişi <ArrowRight size={11} className="inline" />
          </Link>
          . Ürün bazında navlun ve indirilmiş maliyet analizi için{" "}
          <Link href="/admin/import-cockpit" className="text-[var(--accent)] hover:underline">
            İthalat Karar Kokpiti <ArrowRight size={11} className="inline" />
          </Link>
          .
        </p>
      </Card>
    </>
  );
}
