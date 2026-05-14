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
            <Badge tone="warning">Phase 3</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Sales pipeline paneli hazir
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Musteri, teklif, follow-up ve urun akisini tek panelden izleyin.
            </p>
          </div>

          <div className="flex gap-3">
            <Link href="/customers">
              <Button>Musteri panosu</Button>
            </Link>
            <Link href="/products/new">
              <Button variant="secondary">Yeni urun</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Toplam urun" value={stats.productCount} />
        <StatCard label="Aktif urun" value={stats.activeProductCount} />
        <StatCard label="Dusuk stok" value={stats.lowStockCount} accent />
        <StatCard label="Tanimli lokasyon" value={stats.locationCount} />
        <StatCard label="Toplam musteri" value={stats.customerCount} />
        <StatCard label="Yeni musteri" value={stats.newCustomerCount} />
        <StatCard label="Teklif verilen" value={stats.quotedCustomerCount} />
        <StatCard label="Muzakerede" value={stats.negotiatingCustomerCount} accent />
        <StatCard label="Kazanilan" value={stats.wonCustomerCount} />
        <StatCard label="Acik follow-up" value={stats.openFollowups} />
        <StatCard label="Geciken gorev" value={stats.overdueTasks} accent />
        <StatCard label="Quotes sent" value={stats.quotesSent} />
        <StatCard label="Open deals" value={stats.openDeals} />
        <StatCard label="Lost deals" value={stats.lostDeals} accent />
        <StatCard label="Conversion rate" value={formatPercentValue(stats.conversionRate.toFixed(1))} />
        <StatCard
          label="Won revenue"
          value={formatCurrencyAmount(stats.wonRevenue, "TRY")}
        />
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
            What is live
          </p>
          <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-700">
            <li>Cookie tabanli tek admin authentication</li>
            <li>Korumali dashboard ve products routelari</li>
            <li>Musteri CRUD, urun ilgileri, timeline notlari ve takip gorevleri</li>
            <li>Teklif olusturma, pipeline kanban, PDF export ve WhatsApp akisi</li>
            <li>Prisma + Supabase PostgreSQL veri modeli</li>
            <li>CSV musteri import ve satis KPI genislemeleri</li>
          </ul>
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

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <Card className={`p-5 ${accent ? "border-amber-200 bg-amber-50" : "p-5"}`}>
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-5 text-4xl font-semibold text-slate-950">{value}</p>
    </Card>
  );
}
