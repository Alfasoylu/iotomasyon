/**
 * Phase 11 — XML Inventory Sync Admin Page
 *
 * Shows all configured XML sync sources with their last sync status,
 * per-source sync log, and controls to add/edit/trigger/delete sources.
 */

import { ArrowUp, ArrowDown } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const STATUS_VARIANT: Record<string, "info" | "ok" | "warn" | "danger"> = {
  RUNNING: "info",
  SUCCESS: "ok",
  PARTIAL: "warn",
  ERROR: "danger",
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
      <span className="inline-flex items-center gap-0.5 rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] px-1.5 py-0.5 text-xs font-semibold font-mono tabular-nums text-[var(--ok)]">
        <ArrowUp size={14} strokeWidth={1.5} /> +{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-1.5 py-0.5 text-xs font-semibold font-mono tabular-nums text-[var(--danger)]">
        <ArrowDown size={14} strokeWidth={1.5} /> {delta}
      </span>
    );
  }
  return <span className="text-[var(--text-muted)] text-xs">—</span>;
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
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Yönetim</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">XML Envanter Senkronizasyonu</h1>
        <p className="mt-1 text-sm leading-7 text-[var(--text-secondary)]">
          XML kaynaklarını yapılandırın, senkronizasyon geçmişini görüntüleyin ve manuel senkronizasyon başlatın.
          Otomatik senkronizasyon günde bir kez çalışır (02:00 UTC). Manuel tetikleme her zaman mümkündür.
        </p>
      </div>

      {/* Sources */}
      {sources.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">Henüz XML kaynağı eklenmemiş.</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Aşağıdan yeni kaynak ekleyin.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {sources.map((source) => (
            <Card key={source.id} className="p-6 space-y-6">
              {/* Source header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">{source.name}</h2>
                    <Badge variant={source.isEnabled ? "ok" : "neutral"}>
                      {source.isEnabled ? "Aktif" : "Pasif"}
                    </Badge>
                    {source.lastStatus && (
                      <Badge variant={STATUS_VARIANT[source.lastStatus] ?? "neutral"}>
                        {STATUS_LABELS[source.lastStatus] ?? source.lastStatus}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-mono tabular-nums text-[var(--text-muted)] break-all">{source.url}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)] tabular-nums">Son senkronizasyon: {fmt(source.lastSyncAt)}</p>
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
                  <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-3">
                    Son senkronizasyon geçmişi
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-[var(--text-secondary)] border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)]">
                          <th className="py-2 pr-4 text-left text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-widest">Başlangıç</th>
                          <th className="py-2 pr-4 text-left text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-widest">Bitiş</th>
                          <th className="py-2 pr-4 text-left text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-widest">Durum</th>
                          <th className="py-2 pr-4 text-right text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-widest">Bulunan</th>
                          <th className="py-2 pr-4 text-right text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-widest">Oluşturulan</th>
                          <th className="py-2 pr-4 text-right text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-widest">Güncellenen</th>
                          <th className="py-2 text-right text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-widest">Atlanan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {source.logs.map((log) => (
                          <tr key={log.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                            <td className="py-2 pr-4 font-mono tabular-nums">{fmt(log.startedAt)}</td>
                            <td className="py-2 pr-4 font-mono tabular-nums">{fmt(log.completedAt)}</td>
                            <td className="py-2 pr-4">
                              <Badge variant={STATUS_VARIANT[log.status] ?? "neutral"}>
                                {STATUS_LABELS[log.status] ?? log.status}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-right font-mono tabular-nums">{log.recordsFound}</td>
                            <td className="py-2 pr-4 text-right text-[var(--info)] font-mono tabular-nums font-medium">{log.recordsCreated}</td>
                            <td className="py-2 pr-4 text-right text-[var(--ok)] font-mono tabular-nums font-medium">{log.recordsUpdated}</td>
                            <td className="py-2 text-right text-[var(--text-muted)] font-mono tabular-nums">{log.recordsSkipped}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {source.logs.find((l) => l.errorMessage) && (
                      <p className="mt-2 text-xs text-[var(--danger)]">
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
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Yeni kaynak ekle</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Yeni bir XML kaynağı tanımlayın. Kaynak eklendikten sonra manuel veya otomatik senkronizasyon çalışabilir.
          </p>
        </div>
        <NewXmlSourceForm />
      </Card>

      {/* Son Değişimler — Phase 49 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Son Senkronizasyon Değişimleri</h2>
          {latestSyncAt && (
            <span className="text-xs text-[var(--text-muted)] font-mono tabular-nums">{fmt(latestSyncAt)}</span>
          )}
        </div>

        {latestSyncChanges.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              {recentChanges.length === 0
                ? "Henüz stok değişim kaydı yok. Senkronizasyon çalıştıktan sonra burada görünecek."
                : "Son senkronizasyonda stok değişimi yapılmadı."}
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
              <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                {latestSyncChanges.length} ürün değişti
              </span>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                Artış: {latestSyncChanges.filter((c) => c.delta > 0).length} · Azalış: {latestSyncChanges.filter((c) => c.delta < 0).length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-[var(--text-secondary)] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                    <th className="py-2 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün</th>
                    <th className="py-2 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">SKU</th>
                    <th className="py-2 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Önceki</th>
                    <th className="py-2 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Yeni</th>
                    <th className="py-2 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Değişim</th>
                  </tr>
                </thead>
                <tbody>
                  {latestSyncChanges.map((change) => (
                    <tr key={change.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                      <td className="py-2 px-4 text-xs text-[var(--text-secondary)] max-w-[200px] truncate">
                        <a href={`/products/${change.product.id}`} className="hover:text-[var(--accent)]">
                          {change.product.name}
                        </a>
                      </td>
                      <td className="py-2 px-4 font-mono tabular-nums text-xs text-[var(--text-muted)]">{change.product.sku}</td>
                      <td className="py-2 px-4 text-xs text-right font-mono tabular-nums text-[var(--text-muted)]">{change.previousQty}</td>
                      <td className="py-2 px-4 text-xs text-right font-mono tabular-nums font-medium text-[var(--text-primary)]">{change.newQty}</td>
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
      <Card className="border-[var(--info-border)] bg-[var(--info-dim)] p-6">
        <p className="text-sm font-semibold text-[var(--info)] mb-2">Senkronizasyon davranışı (Phase 11A)</p>
        <ul className="text-xs text-[var(--info)] space-y-1 list-disc list-inside opacity-90">
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
