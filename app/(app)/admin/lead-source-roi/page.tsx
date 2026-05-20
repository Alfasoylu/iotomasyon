import { PieChart, MapPin, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
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
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">Source Bazlı ROI</h3>
          </div>
          <span className="text-xs text-slate-500">Sıralama: kazanılan ₺ → müşteri sayısı</span>
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
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
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
              <tbody className="divide-y divide-slate-100">
                {data.sources.map((s) => (
                  <tr key={s.source} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{s.source}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.totalCustomers}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {s.contactedCustomers}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {s.customersWithQuote}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {fmtTry(s.totalQuoteAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-700">
                      {s.customersWon}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-700">
                      {fmtTry(s.totalWonAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={
                          s.contactRatePct >= 50
                            ? "rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                            : "text-slate-400"
                        }
                      >
                        %{s.contactRatePct}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={
                          s.conversionPct >= 10
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : s.conversionPct > 0
                              ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                              : "text-slate-400"
                        }
                      >
                        %{s.conversionPct}
                      </span>
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
          <MapPin className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Şehir Heatmap — Top 15</h3>
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
                  <div className="col-span-3 truncate text-sm font-medium text-slate-700" title={c.city}>
                    {c.city}
                  </div>
                  <div className="col-span-6">
                    <div className="relative h-6 w-full overflow-hidden rounded-md bg-slate-100">
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-600"
                        style={{ width: `${widthPct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white mix-blend-difference">
                        {c.totalCustomers.toLocaleString("tr-TR")} müşteri
                      </span>
                    </div>
                  </div>
                  <div className="col-span-1 text-right text-xs tabular-nums text-emerald-700">
                    {c.customersWon}
                  </div>
                  <div className="col-span-2 text-right text-xs tabular-nums text-slate-500">
                    {wonPct > 0 ? `%${wonPct} kazanım · ${fmtTry(c.totalWonAmount)}` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-xs text-slate-500">
          <strong>Source</strong> = Customer.source. <strong>Entegra (Pazaryeri)</strong> = Entegra
          import edilen müşteriler (Trendyol/Hepsiburada vb). <strong>Kontakt %</strong> =
          lastContactedAt dolu olanların oranı. <strong>Kazanma %</strong> = status WON / toplam.
        </p>
      </Card>
    </div>
  );
}
