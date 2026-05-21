import { PieChart, MapPin, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { getLeadSourceROI } from "@/services/lead-source-roi-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function LeadSourceROIPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const data = await getLeadSourceROI();
  const maxCityCount = Math.max(...data.cities.map((c) => c.totalCustomers), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={PieChart}
        breadcrumb={[{ label: "Yönetim" }, { label: "Lead Source ROI" }]}
        title="Lead Source ROI & Şehir Heatmap"
        subtitle={`${data.totalCustomers.toLocaleString("tr-TR")} aktif müşteri — hangi kaynaktan geldiklerini ve hangi şehirlerden satış kazandığını gör.`}
      />

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
            <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Source Bazlı ROI</h3>
          </div>
          <span className="text-xs text-[var(--text-muted)]">Sıralama: kazanılan ₺ → müşteri sayısı</span>
        </div>

        {data.sources.length === 0 ? (
          <EmptyState
            icon={PieChart}
            title="Henüz lead source verisi yok"
            hint="Müşteri eklendikçe kaynak istatistikleri burada görünecek."
            className="m-4"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-1)] text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2 text-right">Toplam</th>
                  <th className="px-4 py-2 text-right">Arandı</th>
                  <th className="px-4 py-2 text-right">Teklifli</th>
                  <th className="px-4 py-2 text-right">Teklif ₺</th>
                  <th className="px-4 py-2 text-right">Kazanılan</th>
                  <th className="px-4 py-2 text-right">Kazanılan ₺</th>
                  <th className="px-4 py-2 text-right">Kontakt %</th>
                  <th className="px-4 py-2 text-right">Kazanma %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data.sources.map((s) => (
                  <tr key={s.source} className="hover:bg-[var(--surface-3)]">
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{s.source}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-primary)]">{s.totalCustomers}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-secondary)]">
                      {s.contactedCustomers}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-secondary)]">
                      {s.customersWithQuote}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-muted)]">
                      {fmtTry(s.totalQuoteAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono font-medium text-[var(--ok)]">
                      {s.customersWon}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono font-medium text-[var(--ok)]">
                      {fmtTry(s.totalWonAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.contactRatePct >= 50 ? (
                        <Badge variant="info">%{s.contactRatePct}</Badge>
                      ) : (
                        <span className="font-mono text-[var(--text-muted)]">%{s.contactRatePct}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.conversionPct >= 10 ? (
                        <Badge variant="ok">%{s.conversionPct}</Badge>
                      ) : s.conversionPct > 0 ? (
                        <Badge variant="warn">%{s.conversionPct}</Badge>
                      ) : (
                        <span className="font-mono text-[var(--text-muted)]">%{s.conversionPct}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <MapPin size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Şehir Heatmap — Top 15</h3>
        </div>

        {data.cities.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Henüz şehir verisi yok"
            hint="Müşteri kayıtlarına şehir eklendikçe burada görünecek."
          />
        ) : (
          <div className="space-y-2">
            {data.cities.map((c) => {
              const widthPct = Math.max(4, Math.round((c.totalCustomers / maxCityCount) * 100));
              const wonPct =
                c.totalCustomers > 0 ? Math.round((c.customersWon / c.totalCustomers) * 100) : 0;
              return (
                <div key={c.city} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-3 truncate text-sm font-medium text-[var(--text-primary)]" title={c.city}>
                    {c.city}
                  </div>
                  <div className="col-span-6">
                    <div className="relative h-6 w-full overflow-hidden rounded-md bg-[var(--surface-3)]">
                      <div
                        className="h-full bg-[var(--info)]"
                        style={{ width: `${widthPct}%`, opacity: 0.6 }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-medium tabular-nums text-[var(--text-primary)]">
                        {c.totalCustomers.toLocaleString("tr-TR")} müşteri
                      </span>
                    </div>
                  </div>
                  <div className="col-span-1 text-right text-xs tabular-nums font-mono text-[var(--ok)]">
                    {c.customersWon}
                  </div>
                  <div className="col-span-2 text-right text-xs tabular-nums font-mono text-[var(--text-muted)]">
                    {wonPct > 0 ? `%${wonPct} kazanım · ${fmtTry(c.totalWonAmount)}` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          <strong className="text-[var(--text-secondary)]">Source</strong> = Customer.source.{" "}
          <strong className="text-[var(--text-secondary)]">Entegra (Pazaryeri)</strong> = Entegra
          import edilen müşteriler (Trendyol/Hepsiburada vb).{" "}
          <strong className="text-[var(--text-secondary)]">Kontakt %</strong> ={" "}
          lastContactedAt dolu olanların oranı.{" "}
          <strong className="text-[var(--text-secondary)]">Kazanma %</strong> = status WON / toplam.
        </p>
      </Card>
    </div>
  );
}
