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
      <div className="overflow-hidden rounded-3xl bg-slate-950">
        <div className="h-1 bg-orange-500" />
        <div className="px-6 py-8 xl:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Fiyat Teklifi
              </p>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-white">
                    {quote.quoteNumber}
                  </h1>
                  <Badge tone={getQuoteStatusTone(quote.status)}>
                    {formatQuoteStatus(quote.status)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {quote.customer.name}
                  {quote.customer.company ? ` · ${quote.customer.company}` : ""}
                  {" · "}
                  {formatDateTime(quote.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-slate-400">
                <span className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5">
                  {formatQuoteCurrencyMode(currencyMode)}
                  {exchangeRate ? ` · 1 USD = ${exchangeRate.toLocaleString("tr-TR")} TL` : ""}
                </span>
                {quote.validityDate ? (
                  <span className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5">
                    Geçerlilik: {formatDateTime(quote.validityDate)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
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
                <Button variant="ghost" className="text-slate-300 hover:text-white">
                  Müşteriye dön
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Grand total accent bar */}
        <div className="border-t border-orange-900/40 bg-slate-900 px-6 py-4 xl:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Genel Toplam
            </p>
            <p className="text-2xl font-semibold text-orange-400">{totalDisplay}</p>
          </div>
        </div>
      </div>

      {/* Two-column content */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        {/* Left: customer + items + notes */}
        <div className="space-y-6">
          {/* Customer */}
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Alıcı
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Müşteri bilgileri</h2>
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
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Kalemler
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Teklif detayları</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      Ürün / Açıklama
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      Adet
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      Birim fiyat
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      İndirim
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      KDV
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      Toplam
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quote.items.map((item, idx) => {
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
                      <tr
                        key={item.id}
                        className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}
                      >
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-900">{item.description}</p>
                          {item.product ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {item.product.name}{" "}
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono">
                                {item.product.sku}
                              </span>
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-slate-400">Manuel kalem</p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">{item.quantity}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">{unitDisplay}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {formatCurrencyAmount(item.discount.toString(), item.currency)}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {taxRateDisplay ?? taxAmountDisplay}
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">
                          {totalRowDisplay}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td
                      colSpan={5}
                      className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500"
                    >
                      Genel Toplam
                    </td>
                    <td className="px-4 py-4 text-right text-base font-semibold text-slate-950">
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
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Teklif notu
              </p>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
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
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Toplamlar
              </p>
              <dl className="mt-5 space-y-3">
                <InfoRow label="Ara toplam" value={subtotalDisplay} />
                <InfoRow label="İndirim" value={discountDisplay} />
                <InfoRow label="KDV" value={taxDisplay} />
              </dl>
            </div>
            <div className="bg-slate-950 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Genel toplam
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{totalDisplay}</p>
            </div>
          </Card>

          {/* Commercial terms */}
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
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
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
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
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="text-right text-sm text-slate-700">{value}</dd>
    </div>
  );
}

function TermBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-sm leading-6 text-slate-600">{value}</p>
    </div>
  );
}
