/**
 * Faz 90 — CFO Kokpiti
 *
 * Günlük açılan tek ekran: bugün ne ödenecek, ne gelecek, nakit nerede duruyor,
 * gümrük rezervi kapanıyor mu, 300.000 USD hedefine göre neredeyiz.
 *
 * Hesap yapmaz — lib/cfo/engine.ts çıktısını basar.
 */

import Link from "next/link";
import {
  Wallet, CreditCard, Landmark, Ship, Target, AlertTriangle,
  TrendingUp, ArrowRight, PiggyBank,
} from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadCfoData } from "@/lib/cfo/queries";
import { buildDailyActions } from "@/lib/cfo/engine";
import { fmtTry, fmtUsd, fmtPct, fmtDate, fmtNum } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrafficBadge } from "@/components/cfo/badges";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

const ACTION_STYLE = {
  danger: "border-[var(--danger-border)] bg-[var(--danger-dim)]",
  warn: "border-[var(--warn-border)] bg-[var(--warn-dim)]",
  ok: "border-[var(--ok-border)] bg-[var(--ok-dim)]",
  info: "border-[var(--info-border)] bg-[var(--info-dim)]",
} as const;

export default async function CfoPage() {
  await requirePermission(PERMISSIONS.CFO_READ);

  const { raw, overview: o } = await loadCfoData();

  if (!raw.settings) {
    return (
      <>
        <PageHeader icon={Wallet} title="CFO Kokpiti" subtitle="Finansal kontrol merkezi" />
        <Card className="p-8 text-center">
          <p className="text-[var(--text-secondary)]">
            CFO modülü henüz kurulmamış. Ayarlar kaydı oluşturulduktan sonra bu ekran dolacak.
          </p>
          <Link href="/cfo/ayarlar" className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--accent)]">
            Ayarlara git <ArrowRight size={14} />
          </Link>
        </Card>
      </>
    );
  }

  const actions = buildDailyActions(o, raw);
  const h30 = o.horizons.find((h) => h.days === 30);
  const h60 = o.horizons.find((h) => h.days === 60);

  return (
    <>
      <PageHeader
        icon={Wallet}
        title="CFO Kokpiti"
        subtitle="Nakit, borç, alacak ve hedef tek ekranda. Tüm değerler son bilinen veriden hesaplanır."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">USD/TRY {o.usdTry.toLocaleString("tr-TR")}</Badge>
            <Badge variant="neutral">KMH maliyeti %{o.monthlyRatePct}/ay</Badge>
            {o.revenueDataAgeDays != null && (
              <Badge variant={o.revenueDataAgeDays > 21 ? "danger" : o.revenueDataAgeDays > 14 ? "warn" : "ok"}>
                Ciro verisi {o.revenueDataAgeDays} günlük
              </Badge>
            )}
          </div>
        }
      />

      {/* ── Bugün yapılacaklar ── */}
      <section className="mb-6">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          Bugün yapılacaklar
        </h2>
        <div className="space-y-2">
          {actions.length === 0 && (
            <Card className="p-4 text-sm text-[var(--text-muted)]">Bekleyen aksiyon yok.</Card>
          )}
          {actions.map((a) => (
            <div key={a.order} className={`rounded-lg border px-4 py-3 text-sm ${ACTION_STYLE[a.tone]}`}>
              <span className="mr-2 font-semibold text-[var(--text-primary)]">{a.order})</span>
              <span className="text-[var(--text-primary)]">{a.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Manşet KPI ── */}
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Net banka pozisyonu" value={fmtTry(o.netCashTry)} icon={Landmark}
          status={o.netCashTry >= 0 ? "ok" : o.netCashTry + o.freeKmhTry >= 0 ? "warn" : "danger"}
          hint={o.banksMissingBalance > 0 ? `${o.banksMissingBalance} hesabın bakiyesi bilinmiyor` : "Negatif = kullanılan KMH"}
          href="/cfo/borclar"
        />
        <MetricCard
          label="Boş KMH kapasitesi" value={fmtTry(o.freeKmhTry)} icon={PiggyBank}
          status={o.freeKmhTry >= 1_500_000 ? "ok" : o.freeKmhTry >= 750_000 ? "warn" : "danger"}
          hint={`Toplam limit ${fmtTry(o.totalKmhLimitTry)}`}
        />
        <MetricCard
          label="Kredi kartı borcu" value={fmtTry(o.cardDebtTry)} icon={CreditCard}
          status={o.cardDebtTry === 0 ? "ok" : o.cardDebtTry <= 1_000_000 ? "warn" : "danger"}
          hint={`Aylık taşıma ${fmtTry(o.cardCarryCostTry)}`}
          href="/cfo/borclar"
        />
        <MetricCard
          label="30 gün sonundaki nakit" value={fmtTry(h30?.position ?? 0)} icon={TrendingUp}
          status={h30 ? (h30.traffic === "YESIL" ? "ok" : h30.traffic === "SARI" ? "warn" : "danger") : "neutral"}
          hint={h30 ? `Giriş ${fmtTry(h30.inflow)} / Çıkış ${fmtTry(h30.outflow)}` : undefined}
          href="/cfo/nakit-akisi"
        />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Pazaryeri alacağı" value={fmtTry(o.receivablesPendingTry)} icon={Wallet} href="/cfo/alacaklar"
          hint={`${o.receivablesByChannel.length} kanal`} />
        <MetricCard label="Satılabilir stok" value={fmtTry(o.sellableStockTry)} icon={Ship}
          hint={`Yoldaki ${fmtTry(o.inTransitStockTry)} · Bloke ${fmtTry(o.blockedStockTry)}`} />
        <MetricCard label="Aylık borç servisi" value={fmtTry(o.loanMonthlyServiceTry + o.cardMinTotalTry)} icon={CreditCard}
          status={o.debtServiceRatio == null ? "neutral" : o.debtServiceRatio <= 0.4 ? "ok" : o.debtServiceRatio <= 0.6 ? "warn" : "danger"}
          hint={o.debtServiceRatio != null ? `Tahsilatın ${fmtPct(o.debtServiceRatio)}'i` : "Ciro verisi gerekli"} />
        <MetricCard label="Aylık faaliyet nakdi" value={fmtTry(o.monthlyOperatingCashTry)} icon={TrendingUp}
          status={o.monthlyOperatingCashTry > 0 ? "ok" : "danger"}
          hint="Tahsilat − sabit gider − borç servisi" />
      </section>

      {/* ── Hedef ── */}
      {o.target && (
        <Card className="mb-6 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Target size={16} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Net ticari servet hedefi — {fmtUsd(o.target.usd)}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Field label="Bugünkü servet (geniş)" value={fmtUsd(o.wideWorthUsd)} sub={fmtTry(o.wideWorthTry)} />
            <Field label="Dar tanım" value={fmtUsd(o.narrowWorthUsd)} sub="Yoldaki + bloke stok hariç" />
            <Field label="Hedefe kalan" value={fmtUsd(o.target.remainingUsd)} />
            <Field label="Kalan süre" value={o.target.monthsLeft != null ? `${o.target.monthsLeft.toFixed(1)} ay` : "—"} />
            <Field label="Gereken aylık artış" value={o.target.requiredMonthlyUsd != null ? fmtUsd(o.target.requiredMonthlyUsd) : "—"} />
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${Math.max(0, Math.min(100, o.target.progress * 100))}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Gerçekleşme {fmtPct(o.target.progress)}</p>
        </Card>
      )}

      {/* ── Forecast ── */}
      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Nakit akışı — 7 / 30 / 60 / 90 gün</h2>
          <Link href="/cfo/nakit-akisi" className="text-xs text-[var(--accent)]">Detay <ArrowRight size={12} className="inline" /></Link>
        </div>
        <CfoTable head={
          <tr>
            <Th>Dönem</Th><Th right>Beklenen giriş</Th><Th right>Zorunlu çıkış</Th>
            <Th right>Net</Th><Th right>Kümülatif pozisyon</Th><Th right>Açık</Th><Th>Durum</Th>
          </tr>
        }>
          {o.horizons.map((h) => (
            <tr key={h.days}>
              <Td strong>{h.label}</Td>
              <Td right>{fmtTry(h.inflow)}</Td>
              <Td right>{fmtTry(h.outflow)}</Td>
              <Td right danger={h.net < 0}>{fmtTry(h.net)}</Td>
              <Td right danger={h.position < 0} strong>{fmtTry(h.position)}</Td>
              <Td right>{h.gap > 0 ? fmtTry(h.gap) : "—"}</Td>
              <Td><TrafficBadge value={h.traffic} /></Td>
            </tr>
          ))}
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          SARI = açık boş KMH ile kapanır ({fmtTry(o.freeKmhTry)}). KIRMIZI = KMH kapasitesi yetmiyor.
          Pazaryeri tahsilat tahmini aynı haftadaki gerçek hakedişlerden düşülür — çift sayım yok.
        </p>
      </Card>

      {/* ── Gümrük rezervi ── */}
      {o.customs && (
        <Card className="mb-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ship size={16} className="text-[var(--text-secondary)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Gümrük rezervi</h2>
              <TrafficBadge value={o.customs.traffic} />
            </div>
            <Link href="/cfo/gumruk" className="text-xs text-[var(--accent)]">Detay <ArrowRight size={12} className="inline" /></Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <Field label="Hedef" value={fmtTry(o.customs.target)} />
            <Field label="Ayrılmış" value={fmtTry(o.customs.saved)} />
            <Field label="İhtiyaç tarihi" value={fmtDate(o.customs.dueDate)} sub={o.customs.daysLeft != null ? `${o.customs.daysLeft} gün` : undefined} />
            <Field label="Projeksiyon nakit" value={fmtTry(o.customs.projectedCash)} />
            <Field label="Finansman açığı" value={fmtTry(o.customs.gap)} />
            <Field label="KMH sonrası kalan" value={fmtTry(o.customs.remainingCapacity)} />
          </div>
          {o.customs.gap > 0 && (
            <p className="mt-3 rounded border border-[var(--warn-border)] bg-[var(--warn-dim)] px-3 py-2 text-xs text-[var(--text-primary)]">
              Açığın 1 aylık tahmini KMH faiz maliyeti {fmtTry(o.customs.interestCostMonthly)}.
              {o.customs.remainingCapacity < 0 && " KMH kapasitesi açığı karşılamıyor — ek finansman veya taksitlendirme gerekiyor."}
            </p>
          )}
        </Card>
      )}

      {/* ── Dikkat gerektirenler ── */}
      {o.needsAttention.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-[var(--warn)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Teyit / veri bekleyen {fmtNum(o.needsAttention.length)} kalem
            </h2>
          </div>
          <CfoTable head={<tr><Th>Alan</Th><Th>Kalem</Th><Th>Neden</Th></tr>}>
            {o.needsAttention.map((n, i) => (
              <tr key={i}>
                <Td muted>{n.area}</Td>
                <Td strong>{n.item}</Td>
                <Td>{n.reason}</Td>
              </tr>
            ))}
          </CfoTable>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Ödeme günü geçmiş ancak bilgi gelmemiş kalemler otomatik &quot;gecikmiş&quot; sayılmaz — teyit bekler.
          </p>
        </Card>
      )}

      {h60 && h60.traffic === "KIRMIZI" && (
        <p className="mt-4 rounded border border-[var(--danger-border)] bg-[var(--danger-dim)] px-4 py-3 text-sm text-[var(--text-primary)]">
          <strong>60 günlük pencerede {fmtTry(h60.gap)} açık var</strong> ve boş KMH kapasitesi ({fmtTry(o.freeKmhTry)}) bunu karşılamıyor.
          Yeni stok alımı ve erken kredi kapama bu açık kapanana kadar ertelenmeli.
        </p>
      )}
    </>
  );
}

function Field({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}
