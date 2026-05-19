import Link from "next/link";
import {
  Heart,
  Users,
  ShoppingCart,
  Package,
  DollarSign,
  CheckSquare,
  TrendingUp,
  Ship,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { KpiCard, type KpiTone } from "@/components/layout/kpi-card";
import { SectionCard } from "@/components/layout/section-card";
import { SmartRecsCard } from "@/components/dashboard/smart-recs-card";
import { FirstTimeBanner } from "@/components/dashboard/first-time-banner";
import { formatCurrencyAmount, formatPercentValue } from "@/lib/quote-utils";
import { formatDateTime } from "@/lib/utils";
import type { SmartRec } from "@/lib/smart-recommendations";
import type {
  AdminEnhancedData,
  CapitalSnapshot,
  DashboardStats,
  DueTodayFollowups,
  OperationalAlerts,
} from "@/services/dashboard-service";

const MONTH_NAMES = [
  "", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const DAY_NAMES = [
  "Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi",
];

function fmtUsd(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
  }).format(n);
}

export async function AdminWorkspace({
  user,
  stats,
  dueToday,
  alerts,
  enhanced,
  capital,
  smartRecs,
}: {
  user: { name: string };
  stats: DashboardStats;
  dueToday: DueTodayFollowups;
  alerts: OperationalAlerts;
  enhanced: AdminEnhancedData;
  capital: CapitalSnapshot;
  smartRecs: SmartRec[];
}) {
  const now = new Date();
  const greeting = computeGreeting(now);
  const dayName = DAY_NAMES[now.getDay()];
  const dateStr = `${now.getDate()} ${MONTH_NAMES[now.getMonth() + 1]} ${now.getFullYear()}`;

  const usdTry = enhanced.latestRate?.usdTryRate;
  const rmbUsd = enhanced.latestRate?.rmbUsdRate;

  // ── Trendyol MoM hesaplama ─────────────────────────────────────────────
  const tm = enhanced.trendyolMoM.thisMonth;
  const lm = enhanced.trendyolMoM.lastMonth;
  const ordersDelta = lm.orders > 0 ? Math.round(((tm.orders - lm.orders) / lm.orders) * 100) : null;
  const revenueDelta = lm.revenue > 0 ? Math.round(((tm.revenue - lm.revenue) / lm.revenue) * 100) : null;

  // ── Pipeline durumu ────────────────────────────────────────────────────
  const inProgressCount =
    stats.customerCount - stats.newCustomerCount - stats.wonCustomerCount - stats.lostDeals;

  return (
    <div className="space-y-6">
      {/* ── 0) İlk-defa banner (LocalStorage'da dismiss olunca kaybolur) ── */}
      <FirstTimeBanner />

      {/* ── 1) Hoş geldin satırı ──────────────────────────────────────── */}
      <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              {dayName}, {dateStr}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
              {greeting}, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Bugün ne yapmalısın? Aşağıdaki manşet sermaye sağlık skoruna ve gruplara bakarak başla.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {usdTry && (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-mono">
                1 USD = ₺{usdTry.toFixed(2)}
              </span>
            )}
            {rmbUsd && rmbUsd > 0 && (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-mono">
                1 USD = {rmbUsd.toFixed(2)} ¥
              </span>
            )}
            <Link
              href="/admin/exchange-rates"
              className="text-slate-500 hover:text-slate-900 underline-offset-4 hover:underline"
            >
              Kur geçmişi →
            </Link>
          </div>
        </div>
      </Card>

      {/* ── 2) Sermaye Sağlık Skoru manşeti ──────────────────────────── */}
      {capital.databaseAvailable && (
        <Link href="/admin/sermaye-saglik" className="block">
          <Card
            className={`p-6 transition-shadow hover:shadow-md ${
              capital.scoreTone === "success" ? "border-emerald-300 bg-emerald-50" :
              capital.scoreTone === "info" ? "border-blue-300 bg-blue-50" :
              capital.scoreTone === "warning" ? "border-amber-300 bg-amber-50" :
              "border-rose-300 bg-rose-50"
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70">
                  <Heart className={`h-6 w-6 ${
                    capital.scoreTone === "success" ? "text-emerald-700" :
                    capital.scoreTone === "info" ? "text-blue-700" :
                    capital.scoreTone === "warning" ? "text-amber-700" :
                    "text-rose-700"
                  }`} />
                </div>
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${
                    capital.scoreTone === "success" ? "text-emerald-700" :
                    capital.scoreTone === "info" ? "text-blue-700" :
                    capital.scoreTone === "warning" ? "text-amber-700" :
                    "text-rose-700"
                  }`}>
                    Sermaye Sağlık Skoru
                  </p>
                  <div className="mt-1 flex items-baseline gap-2.5">
                    <span className={`text-5xl font-bold tabular-nums ${
                      capital.scoreTone === "success" ? "text-emerald-700" :
                      capital.scoreTone === "info" ? "text-blue-700" :
                      capital.scoreTone === "warning" ? "text-amber-700" :
                      "text-rose-700"
                    }`}>
                      {capital.healthScore}
                    </span>
                    <span className="text-sm text-slate-500">/ 100</span>
                    <span className={`rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold ${
                      capital.scoreTone === "success" ? "text-emerald-700" :
                      capital.scoreTone === "info" ? "text-blue-700" :
                      capital.scoreTone === "warning" ? "text-amber-700" :
                      "text-rose-700"
                    }`}>
                      {capital.scoreLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
                <ScoreMini label="Bağlı Sermaye" value={fmtUsd(capital.totalLockedUsd)} />
                <ScoreMini label="Aylık Beklenen" value={fmtUsd(capital.monthlyExpectedUsd)} />
                <ScoreMini label="Yıllık ROI" value={`%${capital.annualRoiPct.toFixed(1)}`} />
                <ScoreMini label="Ölü Stok" value={`${capital.deadStockCount} ürün`} />
              </div>
              <ArrowRight className="hidden lg:block h-5 w-5 text-slate-400" />
            </div>
          </Card>
        </Link>
      )}

      {/* ── 3) Akıllı Öneriler kartı ──────────────────────────────────── */}
      {smartRecs.length > 0 && <SmartRecsCard recs={smartRecs} />}

      {/* ── 4) DB durumu uyarısı ──────────────────────────────────────── */}
      {!stats.databaseAvailable && (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabanı bağlantısı şu anda kullanılamıyor. Pano yüklendi ancak canlı
          metrikler gösterilemiyor.
        </Card>
      )}

      {/* ── 4) Bugün için manşet KPI'lar ──────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Acil Sipariş"
          value={String(capital.urgentReorderCount)}
          tone={capital.urgentReorderCount > 0 ? "danger" : "neutral"}
          hint="14 günden az stoku kalan ürün"
          href="/admin/sermaye-saglik"
        />
        <KpiCard
          label="Bugün Görev"
          value={String(dueToday.tasks?.length ?? 0)}
          tone={(dueToday.tasks?.length ?? 0) > 0 ? "warning" : "neutral"}
          hint={stats.overdueTasks > 0 ? `+ ${stats.overdueTasks} gecikmiş` : "vadesi geldi"}
          href="/tasks"
        />
        <KpiCard
          label="Açık Görev"
          value={String(stats.openFollowups)}
          tone="info"
          hint="devam eden tüm görevler"
          href="/tasks"
        />
        <KpiCard
          label="Eşleşmemiş Sipariş"
          value={String(alerts.unmatchedOrdersCount)}
          tone={alerts.unmatchedOrdersCount > 100 ? "warning" : "neutral"}
          hint="Trendyol'da eşleşmesi gereken"
          href="/admin/marketplace-mappings"
        />
      </div>

      {/* ── 5) SATIŞ DURUMU ────────────────────────────────────────────── */}
      <SectionCard
        icon={Users}
        title="Satış Durumu"
        subtitle="Müşteri portföyü, pipeline ve bu ay kazanılan değer"
        tone="info"
        href="/customers"
        hrefLabel="Müşteriler"
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Bu Ay Kazanılan"
            value={formatCurrencyAmount(stats.monthlyRevenue, "TRY")}
            tone="success"
            hint="kazanılan teklif tutarı"
          />
          <KpiCard
            label="Kazanma Oranı"
            value={formatPercentValue(stats.conversionRate.toFixed(1))}
            tone={stats.conversionRate > 30 ? "success" : "neutral"}
            hint="WON / (toplam − yeni)"
          />
          <KpiCard
            label="Aktif Fırsat"
            value={String(enhanced.activeInterestsTotal)}
            tone="info"
            hint="ekip genelinde devam eden ilgi"
            href="/customers"
          />
          <KpiCard
            label="Ortalama Anlaşma"
            value={formatCurrencyAmount(stats.averageDealSize, "TRY")}
            tone="neutral"
            hint="kazanılan teklif başına"
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs md:grid-cols-6">
          <PipelineCell label="Yeni" value={stats.newCustomerCount} />
          <PipelineCell label="İletişim" value={inProgressCount} />
          <PipelineCell label="Teklif" value={stats.quotedCustomerCount} tone="warning" />
          <PipelineCell label="Müzakere" value={stats.negotiatingCustomerCount} tone="warning" />
          <PipelineCell label="Kazanılan" value={stats.wonCustomerCount} tone="success" />
          <PipelineCell label="Kaybedilen" value={stats.lostDeals} tone="danger" />
        </div>
      </SectionCard>

      {/* ── 6) PAZARYERLERİ ─────────────────────────────────────────────── */}
      <SectionCard
        icon={ShoppingCart}
        title="Pazaryerleri"
        subtitle="Trendyol siparişleri, ciro ve aylık değişim"
        tone="info"
        href="/marketplace/trendyol"
        hrefLabel="Trendyol Paneli"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard
            label="Bu Ay Sipariş"
            value={tm.orders.toLocaleString("tr-TR")}
            tone="info"
            hint={`Geçen ay: ${lm.orders.toLocaleString("tr-TR")}`}
            delta={
              ordersDelta != null
                ? {
                    text: `${ordersDelta > 0 ? "+" : ""}${ordersDelta}% bu ay`,
                    direction: ordersDelta > 0 ? "up" : ordersDelta < 0 ? "down" : "flat",
                  }
                : undefined
            }
          />
          <KpiCard
            label="Bu Ay Ciro"
            value={formatCurrencyAmount(tm.revenue, "TRY")}
            tone="success"
            hint={`Geçen ay: ${formatCurrencyAmount(lm.revenue, "TRY")}`}
            delta={
              revenueDelta != null
                ? {
                    text: `${revenueDelta > 0 ? "+" : ""}${revenueDelta}% bu ay`,
                    direction: revenueDelta > 0 ? "up" : revenueDelta < 0 ? "down" : "flat",
                  }
                : undefined
            }
          />
          <KpiCard
            label="Ürün Eşleşme"
            value={`%${tm.matchRate}`}
            tone={tm.matchRate >= 90 ? "success" : tm.matchRate >= 70 ? "info" : "warning"}
            hint="API'den gelen siparişler arasında eşleştirme oranı"
            href="/admin/marketplace-mappings"
          />
        </div>
      </SectionCard>

      {/* ── 7) STOK & İTHALAT ─────────────────────────────────────────── */}
      <SectionCard
        icon={Package}
        title="Stok & İthalat"
        subtitle="Stok sağlığı, ithalat kararları ve sipariş bekleyen ürünler"
        tone="info"
        href="/admin/import-cockpit"
        hrefLabel="Karar Kokpiti"
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Toplam Ürün"
            value={stats.productCount.toLocaleString("tr-TR")}
            tone="neutral"
            hint="aktif ürün katalogu"
          />
          <KpiCard
            label="Kritik Stok"
            value={String(alerts.criticalStockCount)}
            tone={alerts.criticalStockCount > 0 ? "danger" : "success"}
            hint="minimum stok altına düşmüş"
            href="/admin/stock-health"
          />
          <KpiCard
            label="Yeniden Sipariş"
            value={String(enhanced.belowReorderCount)}
            tone={enhanced.belowReorderCount > 0 ? "warning" : "neutral"}
            hint="reorder eşiğine ulaşmış"
            href="/admin/procurement"
          />
          <KpiCard
            label="İthalat Kararı"
            value={String(enhanced.recentSnapshotCount7d)}
            tone={enhanced.recentSnapshotCount7d > 0 ? "success" : "neutral"}
            hint="son 7 gün anlık karar"
            href="/admin/import-cockpit"
          />
        </div>
      </SectionCard>

      {/* ── 8) FİNANS ─────────────────────────────────────────────────── */}
      <SectionCard
        icon={DollarSign}
        title="Finans"
        subtitle="Sermaye, kazanılan değer ve son 7 gün operasyonel sinyaller"
        tone="info"
        href="/admin/capital"
        hrefLabel="Sermaye Dağılımı"
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Bağlı Sermaye"
            value={fmtUsd(capital.totalLockedUsd)}
            tone="neutral"
            hint="ürünlere kilitli USD"
            href="/admin/capital"
          />
          <KpiCard
            label="Aylık Beklenen Nakit"
            value={fmtUsd(capital.monthlyExpectedUsd)}
            tone="success"
            hint="net kâr (kargo+komisyon sonrası)"
            href="/admin/sermaye-saglik"
          />
          <KpiCard
            label="Yıllık ROI"
            value={`%${capital.annualRoiPct.toFixed(0)}`}
            tone={capital.annualRoiPct >= 50 ? "success" : capital.annualRoiPct >= 30 ? "info" : "warning"}
            hint="mevcut hızda 12 ay projeksiyonu"
          />
          <KpiCard
            label="Trendyol Ciro (30g)"
            value={formatCurrencyAmount(alerts.trendyolRevenue30d, "TRY")}
            tone="success"
            hint="son 30 gün gerçekleşen"
            href="/marketplace/realized-margin"
          />
        </div>
      </SectionCard>

      {/* ── 9) Bugün yapılacaklar + Top ürünler ───────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={CheckSquare}
          title="Bugün Yapılacaklar"
          subtitle="Vadesi bugün olan görevler"
          tone="warning"
          href="/tasks"
          hrefLabel="Tüm Görevler"
        >
          {!dueToday.databaseAvailable ? (
            <p className="text-sm text-slate-600">
              Veritabanı bağlantısı yok — bugünkü görevler yüklenemedi.
            </p>
          ) : (dueToday.tasks?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Bugün için açık görev yok ✓
            </p>
          ) : (
            <div className="space-y-2.5">
              {dueToday.tasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 truncate">
                      {task.customer?.name ?? "Müşteri bağlantısı yok"}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">
                      {task.dueDate ? formatDateTime(task.dueDate) : "Termin yok"}
                    </p>
                  </div>
                </div>
              ))}
              {dueToday.tasks.length > 5 && (
                <p className="pt-1 text-center text-xs text-slate-400">
                  + {dueToday.tasks.length - 5} daha
                </p>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={TrendingUp}
          title="En Çok Satılan Ürünler"
          subtitle="Bu ayın kazandıran teklif kalemleri"
          tone="success"
          href="/products"
          hrefLabel="Ürünler"
        >
          {stats.topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Henüz kazanılan teklif kalemi yok
            </p>
          ) : (
            <ol className="space-y-2.5">
              {stats.topProducts.slice(0, 5).map((p, i) => (
                <li
                  key={p.productId}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5"
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.sku} · {p.totalQty} adet
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      {/* ── 10) Bilgi: bu pano hakkında ─────────────────────────────────── */}
      <Card className="border-slate-200 bg-slate-50 p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 flex-shrink-0 text-slate-400 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Bu pano nedir?</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Günde 1 kez açıp 5 saniyede &quot;bugün ne yapmalıyım&quot; sorusuna cevap bulman için tasarlandı.
              Üstteki <strong>Sermaye Sağlık Skoru</strong> tek bakışta durumu (0–100) verir.
              Aşağıda sırasıyla <strong>Satış</strong>, <strong>Pazaryerleri</strong>, <strong>Stok & İthalat</strong> ve <strong>Finans</strong> gruplarında ilgili sayfalara link ve özet metrikler bulursun.
              Her kartı tıklayarak detay sayfasına gidebilirsin.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function computeGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 6) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

function ScoreMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function PipelineCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const t = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
  }[tone];
  return (
    <div className={`rounded-lg ${t} px-2 py-2`}>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[9px] uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}
