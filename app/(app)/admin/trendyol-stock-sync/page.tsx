/**
 * Phase 45 — Trendyol Stock Sync (DEVRE DIŞI)
 *
 * Architecture correction (Priority 23):
 * Trendyol is a READ-ONLY data source for this application.
 * Stock quantities are managed by Entegra ERP via XML sync.
 * Pushing stock to Trendyol from this app conflicts with that architecture.
 *
 * This page is intentionally locked. The push action is disabled.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TrendyolStockSyncPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Yönetim / Trendyol</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Trendyol Stok Senkronu</h1>
      </div>

      <Card className="border-amber-200 bg-amber-50 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm font-semibold text-amber-800">Bu özellik mimari gerekçeyle devre dışı bırakıldı</p>
        </div>
        <div className="space-y-2 text-sm text-amber-700 leading-relaxed">
          <p>
            Bu uygulama Trendyol&apos;a stok veya fiyat <strong>yazmaz</strong>.
            Trendyol yalnızca <strong>okuma kaynağı</strong> olarak kullanılır
            — sipariş, iade ve katalog verisi bu yönde çekilir.
          </p>
          <p>
            Stok yönetiminin kaynağı <strong>Entegra ERP</strong>&apos;dir.
            Stok sayıları XML senkronizasyonu aracılığıyla Entegra&apos;dan güncellenir.
          </p>
          <p className="text-xs text-amber-600">
            Bu sayfayı kullanmak yerine stok hareketlerini Entegra ERP üzerinden yönetin.
            Stok durumunu izlemek için Stok Sağlığı sayfasını kullanabilirsiniz.
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <Link href="/admin/stock-health">
            <Button variant="secondary" className="text-amber-800 border-amber-300 bg-amber-100 hover:bg-amber-200">
              Stok Sağlığı →
            </Button>
          </Link>
          <Link href="/admin/xml-sync">
            <Button variant="secondary" className="text-amber-800 border-amber-300 bg-amber-100 hover:bg-amber-200">
              XML Senkronizasyonu →
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
