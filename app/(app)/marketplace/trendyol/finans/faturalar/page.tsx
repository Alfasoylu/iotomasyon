/**
 * Faz 91 — Trendyol fatura listesi
 *
 * Yüklenen tüm Trendyol faturaları; gruba, aya, ülkeye ve serbest metne göre
 * filtrelenir. Filtreler URL'de tutulur (GET form) — link paylaşılabilir.
 */

import Link from "next/link";
import { FileText, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { TrendyolCostGroup } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadInvoices, loadInvoiceFilterOptions } from "@/lib/trendyol-finance/queries";
import { COST_GROUP_LABEL, COST_GROUP_COLOR, COST_GROUP_ORDER } from "@/lib/trendyol-finance/cost-groups";
import { fmtTry2, fmtNum, fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

const MONTH_FMT = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" });

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return MONTH_FMT.format(new Date(Date.UTC(y, m - 1, 1)));
}

const SELECT_CLASS =
  "h-9 rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-2.5 text-[13px] text-[var(--text-primary)]";

export default async function TrendyolFaturalarPage({
  searchParams,
}: {
  searchParams: Promise<{
    group?: string;
    month?: string;
    country?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const sp = await searchParams;
  const group = COST_GROUP_ORDER.includes(sp.group as TrendyolCostGroup)
    ? (sp.group as TrendyolCostGroup)
    : undefined;

  const filters = {
    group,
    month: sp.month || undefined,
    country: sp.country || undefined,
    q: sp.q?.trim() || undefined,
    page: Math.max(1, Number(sp.page ?? 1)),
  };

  const [data, options] = await Promise.all([loadInvoices(filters), loadInvoiceFilterOptions()]);

  /** Sayfalama linkleri mevcut filtreleri korur. */
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (filters.group) qs.set("group", filters.group);
    if (filters.month) qs.set("month", filters.month);
    if (filters.country) qs.set("country", filters.country);
    if (filters.q) qs.set("q", filters.q);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/marketplace/trendyol/finans/faturalar${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        icon={FileText}
        breadcrumb={[
          { label: "Pazaryerleri", href: "/marketplace" },
          { label: "Trendyol Finans", href: "/marketplace/trendyol/finans" },
          { label: "Faturalar" },
        ]}
        title="Trendyol faturaları"
        subtitle="Yüklenen tüm kesinti, komisyon ve tedarikçi faturaları. Tutarlar KDV dahildir."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{fmtNum(data.total)} fatura</Badge>
            <Badge variant="danger">Kesinti {fmtTry2(data.sumExpenseTry)}</Badge>
            {data.sumAmountTry + data.sumExpenseTry > 0.01 ? (
              <Badge variant="ok">
                Lehimize {fmtTry2(data.sumAmountTry + data.sumExpenseTry)}
              </Badge>
            ) : null}
          </div>
        }
      />

      {/* ── Filtreler ── */}
      <Card className="p-4">
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Gider grubu</span>
            <select name="group" defaultValue={filters.group ?? ""} className={SELECT_CLASS}>
              <option value="">Tümü</option>
              {COST_GROUP_ORDER.map((g) => (
                <option key={g} value={g}>
                  {COST_GROUP_LABEL[g]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Ay</span>
            <select name="month" defaultValue={filters.month ?? ""} className={SELECT_CLASS}>
              <option value="">Tümü</option>
              {options.months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Ülke</span>
            <select name="country" defaultValue={filters.country ?? ""} className={SELECT_CLASS}>
              <option value="">Tümü</option>
              {options.countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Ara</span>
            <input
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Fatura no veya tip…"
              className={`${SELECT_CLASS} w-full min-w-[12rem]`}
            />
          </label>

          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 text-[13px] font-medium text-[var(--accent-fg)] hover:brightness-110"
          >
            <Search size={13} /> Filtrele
          </button>

          {filters.group || filters.month || filters.country || filters.q ? (
            <Link
              href="/marketplace/trendyol/finans/faturalar"
              className="inline-flex h-9 items-center rounded-md px-3 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Temizle
            </Link>
          ) : null}
        </form>
      </Card>

      {/* ── Liste ── */}
      <Card className="mt-4 p-0">
        <CfoTable
          head={
            <tr>
              <Th>Fatura no</Th>
              <Th>Tarih</Th>
              <Th>Tip</Th>
              <Th>Grup</Th>
              <Th>Ülke</Th>
              <Th right>Tutar</Th>
              <Th right>KDV hariç</Th>
              <Th right>Detay</Th>
            </tr>
          }
          empty={data.rows.length === 0 ? "Bu filtreyle fatura bulunamadı." : undefined}
        >
          {data.rows.map((r) => (
            <tr key={r.id} className="hover:bg-[var(--surface-3)]">
              <Td strong>
                <span className="font-mono text-[12px]">{r.invoiceNo}</span>
                {r.pdfParsed ? (
                  <span className="ml-1.5 text-[10px] text-[var(--ok)]" title="PDF yüklendi, KDV kesin">
                    ●
                  </span>
                ) : null}
              </Td>
              <Td muted>{fmtDate(r.invoiceDate)}</Td>
              <Td>
                {r.invoiceType}
                {r.description ? (
                  <span className="mt-0.5 block max-w-[26rem] truncate text-[11px] text-[var(--text-muted)]">
                    {r.description}
                  </span>
                ) : null}
              </Td>
              <Td>
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: COST_GROUP_COLOR[r.costGroup] }}
                  />
                  <span className="text-xs">{COST_GROUP_LABEL[r.costGroup]}</span>
                </span>
              </Td>
              <Td muted>{r.country ?? "—"}</Td>
              <Td right strong danger={r.amountTry < 0}>
                {fmtTry2(r.amountTry)}
              </Td>
              <Td right muted>
                {r.netTry != null ? fmtTry2(r.netTry) : "—"}
              </Td>
              <Td right muted>
                {r.lineCount > 0 ? `${fmtNum(r.lineCount)} satır` : "—"}
              </Td>
            </tr>
          ))}
        </CfoTable>
      </Card>

      {/* ── Sayfalama ── */}
      {data.pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-[var(--text-muted)]">
            Sayfa {data.page} / {data.pageCount} · {fmtNum(data.total)} kayıt
          </span>
          <div className="flex gap-2">
            {data.page > 1 ? (
              <Link
                href={pageHref(data.page - 1)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border-default)] px-3 text-[13px] hover:border-[var(--border-strong)]"
              >
                <ChevronLeft size={13} /> Önceki
              </Link>
            ) : null}
            {data.page < data.pageCount ? (
              <Link
                href={pageHref(data.page + 1)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border-default)] px-3 text-[13px] hover:border-[var(--border-strong)]"
              >
                Sonraki <ChevronRight size={13} />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
