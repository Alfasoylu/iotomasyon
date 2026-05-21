/**
 * Phase 13 — Marketplace Monitoring Dashboard
 *
 * Three alert categories (all computed server-side, no new schema):
 *   1. Listeleme boşluğu — active products with zero marketplace listings
 *   2. Sorunlu listelemeler — listings with SUSPENDED or UNKNOWN status
 *   3. Takip edilmemiş listelemeler — listings where lastCheckedAt is null
 */

import Link from "next/link";
import { AlertTriangle, X, Clock, ArrowLeft, Check } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateMonitoringTaskButton } from "@/components/marketplace/create-monitoring-task-button";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL: "Trendyol", HEPSIBURADA: "Hepsiburada", N11: "N11",
  PTTAVM: "PTT AVM", KOCTAS: "Koçtaş", TEKNOSA: "Teknosa", TEMU: "Temu", CUSTOM: "Diğer",
};

const STATUS_VARIANTS: Record<string, "ok" | "neutral" | "danger" | "warn"> = {
  ACTIVE: "ok",
  INACTIVE: "neutral",
  SUSPENDED: "danger",
  UNKNOWN: "warn",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif", INACTIVE: "Pasif", SUSPENDED: "Askıya alındı", UNKNOWN: "Bilinmiyor",
};

function AlertCount({ count, variant }: { count: number; variant: "warn" | "danger" | "neutral" }) {
  return (
    <Badge variant={variant} className="font-semibold">
      {count}
    </Badge>
  );
}

