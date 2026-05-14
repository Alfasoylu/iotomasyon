import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrencyAmount, formatPercentValue } from "@/lib/quote-utils";
import { formatDateTime } from "@/lib/utils";
import {
  getDashboardStats,
  getDueTodayFollowups,
} from "@/services/dashboard-service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, dueToday] = await Promise.all([
    getDashboardStats(),
    getDueTodayFollowups(),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-8 shadow-sm md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge tone="success">Phase 4</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              CRM panosu
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Satis hunisi, gelir takibi, urun performansi ve musteri sureclerini tek ekranda gorun.
            </p>
          </div>

          <div className="flex gap-3">
            <Link href="/customers">
              <Button>Musteri panosu</Button>
            </Link>
            <Link href="/search">
              <Button variant="secondary">Arama</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Revenue KPIs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Gelir
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Bu ay kazanilan"
            value={formatCurrencyAmount(stats.monthlyRevenue, "TRY")}
            tone="success"
          />
          <StatCard
            label="Toplam kazanilan"
            value={formatCurrencyAmount(stats.wonRevenue, "TRY")}
          />
          <StatCard
            label="Ort. anlaşma büyüklüğü"
            value={formatCurrencyAmount(stats.averageDealSize, "TRY")}
          />
          <StatCard
            label="Kazanma oranı"
            value={formatPercentValue(stats.conversionRate.toFixed(1))}
            tone={stats.conversionRate > 30 ? "success" : "default"}
          />
        </div>
      </section>

      {/* Pipeline funnel */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Satis hunisi
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Yeni" value={stats.newCustomerCount} />
          <StatCard label="Iletisim kuruldu" value={stats.customerCount - stats.newCustomerCount - stats.wonCustomerCount - stats.lostDeals} />
          <StatCard label="Teklif verildi" value={stats.quotedCustomerCount} tone="warning" />
          <StatCard label="Muzakere" value={stats.negotiatingCustomerCount} tone="warning" />
          <StatCard label="Kazanilan" value={stats.wonCustomerCount} tone="success" />
          <StatCard label="Kaybedilen" value={stats.lostDeals} tone="danger" />
        </div>
      </section>

      {/* Operations */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Operasyon
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Acik follow-up" value={stats.openFollowups} />
          <StatCard label="Geciken gorev" value={stats.overdueTasks} tone="danger" />
          <StatCard label="Teklif gonderildi" value={stats.quotesSent} />
          <StatCard label="Toplam urun" value={stats.productCount} />
        </div>
      </section>

      {!stats.databaseAvailable ? (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabani baglantisi su anda kullanilamiyor. Dashboard yuklendi ancak canli
          metrikler gosterilemiyor.
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            En cok satilan urunler
          </p>
          {stats.topProducts.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">
              Henuz kazanilan teklif kalemi yok.
            </p>
          ) : (
            <ol className="mt-5 space-y-3">
              {stats.topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.sku} · {p.totalQty} adet</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Due today
          </p>
          <div className="mt-4 space-y-4">
            {!dueToday.databaseAvailable ? (
              <p className="text-sm leading-7 text-slate-600">
                Veritabani baglantisi olmadan bugune ait follow-up kayitlari yuklenemedi.
              </p>
            ) : dueToday.tasks.length === 0 ? (
              <p className="text-sm leading-7 text-slate-600">
                Bugun icin acik follow-up gorevi bulunmuyor.
              </p>
            ) : (
              dueToday.tasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">{task.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {task.customer?.name ?? "Musteri baglantisi yok"}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                    {task.dueDate ? formatDateTime(task.dueDate) : "Termin yok"}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

const TONE_CLASSES: Record<string, string> = {
  default: "",
  success: "border-emerald-200 bg-emerald-50",
  warning: "border-amber-200 bg-amber-50",
  danger: "border-red-200 bg-red-50",
};

function StatCard({
  label,
  value,
  tone = "default",
  accent,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "danger";
  accent?: boolean;
}) {
  const resolvedTone = accent ? "warning" : tone;
  return (
    <Card className={`p-5 ${TONE_CLASSES[resolvedTone]}`}>
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-5 text-3xl font-semibold text-slate-950">{value}</p>
    </Card>
  );
}
