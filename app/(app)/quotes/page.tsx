import Link from "next/link";
import { FileText } from "lucide-react";

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={FileText}
        breadcrumb={[{ label: "Satış" }, { label: "Teklifler" }]}
        title="Teklifler"
        subtitle="Tüm müşteri teklifleri. Durum filtresiyle aşamayı, müşteri bazlı görünümle takibi yap."
        meta={
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {total.toLocaleString("tr-TR")} teklif
          </span>
        }
      />

      {/* Filters */}
      <Card className="p-4">
        <form method="GET" action="/quotes" className="flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Teklif no veya müşteri ara..."
            className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 min-w-[200px]"
          />
          <select
            name="status"
            defaultValue={status}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Ara
          </button>
          {(status !== "all" || q) && (
            <Link
              href="/quotes"
              className="flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600 transition hover:bg-slate-50"
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
              className="block rounded-2xl border border-slate-200 bg-white p-4 transition active:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {quote.quoteNumber}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 truncate">
                    {quote.customer.name}
                  </p>
                </div>
                <Badge tone={getQuoteStatusTone(quote.status)}>
                  {formatQuoteStatus(quote.status)}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{formatDateTime(quote.createdAt)}</span>
                <span className="font-mono font-semibold text-slate-900">
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
          <div className="p-10 text-center text-sm text-slate-500">
            Teklif bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Teklif No
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Müşteri
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Durum
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Para Birimi
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Toplam
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Tarih
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Hazırlayan
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((quote, idx) => (
                  <tr
                    key={quote.id}
                    className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/quotes/${quote.id}`}
                        className="font-mono text-sm font-semibold text-slate-900 hover:text-orange-600"
                      >
                        {quote.quoteNumber}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {quote._count.items} kalem
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/customers/${quote.customer.id}`}
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        {quote.customer.name}
                      </Link>
                      {quote.customer.company && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          {quote.customer.company}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={getQuoteStatusTone(quote.status)}>
                        {formatQuoteStatus(quote.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {formatQuoteCurrencyMode(quote.currencyMode ?? "TRY")}
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">
                      {Number(quote.total).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">
                      {formatDateTime(quote.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">
                      {quote.createdBy?.name ?? "—"}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/quotes/${quote.id}`}>
                          <Button variant="ghost" className="h-8 px-3 text-xs">
                            Görüntüle
                          </Button>
                        </Link>
                        <a
                          href={`/quotes/${quote.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button
                            variant="ghost"
                            className="h-8 px-3 text-xs text-slate-500"
                          >
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
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              ← Önceki
            </Link>
          )}
          <span className="text-sm text-slate-500">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Sonraki →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
