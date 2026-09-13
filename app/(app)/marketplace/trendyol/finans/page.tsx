/**
 * Faz 91 — Trendyol Finans kokpiti
 *
 * Trendyol'un bizden kestiği her kalem (komisyon, kargo, işlem bedeli, reklam,
 * ceza) tek ekranda. Veri Trendyol partner panelinden indirilen dosyaların
 * buraya yüklenmesiyle birikir — API entegrasyonu değil, dosya beslemesi.
 *
 * Hesap yapmaz; lib/trendyol-finance/queries.ts çıktısını basar.
 */

import Link from "next/link";
import {
  Receipt, TrendingDown, ArrowRight, Percent, Package,
  FileWarning, Wallet, Calculator,
} from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadFinanceOverview, loadRecentImports, ASSUMED_VAT_RATE } from "@/lib/trendyol-finance/queries";
import { COST_GROUP_LABEL, COST_GROUP_COLOR } from "@/lib/trendyol-finance/cost-groups";
import { FILE_KIND_LABEL, type TrendyolFileKind } from "@/lib/trendyol-finance/parse";
import { fmtTry, fmtTry2, fmtNum, fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import { TrendyolFinanceUpload } from "@/components/trendyol/finance-upload";

export const dynamic = "force-dynamic";

const MONTH_FMT = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" });

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return MONTH_FMT.format(new Date(Date.UTC(y, m - 1, 1)));
}