export default async function MarketplaceMonitoringPage() {
  await requirePermission(PERMISSIONS.MARKETPLACE_LISTINGS_READ);

  // 1. Products with zero marketplace listings (active products only)
  const [allActiveProducts, listingCounts] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, sku: true, name: true, _count: { select: { marketplaceListings: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.marketplaceListing.groupBy({
      by: ["productId"],
      _count: { id: true },
    }),
  ]);

  const listedProductIds = new Set(listingCounts.map((l) => l.productId));
  const gapProducts = allActiveProducts.filter((p) => !listedProductIds.has(p.id));

  // 2. Problem listings — SUSPENDED or UNKNOWN status
  const problemListings = await prisma.marketplaceListing.findMany({
    where: { status: { in: ["SUSPENDED", "UNKNOWN"] } },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      responsible: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  // 3. Stale listings — never checked (lastCheckedAt is null)
  const staleListings = await prisma.marketplaceListing.findMany({
    where: { lastCheckedAt: null, status: "ACTIVE" },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      responsible: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalAlerts = gapProducts.length + problemListings.length + staleListings.length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Pazar Yerleri</p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">İzleme Merkezi</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Listeleme boşluklarını ve sorunlu listelemelerini takip edin.{" "}
            {totalAlerts > 0 ? (
              <span className="font-semibold text-[var(--warn)]">{totalAlerts} uyarı tespit edildi.</span>
            ) : (
              <span className="text-[var(--ok)] font-semibold">Tüm kontroller temiz.</span>
            )}
          </p>
        </div>
        <Link href="/marketplace">
          <Button variant="secondary">
            <ArrowLeft size={14} strokeWidth={1.5} className="mr-1" />
            Listeleme Kaydı
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="p-4 rounded-lg flex items-center gap-4">
          <div className="rounded-md bg-[var(--warn-dim)] border border-[var(--warn-border)] p-3">
            <AlertTriangle size={14} strokeWidth={1.5} className="text-[var(--warn)]" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">{gapProducts.length}</p>
            <p className="text-xs text-[var(--text-muted)]">Listelenmemiş ürün</p>
          </div>
        </Card>
        <Card className="p-4 rounded-lg flex items-center gap-4">
          <div className="rounded-md bg-[var(--danger-dim)] border border-[var(--danger-border)] p-3">
            <X size={14} strokeWidth={1.5} className="text-[var(--danger)]" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">{problemListings.length}</p>
            <p className="text-xs text-[var(--text-muted)]">Sorunlu listeleme</p>
          </div>
        </Card>
        <Card className="p-4 rounded-lg flex items-center gap-4">
          <div className="rounded-md bg-[var(--surface-3)] border border-[var(--border-default)] p-3">
            <Clock size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">{staleListings.length}</p>
            <p className="text-xs text-[var(--text-muted)]">Hiç kontrol edilmemiş (aktif)</p>
          </div>
        </Card>
      </div>

      {/* 1. Gap alerts */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">Listeleme Boşluğu</h2>
          <AlertCount count={gapProducts.length} variant="warn" />
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Aktif olup henüz hiçbir pazar yerinde listelenmemiş ürünler.
        </p>
        {gapProducts.length === 0 ? (
          <Card className="p-4 rounded-lg">
            <p className="text-sm text-[var(--ok)] font-medium inline-flex items-center gap-2">
              <Check size={14} strokeWidth={1.5} />
              Tüm aktif ürünler en az bir pazar yerinde listelendi.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-[var(--text-secondary)] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">SKU</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün Adı</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {gapProducts.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                      <td className="py-3 px-4">
                        <Link href={`/products/${p.id}`} className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline">
                          {p.sku}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)] max-w-[240px] truncate">{p.name}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/marketplace/new?productId=${p.id}`}>
                            <Button variant="secondary" className="text-xs h-7 px-2">+ Listeleme ekle</Button>
                          </Link>
                          <CreateMonitoringTaskButton
                            productId={p.id}
                            title={`${p.sku} — Pazar yeri listelemeleri eksik`}
                            description={`${p.name} (${p.sku}) aktif bir ürün ancak hiçbir pazar yerinde listelenmemiş. Uygun platform(lar)a listeleme eklenmesi gerekiyor.`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* 2. Problem listings */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">Sorunlu Listelemeler</h2>
          <AlertCount count={problemListings.length} variant="danger" />
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Durumu Askıya alındı veya Bilinmiyor olan listelemeler — inceleme ve durum güncellemesi gerekir.
        </p>
        {problemListings.length === 0 ? (
          <Card className="p-4 rounded-lg">
            <p className="text-sm text-[var(--ok)] font-medium inline-flex items-center gap-2">
              <Check size={14} strokeWidth={1.5} />
              Sorunlu listeleme yok.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-[var(--text-secondary)] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Platform</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Durum</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Sorumlu</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {problemListings.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                      <td className="py-3 px-4">
                        <span className="rounded-md bg-[var(--surface-3)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                          {PLATFORM_LABELS[l.platform] ?? l.platform}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${l.product.id}`} className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline">
                          {l.product.sku}
                        </Link>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 max-w-[160px] truncate">{l.product.name}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={STATUS_VARIANTS[l.status] ?? "neutral"}>
                          {STATUS_LABELS[l.status] ?? l.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-muted)]">
                        {l.responsible?.name ?? <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/marketplace/${l.id}/edit`}>
                            <Button variant="secondary" className="text-xs h-7 px-2">Güncelle</Button>
                          </Link>
                          <CreateMonitoringTaskButton
                            productId={l.product.id}
                            title={`${l.product.sku} — ${PLATFORM_LABELS[l.platform] ?? l.platform} listeleması sorunlu`}
                            description={`${l.product.name} ürününün ${PLATFORM_LABELS[l.platform] ?? l.platform} listeleması "${STATUS_LABELS[l.status] ?? l.status}" durumunda. İnceleme ve durum güncellemesi gerekiyor.`}
                            assignedToId={l.responsible?.id}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* 3. Stale / never-checked listings */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">Hiç Kontrol Edilmemiş Aktif Listelemeler</h2>
          <AlertCount count={staleListings.length} variant="neutral" />
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Durumu Aktif fakat hiç kontrol tarihi girilmemiş listelemeler — URL ve listeleme durumu doğrulanmalı.
        </p>
        {staleListings.length === 0 ? (
          <Card className="p-4 rounded-lg">
            <p className="text-sm text-[var(--ok)] font-medium inline-flex items-center gap-2">
              <Check size={14} strokeWidth={1.5} />
              Tüm aktif listelemeler kontrol edildi.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-[var(--text-secondary)] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Platform</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Başlık</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Sorumlu</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {staleListings.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                      <td className="py-3 px-4">
                        <span className="rounded-md bg-[var(--surface-3)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                          {PLATFORM_LABELS[l.platform] ?? l.platform}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${l.product.id}`} className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline">
                          {l.product.sku}
                        </Link>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 max-w-[160px] truncate">{l.product.name}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-secondary)] max-w-[160px] truncate">
                        {l.listingTitle ?? <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-muted)]">
                        {l.responsible?.name ?? <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/marketplace/${l.id}/edit`}>
                            <Button variant="secondary" className="text-xs h-7 px-2">Kontrol tarihi gir</Button>
                          </Link>
                          <CreateMonitoringTaskButton
                            productId={l.product.id}
                            title={`${l.product.sku} — ${PLATFORM_LABELS[l.platform] ?? l.platform} listeleması kontrol edilmedi`}
                            description={`${l.product.name} ürününün ${PLATFORM_LABELS[l.platform] ?? l.platform} listeleması aktif görünüyor ancak hiç kontrol edilmedi. URL ve listeleme durumu doğrulanmalı.`}
                            assignedToId={l.responsible?.id}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
