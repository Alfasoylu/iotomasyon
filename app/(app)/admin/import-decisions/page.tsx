/**
 * /admin/import-decisions — 10.09.2026'da emekliye ayrıldı.
 *
 * Bu sayfa Karar Kokpiti'nin "v1 görünümü"ydü: her aktif ürün için hava/deniz
 * navlun ekonomisi ve satın alma önerisi. Öneri kısmı, panelde aynı soruya cevap
 * veren sekiz yerden biriydi ve Trendyol 90 günlük satışından kendi başına
 * türetiyordu — CFO'nun fiilen karar verdiği parti defterini (cfo_order_line)
 * okumuyordu. Sıradaki sipariş kararı /cfo/kazananlar'da toplandı.
 *
 * Sayfa silinmedi, çünkü kayıtlı yer imleri ve eski bağlantılar buraya geliyor:
 * sessizce başka yere atmak yerine ne olduğunu söyleyip yönlendiriyoruz.
 * Ürün bazında navlun/maliyet analizi Karar Kokpiti'nde duruyor.
 */
import Link from "next/link";
import { FileSearch, ArrowRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ImportOrderPointer } from "@/components/cfo/import-order-pointer";

export const dynamic = "force-dynamic";

export default async function ImportDecisionsRetiredPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  return (
    <>
      <PageHeader
        icon={FileSearch}
        title="İthalat Kararları"
        subtitle="Bu sayfa taşındı — sıradaki sipariş kararı tek sayfada toplandı."
      />

      <Card className="space-y-4 p-5">
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Bu sayfa Karar Kokpiti&apos;nin eski (v1) görünümüydü ve satın alma önerisini
          Trendyol&apos;un 90 günlük satışından kendi başına hesaplıyordu. Aynı soruya panelde
          sekiz ayrı yerde farklı cevap çıkıyordu. Karar artık tek yerde üretiliyor.
        </p>

        <ImportOrderPointer neydi="İthalat Kararları (v1)" />

        <p className="text-[12px] text-[var(--text-muted)]">
          Ürün bazında hava/deniz navlun ve indirilmiş maliyet analizi yerinde duruyor:{" "}
          <Link href="/admin/import-cockpit" className="text-[var(--accent)] hover:underline">
            İthalat Karar Kokpiti <ArrowRight size={11} className="inline" />
          </Link>
          . Tek bir ürünün karar anlık görüntüsünü almak için ürün detay sayfasını kullanın.
        </p>
      </Card>
    </>
  );
}
