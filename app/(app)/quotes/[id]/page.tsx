import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteStatusButtons } from "@/components/quotes/quote-status-buttons";
import { QuoteWhatsAppButton } from "@/components/quotes/quote-whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import {
  formatCurrencyAmount,
  formatQuoteCurrencyMode,
  formatQuoteStatus,
  getQuoteStatusTone,
  resolveDisplayAmounts,
} from "@/lib/quote-utils";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge tone={getQuoteStatusTone(quote.status)}>
            {formatQuoteStatus(quote.status)}
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {quote.quoteNumber}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {quote.customer.name} {quote.customer.company ? `• ${quote.customer.company}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <QuoteStatusButtons quoteId={quote.id} currentStatus={quote.status} />
          <a href={`/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">
            <span className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-slate-50">
              PDF İndir
            </span>
          </a>
          <QuoteWhatsAppButton
            quoteId={quote.id}
            phone={quote.customer.whatsapp ?? quote.customer.phone}
            customerName={quote.customer.name}
          />
          <Link href={`/customers/${quote.customerId}`}>
            <Button variant="ghost">Müşteriye dön</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Teklif kalemleri</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.25em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Kalem</th>
                  <th className="px-4 py-3">Miktar</th>
                  <th className="px-4 py-3">Birim fiyat</th>
                  <th className="px-4 py-3">İndirim</th>
                  <th className="px-4 py-3">Vergi</th>
                  <th className="px-4 py-3">Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {quote.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{item.description}</p>
                      <p className="text-slate-500">
                        {item.product ? `${item.product.name} (${item.product.sku})` : "Manuel kalem"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{item.quantity}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {(() => {
                        const r = resolveDisplayAmounts(Number(item.unitPrice), item.currency, currencyMode, exchangeRate);
                        return r.secondary ? `${r.primary} / ${r.secondary}` : r.primary;
                      })()}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatCurrencyAmount(item.discount.toString(), item.currency)}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatCurrencyAmount(item.tax.toString(), item.currency)}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-900">
                      {(() => {
                        const r = resolveDisplayAmounts(Number(item.total), item.currency, currencyMode, exchangeRate);
                        return r.secondary ? `${r.primary} / ${r.secondary}` : r.primary;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Teklif özeti</h2>
          <dl className="mt-5 space-y-4">
            <Info label="Para birimi" value={formatQuoteCurrencyMode(currencyMode)} />
            <Info label="Ara toplam" value={(() => { const r = resolveDisplayAmounts(Number(quote.subtotal), quoteCurrency, currencyMode, exchangeRate); return r.secondary ? `${r.primary} / ${r.secondary}` : r.primary; })()} />
            <Info label="İndirim" value={(() => { const r = resolveDisplayAmounts(Number(quote.discountTotal), quoteCurrency, currencyMode, exchangeRate); return r.secondary ? `${r.primary} / ${r.secondary}` : r.primary; })()} />
            <Info label="Vergi" value={(() => { const r = resolveDisplayAmounts(Number(quote.taxTotal), quoteCurrency, currencyMode, exchangeRate); return r.secondary ? `${r.primary} / ${r.secondary}` : r.primary; })()} />
            <Info label="Toplam" value={(() => { const r = resolveDisplayAmounts(Number(quote.total), quoteCurrency, currencyMode, exchangeRate); return r.secondary ? `${r.primary} / ${r.secondary}` : r.primary; })()} />
            <Info label="Oluşturulma" value={formatDateTime(quote.createdAt)} />
            {quote.sentAt ? <Info label="Gönderilme" value={formatDateTime(quote.sentAt)} /> : null}
            {quote.validityDate ? <Info label="Geçerlilik" value={formatDateTime(quote.validityDate)} /> : null}
            <Info label="Oluşturan" value={quote.createdBy?.name ?? "Sistem"} />
          </dl>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
            {quote.notes || "Teklif notu bulunmuyor."}
          </div>
        </Card>
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
