import { notFound } from "next/navigation";

import { QuoteForm } from "@/components/quotes/quote-form";
import { listProducts } from "@/services/product-service";
import { getQuoteById } from "@/services/quote-service";

export const dynamic = "force-dynamic";

export default async function QuoteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [quote, productsResult] = await Promise.all([
    getQuoteById(id),
    listProducts({}),
  ]);

  if (!quote) notFound();

  const products = productsResult.products;

  const initialValues = {
    currencyMode: (quote.currencyMode ?? "TRY") as "TRY" | "USD" | "BOTH",
    exchangeRate: quote.exchangeRate ? String(quote.exchangeRate) : "",
    notes: quote.notes ?? "",
    validityDate: quote.validityDate
      ? quote.validityDate.toISOString().split("T")[0]
      : "",
    paymentTerms: quote.paymentTerms ?? "",
    deliveryTerms: quote.deliveryTerms ?? "",
    warrantyTerms: quote.warrantyTerms ?? "",
    items: quote.items.map((item) => ({
      productId: item.productId ?? "",
      description: item.description,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      currency: item.currency,
      discount: String(item.discount),
      tax: String(item.tax),
    })),
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-slate-950">
        <div className="h-1 bg-orange-500" />
        <div className="px-6 py-8 xl:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Teklif Düzenle
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {quote.quoteNumber}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {quote.customer.name}
            {quote.customer.company ? ` · ${quote.customer.company}` : ""}
          </p>
        </div>
      </div>

      <QuoteForm
        customerId={quote.customerId}
        customerName={quote.customer.name}
        customerCompany={quote.customer.company}
        products={products.map((p) => ({ id: p.id, name: p.name, sku: p.sku }))}
        quoteId={quote.id}
        initialValues={initialValues}
      />
    </div>
  );
}
