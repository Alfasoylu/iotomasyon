import Link from "next/link";
import {
  Users,
  ShoppingCart,
  Package,
  DollarSign,
  CheckSquare,
  TrendingUp,
  CircleAlert,
  CalendarClock,
  ListChecks,
  Link2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetricCard, type MetricStatus } from "@/components/ui/metric-card";
import { KpiCard } from "@/components/layout/kpi-card";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-medium">
            {dayName}, {dateStr}
          </p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[24px]">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)] leading-relaxed">
            Aşağıdaki sermaye sağlık skoruna ve gruplara bakarak başla.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {usdTry && (
            <span className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[var(--text-secondary)] tabular-nums">
              1 USD = ₺{usdTry.toFixed(2)}
            </span>
          )}
          {rmbUsd && rmbUsd > 0 && (
            <span className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[var(--text-secondary)] tabular-nums">
              1 USD = {rmbUsd.toFixed(2)} ¥
            </span>
          )}
          <Link
            href="/admin/exchange-rates"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Kur geçmişi →
          </Link>
        </div>
      </div>

      {/* ── 2) Sermaye Sağlık Skoru hero ─────────────────────────────── */}
      {capital.databaseAvailable && (() => {
        const scoreStatus = scoreToneToStatus(capital.scoreTone);
        const scoreColor = statusColor(scoreStatus);
        return (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            {/* Sol: Skor */}
            <Link href="/admin/sermaye-saglik" className="block">
              <div className="flex h-full flex-col justify-between rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-6 transition-colors hover:border-[var(--border-strong)]">
                <div>
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                      Sermaye Sağlık Skoru
                    </span>
                    <ArrowRight size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                  </div>
                  <div className="mt-4 flex items-baseline gap-2 tabular-nums">
                    <span
                      className="text-[64px] font-bold leading-none"
                      style={{ color: scoreColor }}
                    >
                      {capital.healthScore}
                    </span>
                    <span className="text-[20px] text-[var(--text-muted)]">/ 100</span>
                  </div>
                </div>
                <Badge variant={scoreStatus} className="self-start mt-3">
                  {capital.scoreLabel}
                </Badge>
              </div>
            </Link>

            {/* Sağ: 4 metrik */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Bağlı Sermaye"
                value={fmtUsd(capital.totalLockedUsd)}
                icon={DollarSign}
                href="/admin/capital"
              />
              <MetricCard
                label="Aylık Beklenen"
                value={fmtUsd(capital.monthlyExpectedUsd)}
                icon={TrendingUp}
                status="ok"
                href="/admin/sermaye-saglik"
              />
              <MetricCard
                label="Yıllık ROI"
                value={`%${capital.annualRoiPct.toFixed(1)}`}
                icon={TrendingUp}
                status={capital.annualRoiPct >= 50 ? "ok" : capital.annualRoiPct >= 30 ? "info" : "warn"}
              />
              <MetricCard
                label="Ölü Stok"
                value={String(capital.deadStockCount)}
                unit="ürün"
                icon={Package}
                status={capital.deadStockCount > 100 ? "warn" : "neutral"}
                href="/admin/stock-health"
              />
            </div>
          </div>
        );
      })()}

      {/* ── 3) Akıllı Öneriler kartı ──────────────────────────────────── */}
      {smartRecs.length > 0 && <SmartRecsCard recs={smartRecs} />}

      {/* ── 4) DB durumu uyarısı ──────────────────────────────────────── */}
      {!stats.databaseAvailable && (
        <Card className="p-4 text-[13px] leading-6 text-[var(--warn)]" style={{ borderColor: "var(--warn-border)", background: "var(--warn-dim)" }}>
          Veritabanı bağlantısı şu anda kullanılamıyor. Pano yüklendi ancak canlı metrikler gösterilemiyor.
        </Card>
      )}

      {/* ── 4) Bugün için manşet KPI'lar ──────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Acil Sipariş"
          value={String(capital.urgentReorderCount)}
          icon={CircleAlert}
          status={capital.urgentReorderCount > 0 ? "danger" : "neutral"}
          hint="14 günden az stoklu ürün"
          href="/admin/sermaye-saglik"
        />
        <MetricCard
          label="Bugün Görev"
          value={String(dueToday.tasks?.length ?? 0)}
          icon={CalendarClock}
          status={(dueToday.tasks?.length ?? 0) > 0 ? "warn" : "neutral"}
          hint={stats.overdueTasks > 0 ? `+ ${stats.overdueTasks} gecikmiş` : "vadesi bugün"}
          href="/tasks"
        />
        <MetricCard
          label="Açık Görev"
          value={String(stats.openFollowups)}
          icon={ListChecks}
          status="info"
          hint="devam eden tüm görevler"
          href="/tasks"
        />
        <MetricCard
          label="Eşleşmemiş Sipariş"
          value={String(alerts.unmatchedOrdersCount)}
          icon={Link2}
          status={alerts.unmatchedOrdersCount > 100 ? "warn" : "neutral"}
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
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Sparkles size={16} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-[var(--text-muted)]" />
          <div>
            <p className="text-[13px] font-medium text-[var(--text-primary)]">Bu pano nedir?</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              Günde 1 kez açıp 5 saniyede &quot;bugün ne yapmalıyım&quot; sorusuna cevap bulman için tasarlandı.
              Üstteki <strong className="text-[var(--text-primary)]">Sermaye Sağlık Skoru</strong> tek bakışta durumu (0–100) verir.
              Aşağıda sırasıyla <strong className="text-[var(--text-primary)]">Satış</strong>, <strong className="text-[var(--text-primary)]">Pazaryerleri</strong>, <strong className="text-[var(--text-primary)]">Stok & İthalat</strong> ve <strong className="text-[var(--text-primary)]">Finans</strong> gruplarında ilgili sayfalara link ve özet metrikler bulursun.
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

function scoreToneToStatus(tone: "success" | "info" | "warning" | "danger"): MetricStatus {
  if (tone === "success") return "ok";
  if (tone === "info") return "info";
  if (tone === "warning") return "warn";
  return "danger";
}

function statusColor(status: MetricStatus): string {
  switch (status) {
    case "ok":
      return "var(--ok)";
    case "warn":
      return "var(--warn)";
    case "danger":
      return "var(--danger)";
    case "info":
      return "var(--info)";
    default:
      return "var(--text-primary)";
  }
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
