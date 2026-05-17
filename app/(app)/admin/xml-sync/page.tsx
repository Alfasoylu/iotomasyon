/**
 * Phase 11 — XML Inventory Sync Admin Page
 *
 * Shows all configured XML sync sources with their last sync status,
 * per-source sync log, and controls to add/edit/trigger/delete sources.
 */

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { XmlSyncForm, NewXmlSourceForm } from "@/components/xml-sync/xml-sync-form";

export const dynamic = "force-dynamic";

// Allow Server Actions on this page up to 300 seconds (Vercel Pro limit).
// Without this, the default 10s Hobby limit causes large syncs to time out.
export const maxDuration = 300;

const STATUS_LABELS: Record<string, string> = {
  RUNNING: "Çalışıyor",
  SUCCESS: "Başarılı",
  PARTIAL: "Kısmi",
  ERROR: "Hata",
};

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "bg-blue-100 text-blue-700",
  SUCCESS: "bg-emerald-100 text-emerald-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  ERROR: "bg-red-100 text-red-700",
};

function fmt(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700">
        ↑ +{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700">
        ↓ {delta}
      </span>
    );
  }
  return <span className="text-slate-300 text-xs">—</span>;
}

export default async function XmlSyncPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const [sources, recentChanges] = await Promise.all([
    prisma.xmlSyncSource.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        logs: {
          orderBy: { startedAt: "desc" },
          take: 5,
        },
      },
    }),
    prisma.xmlStockChangeLog.findMany({
      orderBy: { syncedAt: "desc" },
      take: 100,
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    }),
  ]);

  // Group changes by syncLogId to show latest sync's changes
  const latestSyncLogId = recentChanges[0]?.syncLogId ?? null;
  const latestSyncChanges = latestSyncLogId
    ? recentChanges.filter((c) => c.syncLogId === latestSyncLogId)
    : [];
  const latestSyncAt = recentChanges[0]?.syncedAt ?? null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Yönetim</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">XML Envanter Senkronizasyonu</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          XML kaynaklarını yapılandırın, senkronizasyon geçmişini görüntüleyin ve manuel senkronizasyon başlatın.
          Otomatik senkronizasyon günde bir kez çalışır (02:00 UTC). Manuel tetikleme her zaman mümkündür.
        </p>
      </div>

      {/* Sources */}
      {sources.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-500">Henüz XML kaynağı eklenmemiş.</p>
          <p className="mt-1 text-xs text-slate-400">Aşağıdan yeni kaynak ekleyin.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {sources.map((source) => (
            <Card key={source.id} className="p-6 space-y-6">
              {/* Source header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{source.name}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${source.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {source.isEnabled ? "Aktif" : "Pasif"}
                    </span>
                    {source.lastStatus && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[source.lastStatus] ?? "bg-slate-100 text-slate-500"}`}>
                        {STATUS_LABELS[source.lastStatus] ?? source.lastStatus}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-mono text-slate-400 break-all">{source.url}</p>
                  <p className="mt-1 text-xs text-slate-400">Son senkronizasyon: {fmt(source.lastSyncAt)}</p>
                </div>
              </div>

              {/* Edit form */}
              <XmlSyncForm
                source={{
                  id: source.id,
                  name: source.name,
                  url: source.url,
                  secondaryUrl: source.secondaryUrl ?? null,
                  isEnabled: source.isEnabled,
                  authHeader: source.authHeader,
                  lastSyncAt: source.lastSyncAt,
                  lastStatus: source.lastStatus,
                }}
              />

              {/* Sync log */}
              {source.logs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
                    Son senkronizasyon geçmişi
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-slate-600 border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="py-2 pr-4 text-left text-slate-400 font-semibold uppercase tracking-wide">Başlangıç</th>
                          <th className="py-2 pr-4 text-left text-slate-400 font-semibold uppercase tracking-wide">Bitiş</th>
                          <th className="py-2 pr-4 text-left text-slate-400 font-semibold uppercase tracking-wide">Durum</th>
                          <th className="py-2 pr-4 text-right text-slate-400 font-semibold uppercase tracking-wide">Bulunan</th>
                          <th className="py-2 pr-4 text-right text-slate-400 font-semibold uppercase tracking-wide">Oluşturulan</th>
                          <th className="py-2 pr-4 text-right text-slate-400 font-semibold uppercase tracking-wide">Güncellenen</th>
                          <th className="py-2 text-right text-slate-400 font-semibold uppercase tracking-wide">Atlanan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {source.logs.map((log) => (
                          <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="py-2 pr-4 font-mono">{fmt(log.startedAt)}</td>
                            <td className="py-2 pr-4 font-mono">{fmt(log.completedAt)}</td>
                            <td className="py-2 pr-4">
                              <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[log.status] ?? "bg-slate-100 text-slate-500"}`}>
                                {STATUS_LABELS[log.status] ?? log.status}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-right">{log.recordsFound}</td>
                            <td className="py-2 pr-4 text-right text-blue-600 font-medium">{log.recordsCreated}</td>
                            <td className="py-2 pr-4 text-right text-emerald-600 font-medium">{log.recordsUpdated}</td>
                            <td className="py-2 text-right text-slate-400">{log.recordsSkipped}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {source.logs.find((l) => l.errorMessage) && (
                      <p className="mt-2 text-xs text-red-500">
                        Hata: {source.logs.find((l) => l.errorMessage)?.errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add new source */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Yeni kaynak ekle</p>
          <p className="mt-1 text-sm text-slate-600">
            Yeni bir XML kaynağı tanımlayın. Kaynak eklendikten sonra manuel veya otomatik senkronizasyon çalışabilir.
          </p>
        </div>
        <NewXmlSourceForm />
      </Card>

      {/* Son Değişimler — Phase 49 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Son Senkronizasyon Değişimleri</h2>
          {latestSyncAt && (
            <span className="text-xs text-slate-400">{fmt(latestSyncAt)}</span>
          )}
        </div>

        {latestSyncChanges.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-slate-400">
              {recentChanges.length === 0
                ? "Henüz stok değişim kaydı yok. Senkronizasyon çalıştıktan sonra burada görünecek."
                : "Son senkronizasyonda stok değişimi yapılmadı."}
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {latestSyncChanges.length} ürün değişti
              </span>
              <span className="text-xs text-slate-400">
                Artış: {latestSyncChanges.filter((c) => c.delta > 0).length} · Azalış: {latestSyncChanges.filter((c) => c.delta < 0).length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
                    <th className="py-2 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">SKU</th>
                    <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Önceki</th>
                    <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Yeni</th>
                    <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Değişim</th>
                  </tr>
                </thead>
                <tbody>
                  {latestSyncChanges.map((change) => (
                    <tr key={change.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2 px-4 text-xs text-slate-700 max-w-[200px] truncate">
                        <a href={`/products/${change.product.id}`} className="hover:underline hover:text-slate-900">
                          {change.product.name}
                        </a>
                      </td>
                      <td className="py-2 px-4 font-mono text-xs text-slate-500">{change.product.sku}</td>
                      <td className="py-2 px-4 text-xs text-right text-slate-500">{change.previousQty}</td>
                      <td className="py-2 px-4 text-xs text-right font-medium text-slate-800">{change.newQty}</td>
                      <td className="py-2 px-4 text-right">
                        <DeltaBadge delta={change.delta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Info */}
      <Card className="border-blue-200 bg-blue-50 p-6">
        <p className="text-sm font-semibold text-blue-800 mb-2">Senkronizasyon davranışı (Phase 11A)</p>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>Feed&apos;de bulunan ancak veritabanında olmayan SKU&apos;lar için <strong>yeni ürün oluşturulur</strong> (xmlImported=true).</li>
          <li>Üründe <strong>XML kilidi</strong> aktifse ürün alanları atlanır; ancak XML anlık görüntüsü yine güncellenir.</li>
          <li>Stok kaynağı <strong>Manuel giriş</strong> olan ürünlerin stoğu güncellenmez.</li>
          <li>Her ürünün <strong>resim1–resim5</strong> görselleri ProductImage tablosunda saklanır.</li>
          <li>Önceki feed&apos;de görülen ancak güncel feed&apos;de olmayan ürünler <strong>eksik</strong> olarak işaretlenir (silinmez).</li>
          <li>Ham XML fiyatları (USD) XmlProductData tablosunda saklanır; ürün fiyat alanlarına yazılmaz.</li>
          <li>Otomatik senkronizasyon günde bir kez 02:00 UTC&apos;de çalışır (Vercel Cron).</li>
        </ul>
      </Card>
    </div>
  );
}
