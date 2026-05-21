/**
 * Faz 6 — Katalog Performans Raporu
 *
 * Sales manager için: katalog → açılma → ilgi → quote dönüşüm.
 * Son 30 günlük varsayılan (?days=N ile değiştirilebilir).
 */

import { BarChart3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { CATALOG_PROFILES, GENERAL_PROFILE } from "@/lib/catalog-mapping";
import { getCatalogPerformanceStats } from "@/services/catalog-share-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ days?: string }>;
};

export default async function CatalogPerformancePage({ searchParams }: PageProps) {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  const sp = await searchParams;
  const days = Math.max(1, Math.min(365, Number(sp.days) || 30));

  const stats = await getCatalogPerformanceStats({ daysBack: days });

  const recentShares = await prisma.catalogShare.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      token: true,
      profileSlug: true,
      priceMode: true,
      viewCount: true,
      firstViewedAt: true,
      createdAt: true,
      customer: { select: { name: true, company: true } },
      sentBy: { select: { name: true } },
      _count: { select: { productInterests: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const allProfiles = [GENERAL_PROFILE, ...Object.values(CATALOG_PROFILES)];
  const profileTitleMap = new Map<string, string>(
    allProfiles.map((p) => [p.slug, p.title]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        breadcrumb={[
          { label: "Günlük Durum" },
          { label: "Katalog Performansı" },
        ]}
        title="Katalog Performans Raporu"
        subtitle={`Son ${days} günde gönderilen kataloglar — açılma, ilgi, sektör profili dönüşümü.`}
        actions={
          <form className="inline-flex items-center gap-2">
            <label className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">Dönem:</label>
            <select
              name="days"
              defaultValue={String(days)}
              className="h-8 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 text-xs text-[var(--text-primary)]"
              onChange={(e) => {
                e.currentTarget.form?.submit();
              }}
            >
              <option value="7">Son 7 gün</option>
              <option value="30">Son 30 gün</option>
              <option value="90">Son 90 gün</option>
              <option value="365">Son 365 gün</option>
            </select>
          </form>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Gönderilen</p>
          <p className="mt-2 text-[22px] font-semibold tracking-tight tabular-nums font-mono text-[var(--text-primary)]">{stats.totalSent}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Toplam katalog (link)</p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Açıldı</p>
          <p className="mt-2 flex items-center gap-2 text-[22px] font-semibold tracking-tight tabular-nums font-mono text-[var(--text-primary)]">
            {stats.opened}
            <Badge variant={stats.openRate >= 50 ? "ok" : stats.openRate >= 25 ? "warn" : "danger"}>
              {stats.openRate.toFixed(0)}%
            </Badge>
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Açılma oranı</p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İlgi gösterildi</p>
          <p className="mt-2 flex items-center gap-2 text-[22px] font-semibold tracking-tight tabular-nums font-mono text-[var(--text-primary)]">
            {stats.withInterest}
            <Badge
              variant={
                stats.interestRate >= 30 ? "ok" : stats.interestRate >= 10 ? "warn" : "danger"
              }
            >
              {stats.interestRate.toFixed(0)}%
            </Badge>
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Açılan / ilgilenen oranı</p>
        </Card>
      </div>

      {/* Sales Rep Ranking */}
      {stats.bySalesRep.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-[var(--border-subtle)] px-5 py-3">
            <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Sales Rep — Gönderim Sıralaması</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-2 text-left">Sales Rep</th>
                <th className="px-4 py-2 text-right">Gönderim</th>
              </tr>
            </thead>
            <tbody>
              {stats.bySalesRep.map((r) => (
                <tr key={r.userId} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-2.5 text-[var(--text-primary)]">{r.userName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">{r.sent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Profile Conversion */}
      {stats.byProfile.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-[var(--border-subtle)] px-5 py-3">
            <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Sektör Profili — Dönüşüm</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-2 text-left">Profil</th>
                <th className="px-4 py-2 text-right">Gönderim</th>
                <th className="px-4 py-2 text-right">Açılma</th>
                <th className="px-4 py-2 text-right">İlgi</th>
                <th className="px-4 py-2 text-right">İlgi %</th>
              </tr>
            </thead>
            <tbody>
              {stats.byProfile.map((r) => {
                const interestPct = r.opened > 0 ? (r.withInterest / r.opened) * 100 : 0;
                return (
                  <tr key={r.profileSlug} className="border-t border-[var(--border-subtle)]">
                    <td className="px-4 py-2.5 text-[var(--text-primary)]">
                      {profileTitleMap.get(r.profileSlug) ?? r.profileSlug}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">{r.sent}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">{r.opened}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">{r.withInterest}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Badge
                        variant={
                          interestPct >= 30 ? "ok" : interestPct >= 10 ? "warn" : "danger"
                        }
                      >
                        {interestPct.toFixed(0)}%
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Recent shares */}
      <Card className="p-0">
        <div className="border-b border-[var(--border-subtle)] px-5 py-3">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Son Gönderimler (50)</h3>
        </div>
        {recentShares.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-[var(--text-muted)]">
            Bu dönemde gönderilen katalog yok.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-2 text-left">Tarih</th>
                <th className="px-4 py-2 text-left">Müşteri</th>
                <th className="px-4 py-2 text-left">Sales Rep</th>
                <th className="px-4 py-2 text-left">Profil</th>
                <th className="px-4 py-2 text-right">Açılma</th>
                <th className="px-4 py-2 text-right">İlgi</th>
                <th className="px-4 py-2 text-left">Link</th>
              </tr>
            </thead>
            <tbody>
              {recentShares.map((s) => (
                <tr key={s.id} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-2.5 text-xs tabular-nums font-mono text-[var(--text-muted)]">
                    {new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(s.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-primary)]">
                    {s.customer.company ?? s.customer.name}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.sentBy?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                    {profileTitleMap.get(s.profileSlug) ?? s.profileSlug}{" "}
                    <span className="text-[10px] text-[var(--text-muted)]">({s.priceMode})</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">{s.viewCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">{s._count.productInterests}</td>
                  <td className="px-4 py-2.5">
                    <a
                      href={`/c/${s.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[var(--accent)] underline decoration-dotted"
                    >
                      Aç
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
