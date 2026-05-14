import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteStatusButtons } from "@/components/quotes/quote-status-buttons";
import { QuoteWhatsAppButton } from "@/components/quotes/quote-whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <Badge tone={getQuoteStatusTone(quote.status)}>{formatQuoteStatus(quote.status)}</Badge>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  {quote.quoteNumber}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  {quote.customer.name}
                  {quote.customer.company ? ` • ${quote.customer.company}` : ""}
                </p>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
                Müşteri için hazırlanan teklif, PDF ve WhatsApp paylaşımında aynı para görünümünü
                kullanır. Aşağıda toplamlar, KDV görünümü ve geçerlilik bilgileri yer alır.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <QuoteStatusButtons quoteId={quote.id} currentStatus={quote.status} />
              <a href={`/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">
                <span className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-slate-50">
                  PDF indir
                </span>
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

        <div className="grid gap-6 px-6 py-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Müşteri özeti
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">Teklif alıcısı</h2>
                </div>
              </div>

              <dl className="mt-5 grid gap-4 md:grid-cols-2">
                <Info label="Müşteri adı" value={quote.customer.name} />
                <Info label="Firma" value={quote.customer.company ?? "Belirtilmedi"} />
                <Info label="Telefon" value={quote.customer.phone ?? "Belirtilmedi"} />
                <Info label="WhatsApp" value={quote.customer.whatsapp ?? "Belirtilmedi"} />
                <Info label="E-posta" value={quote.customer.email ?? "Belirtilmedi"} />
                <Info label="Vergi no" value={quote.customer.taxNumber ?? "Belirtilmedi"} />
              </dl>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Kalemler
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">Teklif detayları</h2>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {formatQuoteCurrencyMode(currencyMode)}
                  {exchangeRate ? ` • 1 USD = ${exchangeRate.toLocaleString("tr-TR")} TL` : ""}
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.25em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Ürün / Açıklama</th>
                      <th className="px-4 py-3">Adet</th>
                      <th className="px-4 py-3">Birim fiyat</th>
                      <th className="px-4 py-3">İndirim</th>
                      <th className="px-4 py-3">KDV</th>
                      <th className="px-4 py-3">Toplam</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-sm">
                    {quote.items.map((item) => {
                      const unitDisplay = formatDisplayPair(
                        resolveDisplayAmounts(
                          Number(item.unitPrice),
                          item.currency,
                          currencyMode,
                          exchangeRate,
                        ),
                      );
                      const taxAmountDisplay = formatDisplayPair(
                        resolveDisplayAmounts(Number(item.tax), item.currency, currencyMode, exchangeRate),
                      );
                      const taxRateDisplay = getStoredTaxRateDisplay(
                        item.quantity,
                        item.unitPrice.toString(),
                        item.discount.toString(),
                        item.tax.toString(),
                      );
                      const totalRowDisplay = formatDisplayPair(
                        resolveDisplayAmounts(Number(item.total), item.currency, currencyMode, exchangeRate),
                      );

                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-slate-900">{item.description}</p>
                            <p className="text-slate-500">
                              {item.product
                                ? `${item.product.name} (${item.product.sku})`
                                : "Manuel kalem"}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-slate-600">{item.quantity}</td>
                          <td className="px-4 py-4 text-slate-600">{unitDisplay}</td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatCurrencyAmount(item.discount.toString(), item.currency)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {taxRateDisplay ?? taxAmountDisplay}
                          </td>
                          <td className="px-4 py-4 font-semibold text-slate-900">
                            {totalRowDisplay}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Toplamlar
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Teklif özeti</h2>

              <dl className="mt-5 space-y-4">
                <Info label="Para birimi görünümü" value={formatQuoteCurrencyMode(currencyMode)} />
                {exchangeRate ? (
                  <Info label="Kur" value={`1 USD = ${exchangeRate.toLocaleString("tr-TR")} TL`} />
                ) : null}
                <Info label="Ara toplam" value={subtotalDisplay} />
                <Info label="İndirim" value={discountDisplay} />
                <Info label="KDV" value={taxDisplay} />
                <Info label="Genel toplam" value={totalDisplay} strong />
              </dl>
            </Card>

            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Teklif bilgileri
              </p>
              <dl className="mt-5 space-y-4">
                <Info label="Oluşturulma" value={formatDateTime(quote.createdAt)} />
                {quote.sentAt ? <Info label="Gönderilme" value={formatDateTime(quote.sentAt)} /> : null}
                {quote.validityDate ? (
                  <Info label="Geçerlilik" value={formatDateTime(quote.validityDate)} />
                ) : null}
                <Info label="Oluşturan" value={quote.createdBy?.name ?? "Sistem"} />
              </dl>
            </Card>

            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Notlar
              </p>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                {quote.notes || "Teklif notu bulunmuyor."}
              </div>
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Info({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd
        className={`text-right text-sm ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}
      >
        {value}
      </dd>
    </div>
  );
}
