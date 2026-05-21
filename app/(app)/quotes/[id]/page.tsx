import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteStatusButtons } from "@/components/quotes/quote-status-buttons";
import { QuoteWhatsAppButton } from "@/components/quotes/quote-whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import {
  formatCurrencyAmount,
  formatDisplayPair,
  formatQuoteCurrencyMode,
  formatQuoteStatus,
  getQuoteStatusTone,
  getStoredTaxRateDisplay,
  resolveDisplayAmounts,
} from "@/lib/quote-utils";
import { formatDateTime } from "@/lib/utils";
import { getQuoteById } from "@/services/quote-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.QUOTES_READ);
  const { id } = await params;
  const quote = await getQuoteById(id);

  if (!quote) {
    notFound();
  }

  const quoteCurrency = quote.items[0]?.currency ?? "TRY";
  const currencyMode = quote.currencyMode ?? "TRY";
  const exchangeRate = quote.exchangeRate != null ? Number(quote.exchangeRate) : null;

  const subtotalDisplay = formatDisplayPair(
    resolveDisplayAmounts(Number(quote.subtotal), quoteCurrency, currencyMode, exchangeRate),
  );
  const discountDisplay = formatDisplayPair(
    resolveDisplayAmounts(Number(quote.discountTotal), quoteCurrency, currencyMode, exchangeRate),
  );
  const taxDisplay = formatDisplayPair(
    resolveDisplayAmounts(Number(quote.taxTotal), quoteCurrency, currencyMode, exchangeRate),
  );
  const totalDisplay = formatDisplayPair(
    resolveDisplayAmounts(Number(quote.total), quoteCurrency, currencyMode, exchangeRate),
  );

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)]">
        <div className="h-px bg-[var(--accent)]" />
        <div className="px-6 py-7 xl:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <Link
                href="/quotes"
                className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                ← Teklifler
              </Link>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
                    {quote.quoteNumber}
                  </h1>
                  <Badge tone={getQuoteStatusTone(quote.status)}>
                    {formatQuoteStatus(quote.status)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {quote.customer.name}
                  {quote.customer.company ? ` · ${quote.customer.company}` : ""}
                  {" · "}
                  {formatDateTime(quote.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                <span className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1 tabular-nums">
                  {formatQuoteCurrencyMode(currencyMode)}
                  {exchangeRate ? ` · 1 USD = ${exchangeRate.toLocaleString("tr-TR")} TL` : ""}
                </span>
                {quote.validityDate ? (
                  <span className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1">
                    Geçerlilik: {formatDateTime(quote.validityDate)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <QuoteStatusButtons quoteId={quote.id} currentStatus={quote.status} />
              <Link href={`/quotes/${quote.id}/edit`}>
                <Button variant="secondary">Düzenle</Button>
              </Link>
              <a href={`/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">
                <Button variant="secondary">PDF indir</Button>
              </a>
              <QuoteWhatsAppButton
                quoteId={quote.id}
                phone={quote.customer.whatsapp ?? quote.customer.phone}
                customerName={quote.customer.name}
                quoteNumber={quote.quoteNumber}
                totalDisplay={totalDisplay}
                validityDate={quote.validityDate}
              />
              <Link href={`/customers/${quote.customerId}`}>
                <Button variant="ghost">Müşteriye dön</Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Grand total accent bar */}
        <div className="border-t border-[var(--border-default)] bg-[var(--surface-2)] px-6 py-4 xl:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Genel Toplam
            </p>
            <p className="text-xl font-semibold tabular-nums text-[var(--accent)]">{totalDisplay}</p>
          </div>
        </div>
      </div>

      {/* Two-column content */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        {/* Left: customer + items + notes */}
        <div className="space-y-6">
          {/* Customer */}
          <Card className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Alıcı
            </p>
            <h2 className="mt-2 text-base font-semibold text-[var(--text-primary)]">Müşteri bilgileri</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <Info label="Müşteri adı" value={quote.customer.name} />
              <Info label="Firma" value={quote.customer.company ?? "Belirtilmedi"} />
              <Info label="Telefon" value={quote.customer.phone ?? "Belirtilmedi"} />
              <Info label="WhatsApp" value={quote.customer.whatsapp ?? "Belirtilmedi"} />
              <Info label="E-posta" value={quote.customer.email ?? "Belirtilmedi"} />
              <Info label="Vergi no" value={quote.customer.taxNumber ?? "Belirtilmedi"} />
            </dl>
          </Card>

          {/* Items table */}
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border-subtle)] px-6 py-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Kalemler
              </p>
              <h2 className="mt-2 text-base font-semibold text-[var(--text-primary)]">Teklif detayları</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-[var(--surface-1)] text-left">
                    <th className="px-6 py-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                      Ürün / Açıklama
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                      Adet
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                      Birim fiyat
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                      İndirim
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                      KDV
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                      Toplam
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {quote.items.map((item) => {
                    const unitDisplay = formatDisplayPair(
                      resolveDisplayAmounts(
                        Number(item.unitPrice),
                        item.currency,
                        currencyMode,
                        exchangeRate,
                      ),
                    );
                    const taxRateDisplay = getStoredTaxRateDisplay(
                      item.quantity,
                      item.unitPrice.toString(),
                      item.discount.toString(),
                      item.tax.toString(),
                    );
                    const taxAmountDisplay = formatDisplayPair(
                      resolveDisplayAmounts(
                        Number(item.tax),
                        item.currency,
                        currencyMode,
                        exchangeRate,
                      ),
                    );
                    const totalRowDisplay = formatDisplayPair(
                      resolveDisplayAmounts(
                        Number(item.total),
                        item.currency,
                        currencyMode,
                        exchangeRate,
                      ),
                    );

                    return (
                      <tr key={item.id}>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{item.description}</p>
                          {item.product ? (
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              {item.product.name}{" "}
                              <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[var(--text-secondary)]">
                                {item.product.sku}
                              </span>
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-[var(--text-muted)]">Manuel kalem</p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm tabular-nums font-mono text-[var(--text-secondary)]">{item.quantity}</td>
                        <td className="px-4 py-4 text-sm tabular-nums font-mono text-[var(--text-secondary)]">{unitDisplay}</td>
                        <td className="px-4 py-4 text-sm tabular-nums font-mono text-[var(--text-secondary)]">
                          {formatCurrencyAmount(item.discount.toString(), item.currency)}
                        </td>
                        <td className="px-4 py-4 text-sm tabular-nums font-mono text-[var(--text-secondary)]">
                          {taxRateDisplay ?? taxAmountDisplay}
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums font-mono text-[var(--text-primary)]">
                          {totalRowDisplay}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--border-default)] bg-[var(--surface-1)]">
                    <td
                      colSpan={5}
                      className="px-6 py-4 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]"
                    >
                      Genel Toplam
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums font-mono text-[var(--text-primary)]">
                      {totalDisplay}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* Notes */}
          {quote.notes ? (
            <Card className="p-6">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Teklif notu
              </p>
              <div className="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 text-sm leading-7 text-[var(--text-secondary)]">
                {quote.notes}
              </div>
            </Card>
          ) : null}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          {/* Totals */}
          <Card className="overflow-hidden">
            <div className="p-6">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Toplamlar
              </p>
              <dl className="mt-5 space-y-3">
                <InfoRow label="Ara toplam" value={subtotalDisplay} />
                <InfoRow label="İndirim" value={discountDisplay} />
                <InfoRow label="KDV" value={taxDisplay} />
              </dl>
            </div>
            <div className="border-t border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-5">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Genel toplam
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums font-mono text-[var(--accent)]">{totalDisplay}</p>
            </div>
          </Card>

          {/* Commercial terms */}
          <Card className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Ticari Koşullar
            </p>
            <div className="mt-5 space-y-4">
              <TermBlock label="Ödeme" value={quote.paymentTerms ?? COMPANY_SETTINGS.paymentTerms} />
              <TermBlock label="Teslimat" value={quote.deliveryTerms ?? COMPANY_SETTINGS.deliveryTerms} />
              <TermBlock label="Garanti" value={quote.warrantyTerms ?? COMPANY_SETTINGS.warrantyTerms} />
            </div>
          </Card>

          {/* Quote metadata */}
          <Card className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Teklif bilgileri
            </p>
            <dl className="mt-5 space-y-3">
              <InfoRow label="Oluşturulma" value={formatDateTime(quote.createdAt)} />
              {quote.sentAt ? (
                <InfoRow label="Gönderilme" value={formatDateTime(quote.sentAt)} />
              ) : null}
              {quote.validityDate ? (
                <InfoRow label="Geçerlilik" value={formatDateTime(quote.validityDate)} />
              ) : null}
              <InfoRow label="Hazırlayan" value={quote.createdBy?.name ?? "Sistem"} />
              <InfoRow label="Şirket" value={COMPANY_SETTINGS.salesContact} />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right text-sm tabular-nums font-mono text-[var(--text-secondary)]">{value}</dd>
    </div>
  );
}

function TermBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">{value}</p>
    </div>
  );
}
