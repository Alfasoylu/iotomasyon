import Link from "next/link";
import { FileText, ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import {
  formatQuoteCurrencyMode,
  formatQuoteStatus,
  getQuoteStatusTone,
} from "@/lib/quote-utils";
import { formatDateTime } from "@/lib/utils";
import { listQuotes } from "@/services/quote-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "all", label: "Tümü" },
  { value: "DRAFT", label: "Taslak" },
  { value: "SENT", label: "Gönderildi" },
  { value: "VIEWED", label: "Görüntülendi" },
  { value: "WON", label: "Kazanıldı" },
  { value: "LOST", label: "Kaybedildi" },
];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requirePermission(PERMISSIONS.QUOTES_READ);
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));

  const { quotes, total, pageSize } = await listQuotes({ status, q, page });
  const totalPages = Math.ceil(total / pageSize);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/quotes${qs ? `?${qs}` : ""}`;
  }

  const hasFilters = status !== "all" || Boolean(q);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={FileText}
        breadcrumb={[{ label: "Satış" }, { label: "Teklifler" }]}
        title="Teklifler"
        subtitle="Tüm müşteri teklifleri. Durum filtresiyle aşamayı, müşteri bazlı görünümle takibi yap."
        meta={
          <span className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-secondary)] tabular-nums">
            {total.toLocaleString("tr-TR")} teklif
          </span>
        }
      />

      {/* Filters */}
      <Card className="p-4">
        <form method="GET" action="/quotes" className="flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Teklif no veya müşteri ara..."
            className="h-9 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)] min-w-[200px]"
          />
          <select
            name="status"
            defaultValue={status}
            className="h-9 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button type="submit" size="md" variant="secondary">
            Ara
          </Button>
          {hasFilters && (
            <Link
              href="/quotes"
              className="inline-flex h-9 items-center rounded-md border border-[var(--border-default)] px-3.5 text-[13px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              Temizle
            </Link>
          )}
        </form>
      </Card>

      {/* Mobile card list (md altı) */}
      {quotes.length > 0 && (
        <div className="md:hidden space-y-2">
          {quotes.map((quote) => (
            <Link
              key={quote.id}
              href={`/quotes/${quote.id}`}
              className="block rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4 transition hover:bg-[var(--surface-3)] active:bg-[var(--surface-3)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">
                    {quote.quoteNumber}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">
                    {quote.customer.name}
                  </p>
                </div>
                <Badge tone={getQuoteStatusTone(quote.status)}>
                  {formatQuoteStatus(quote.status)}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span className="tabular-nums">{formatDateTime(quote.createdAt)}</span>
                <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  {Number(quote.total).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}{" "}
                  {formatQuoteCurrencyMode(quote.currencyMode ?? "TRY")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Desktop tablo (md+) */}
      <Card className="hidden md:block overflow-hidden">
        {quotes.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-[var(--text-muted)]">
            Teklif bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-1)] text-left">
                  <th className="px-6 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Teklif No
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Müşteri
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Durum
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Para Birimi
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Toplam
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Tarih
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Hazırlayan
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {quotes.map((quote) => (
                  <tr
                    key={quote.id}
                    className="transition hover:bg-[var(--surface-3)]"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/quotes/${quote.id}`}
                        className="font-mono text-[13px] font-semibold tabular-nums text-[var(--text-primary)] transition hover:text-[var(--accent)]"
                      >
                        {quote.quoteNumber}
                      </Link>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">
                        {quote._count.items} kalem
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/customers/${quote.customer.id}`}
                        className="text-[13px] font-medium text-[var(--text-primary)] transition hover:text-[var(--accent)]"
                      >
                        {quote.customer.name}
                      </Link>
                      {quote.customer.company && (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {quote.customer.company}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={getQuoteStatusTone(quote.status)}>
                        {formatQuoteStatus(quote.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-[13px] text-[var(--text-secondary)]">
                      {formatQuoteCurrencyMode(quote.currencyMode ?? "TRY")}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-[13px] font-semibold tabular-nums text-[var(--text-primary)]">
                      {Number(quote.total).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-4 font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
                      {formatDateTime(quote.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-[13px] text-[var(--text-secondary)]">
                      {quote.createdBy?.name ?? "—"}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        <Link href={`/quotes/${quote.id}`}>
                          <Button variant="ghost" size="sm">
                            Görüntüle
                          </Button>
                        </Link>
                        <a
                          href={`/quotes/${quote.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button variant="ghost" size="sm">
                            PDF
                          </Button>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3.5 text-[13px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
              Önceki
            </Link>
          )}
          <span className="font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3.5 text-[13px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              Sonraki
              <ChevronRight size={14} strokeWidth={1.5} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
