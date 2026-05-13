import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDashboardStats } from "@/services/dashboard-service";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-8 shadow-sm md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge tone="warning">Phase 1</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Dashboard shell hazir
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Bu ilk surum, urun operasyonunu ayaga kaldirir: giris, korumali alan,
              temel KPI kartlari ve urun kayit akisi.
            </p>
          </div>

          <div className="flex gap-3">
            <Link href="/products/new">
              <Button>Yeni urun</Button>
            </Link>
            <Link href="/products">
              <Button variant="secondary">Urun listesi</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Toplam urun" value={stats.productCount} />
        <StatCard label="Aktif urun" value={stats.activeProductCount} />
        <StatCard label="Dusuk stok" value={stats.lowStockCount} accent />
        <StatCard label="Tanimli lokasyon" value={stats.locationCount} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            What is live
          </p>
          <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-700">
            <li>Cookie tabanli tek admin authentication</li>
            <li>Korumali dashboard ve products routelari</li>
            <li>Prisma + SQLite veri modeli</li>
            <li>Urun ekleme, guncelleme, silme, arama ve stok gorunumu</li>
          </ul>
        </Card>

        <Card className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Next critical task
          </p>
          <h2 className="mt-4 text-xl font-semibold text-slate-950">
            Customer module ve urun-musteri iliski takibi
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Phase 2&apos;de musteri CRUD, iliski kayitlari, not timeline&apos;i ve takip gorevleri
            eklenmeli. Mevcut schema bu genislemeyi destekleyecek sekilde kuruldu.
          </p>
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
  value: number;
  accent?: boolean;
}) {
  return (
    <Card className={`p-5 ${accent ? "border-amber-200 bg-amber-50" : "p-5"}`}>
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-5 text-4xl font-semibold text-slate-950">{value}</p>
    </Card>
  );
}