export default async function TrendyolFinansPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const [o, imports] = await Promise.all([loadFinanceOverview(), loadRecentImports(10)]);

  const header = (
    <PageHeader
      icon={Receipt}
      breadcrumb={[{ label: "Pazaryerleri", href: "/marketplace" }, { label: "Trendyol Finans" }]}
      title="Trendyol Finans"
      subtitle="Trendyol'un kestiği komisyon, kargo, hizmet, reklam ve ceza faturaları burada birikir — net maliyet tek ekranda."
      meta={
        o.hasData ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">
              {fmtNum(o.invoiceCount)} fatura · {fmtDate(o.firstDate)} → {fmtDate(o.lastDate)}
            </Badge>
            {o.detail.lineCount > 0 ? (
              <Badge variant="neutral">{fmtNum(o.detail.lineCount)} kesinti satırı</Badge>
            ) : null}
            {o.settlement.lineCount > 0 ? (
              <Badge variant="neutral">{fmtNum(o.settlement.lineCount)} hakediş satırı</Badge>
            ) : null}
          </div>
        ) : null
      }
      actions={
        o.hasData ? (
          <div className="flex gap-2">
            <Link
              href="/marketplace/trendyol/finans/faturalar"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3.5 text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]"
            >
              Faturalar <ArrowRight size={13} />
            </Link>
            <Link
              href="/marketplace/trendyol/finans/siparisler"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3.5 text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]"
            >
              Sipariş maliyetleri <ArrowRight size={13} />
            </Link>
          </div>
        ) : null
      }
    />
  );

  // ── Veri yoksa: yalnız yükleme alanı ve ne yükleneceğinin açıklaması ──
  if (!o.hasData) {
    return (
      <>
        {header}
        <Card className="p-6">
          <TrendyolFinanceUpload />
        </Card>
        <Card className="mt-4 p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Hangi dosyalar yüklenir?</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Trendyol partner panelinde <strong>Finans → Faturalar</strong> ekranına girin.
            Listedeki her fatura satırının hem belgesini (PDF) hem de varsa detay
            dökümünü (Excel) indirebilirsiniz. Ekranın üstündeki
            &quot;Excel&apos;e aktar&quot; ile tüm fatura listesini de indirin — en hızlı
            başlangıç odur.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-[var(--text-secondary)]">
            {(Object.keys(FILE_KIND_LABEL) as TrendyolFileKind[]).map((k) => (
              <li key={k} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                <span>
                  <strong className="text-[var(--text-primary)]">{FILE_KIND_LABEL[k]}</strong>
                  {" — "}
                  {KIND_HINT[k]}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  const deltaPct =
    o.last30.prevExpenseTry > 0
      ? ((o.last30.expenseTry - o.last30.prevExpenseTry) / o.last30.prevExpenseTry) * 100
      : null;

  const maxGroup = Math.max(...o.byGroup.map((g) => g.expenseTry), 1);
  const recentMonths = o.byMonth.slice(-13).reverse();
  const topGroups = o.byGroup
    .filter((g) => g.group !== "IADE_ALACAK")
    .slice(0, 5)
    .map((g) => g.group);

  return (
    <>
      {header}

      {/* ── Yükleme ── */}
      <Card className="p-5">
        <TrendyolFinanceUpload />
      </Card>

      {/* ── Manşet ── */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Toplam kesinti (KDV dahil)"
          value={fmtTry(o.totalExpenseTry)}
          icon={TrendingDown}
          status="danger"
          hint={`${fmtNum(o.invoiceCount)} fatura`}
        />
        <MetricCard
          label="KDV hariç gerçek maliyet"
          value={fmtTry(o.vat.estimatedNetExpenseTry)}
          icon={Calculator}
          status="warn"
          hint={
            o.vat.knownInvoices > 0
              ? `${fmtNum(o.vat.knownInvoices)} faturada kesin, kalanı %${ASSUMED_VAT_RATE * 100} varsayımı`
              : `Tümü %${ASSUMED_VAT_RATE * 100} KDV varsayımı — PDF yükleyin, kesinleşsin`
          }
        />
        <MetricCard
          label="Son 30 gün kesinti"
          value={fmtTry(o.last30.expenseTry)}
          icon={Receipt}
          status={deltaPct != null && deltaPct > 0 ? "danger" : "ok"}
          delta={
            deltaPct != null
              ? {
                  value: `%${Math.abs(deltaPct).toFixed(1)}`,
                  direction: deltaPct > 0 ? "down" : "up",
                }
              : undefined
          }
          hint="önceki 30 güne göre"
        />
        <MetricCard
          label="Ortalama komisyon oranı"
          value={o.settlement.commissionPct != null ? `%${o.settlement.commissionPct.toFixed(1)}` : "—"}
          icon={Percent}
          status="info"
          hint={
            o.settlement.lineCount > 0
              ? `${fmtNum(o.settlement.lineCount)} hakediş satırı`
              : "Hakediş dosyası yüklenmedi"
          }
        />
      </div>

      {o.totalCreditTry > 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] px-3 py-2 text-sm text-[var(--ok)]">
          <Wallet size={14} />
          Lehimize kesilen faturalar (iade/tazmin): <strong>{fmtTry2(o.totalCreditTry)}</strong> —
          net kesinti {fmtTry(o.netExpenseTry)}.
        </p>
      ) : null}

      {o.detail.unlinkedSources > 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-3 py-2 text-sm text-[var(--warn)]">
          <FileWarning size={14} />
          {o.detail.unlinkedSources} detay dosyası bir fatura başlığına bağlanamadı. Fatura
          listesini (Faturalar_*.xlsx) yüklerseniz toplam tutar üzerinden eşleşir.
        </p>
      ) : null}

      {/* ── Gider grubu kırılımı ── */}
      <Card className="mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Gider grubu kırılımı</h2>
          <span className="text-xs text-[var(--text-muted)]">tüm dönem</span>
        </div>

        <div className="space-y-2.5">
          {o.byGroup.map((g) => {
            const share = o.totalExpenseTry > 0 ? (g.expenseTry / o.totalExpenseTry) * 100 : 0;
            return (
              <Link
                key={g.group}
                href={`/marketplace/trendyol/finans/faturalar?group=${g.group}`}
                className="block rounded-md px-1 py-1 transition-colors hover:bg-[var(--surface-3)]"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-[var(--text-primary)]">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: COST_GROUP_COLOR[g.group] }}
                    />
                    {COST_GROUP_LABEL[g.group]}
                    <span className="text-xs text-[var(--text-muted)]">
                      {fmtNum(g.invoiceCount)} fatura
                    </span>
                  </span>
                  <span className="tabular-nums text-[var(--text-primary)]">
                    {fmtTry(g.expenseTry)}
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      %{share.toFixed(1)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(g.expenseTry / maxGroup) * 100}%`,
                      background: COST_GROUP_COLOR[g.group],
                    }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* ── Aylık seyir ── */}
      <Card className="mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Aylık kesinti seyri</h2>
          <span className="text-xs text-[var(--text-muted)]">son 13 ay</span>
        </div>

        <CfoTable
          head={
            <tr>
              <Th>Ay</Th>
              {topGroups.map((g) => (
                <Th key={g} right>
                  {COST_GROUP_LABEL[g]}
                </Th>
              ))}
              <Th right>Toplam</Th>
            </tr>
          }
          empty={recentMonths.length === 0 ? "Henüz fatura yok." : undefined}
        >
          {recentMonths.map((m) => (
            <tr key={m.month} className="hover:bg-[var(--surface-3)]">
              <Td strong>
                <Link
                  href={`/marketplace/trendyol/finans/faturalar?month=${m.month}`}
                  className="hover:text-[var(--accent)]"
                >
                  {monthLabel(m.month)}
                </Link>
              </Td>
              {topGroups.map((g) => (
                <Td key={g} right muted={!m.byGroup[g]}>
                  {m.byGroup[g] ? fmtTry(m.byGroup[g]) : "—"}
                </Td>
              ))}
              <Td right strong>
                {fmtTry(m.expenseTry)}
              </Td>
            </tr>
          ))}
        </CfoTable>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ── En büyük fatura tipleri ── */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            En çok kesen fatura tipleri
          </h2>
          <CfoTable
            head={
              <tr>
                <Th>Fatura tipi</Th>
                <Th right>Adet</Th>
                <Th right>Tutar</Th>
              </tr>
            }
          >
            {o.byType.slice(0, 12).map((t) => (
              <tr key={`${t.invoiceType}-${t.group}`} className="hover:bg-[var(--surface-3)]">
                <Td>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: COST_GROUP_COLOR[t.group] }}
                    />
                    {t.invoiceType}
                  </span>
                </Td>
                <Td right muted>
                  {fmtNum(t.count)}
                </Td>
                <Td right strong>
                  {fmtTry(t.expenseTry)}
                </Td>
              </tr>
            ))}
          </CfoTable>
        </Card>

        {/* ── Ülke kırılımı ── */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Ülkeye göre kesinti</h2>
          <CfoTable
            head={
              <tr>
                <Th>Ülke</Th>
                <Th right>Fatura</Th>
                <Th right>Tutar</Th>
              </tr>
            }
            empty={o.byCountry.length === 0 ? "Ülke bilgisi yok." : undefined}
          >
            {o.byCountry.map((c) => (
              <tr key={c.country} className="hover:bg-[var(--surface-3)]">
                <Td strong>
                  {c.country === "Belirtilmemiş" ? (
                    <span className="text-[var(--text-muted)]">{c.country}</span>
                  ) : (
                    <Link
                      href={`/marketplace/trendyol/finans/faturalar?country=${encodeURIComponent(c.country)}`}
                      className="hover:text-[var(--accent)]"
                    >
                      {c.country}
                    </Link>
                  )}
                </Td>
                <Td right muted>
                  {fmtNum(c.invoiceCount)}
                </Td>
                <Td right>{fmtTry(c.expenseTry)}</Td>
              </tr>
            ))}
          </CfoTable>
        </Card>
      </div>

      {/* ── Yükleme günlüğü ── */}
      <Card className="mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Son yüklemeler</h2>
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Package size={12} />
            {fmtNum(o.detail.orderCount)} siparişe maliyet dağıtıldı
          </span>
        </div>

        <CfoTable
          head={
            <tr>
              <Th>Dosya</Th>
              <Th>Tür</Th>
              <Th right>Satır</Th>
              <Th right>Tutar</Th>
              <Th right>Tarih</Th>
            </tr>
          }
          empty={imports.length === 0 ? "Henüz dosya yüklenmedi." : undefined}
        >
          {imports.map((im) => (
            <tr key={im.id} className="hover:bg-[var(--surface-3)]">
              <Td>
                <span className="flex items-center gap-2">
                  {im.ok ? null : <Badge variant="danger">hata</Badge>}
                  <span className="max-w-[22rem] truncate" title={im.fileName}>
                    {im.fileName}
                  </span>
                </span>
                {im.error ? (
                  <span className="mt-0.5 block text-[11px] text-[var(--danger)]">{im.error}</span>
                ) : null}
              </Td>
              <Td muted>
                {FILE_KIND_LABEL[im.fileKind as TrendyolFileKind] ?? im.fileKind}
              </Td>
              <Td right muted>
                {im.rowsNew > 0 ? `+${fmtNum(im.rowsNew)}` : "—"}
                <span className="ml-1 text-[11px] text-[var(--text-muted)]">
                  / {fmtNum(im.rowsTotal)}
                </span>
              </Td>
              <Td right>{im.amountTotalTry != null ? fmtTry2(im.amountTotalTry) : "—"}</Td>
              <Td right muted>
                {fmtDate(im.importedAt)}
              </Td>
            </tr>
          ))}
        </CfoTable>
      </Card>
    </>
  );
}

/** Boş ekranda "hangi dosya ne işe yarar" açıklamaları. */
const KIND_HINT: Record<TrendyolFileKind, string> = {
  INVOICE_LIST: "tüm faturaların özeti; en önemli dosya, önce bunu yükleyin (Faturalar_*.xlsx)",
  INVOICE_PDF: "tek faturanın belgesi; KDV kırılımını buradan alırız (SaticiFatura_*.pdf)",
  SETTLEMENT: "hakediş dökümü; komisyon oranı ve satıcı payı buradan gelir",
  LINE_CARGO: "kargo faturasının sipariş bazında dökümü",
  LINE_SERVICE_FEE: "platform/işlem bedelinin sipariş bazında dökümü",
  LINE_DEDUCTION: "teslim edilemeyen gönderi gibi tekil kesintiler",
  LINE_PENALTY: "kusurlu/eksik ürün ceza faturalarının dökümü",
  LINE_MICRO_EXPORT: "mikro ihracat sipariş bedelleri",
  LINE_RETURN_FEE: "mikro ihracat iade bedelleri",
};
