import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCustomerStatus, getCustomerStatusTone } from "@/lib/customer-utils";
import { formatCurrencyAmount, formatQuoteStatus, getQuoteStatusTone } from "@/lib/quote-utils";
import { globalSearch } from "@/services/search-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.SEARCH_READ);
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const results = q.length >= 2 ? await globalSearch(q) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Arama</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Global arama</h1>
      </div>

      <form method="GET" action="/search">
        <div className="flex gap-3">
          <input
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="Müşteri, telefon, ürün, teklif, not..."
            className="h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          />
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Ara
          </button>
        </div>
      </form>

      {q.length > 0 && q.length < 2 ? <p className="text-sm text-slate-500">En az 2 karakter girin.</p> : null}

      {results ? (
        <div className="space-y-6">
          {results.customers.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                Müşteriler ({results.customers.length})
              </h2>
              <Card className="divide-y divide-slate-100">
                {results.customers.map((c) => (
                  <Link
                    key={c.id}
                    href={`/customers/${c.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="text-sm text-slate-500">
                        {[c.company, c.phone, c.email].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge tone={getCustomerStatusTone(c.status)}>
                      {formatCustomerStatus(c.status)}
                    </Badge>
                  </Link>
                ))}
              </Card>
            </section>
          ) : null}

          {results.quotes.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                Teklifler ({results.quotes.length})
              </h2>
              <Card className="divide-y divide-slate-100">
                {results.quotes.map((quote) => (
                  <Link
                    key={quote.id}
                    href={`/quotes/${quote.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{quote.quoteNumber}</p>
                      <p className="text-sm text-slate-500">
                        {quote.customer.name} · {formatCurrencyAmount(quote.total.toString(), "TRY")}
                      </p>
                    </div>
                    <Badge tone={getQuoteStatusTone(quote.status)}>
                      {formatQuoteStatus(quote.status)}
                    </Badge>
                  </Link>
                ))}
              </Card>
            </section>
          ) : null}

          {results.products.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                Ürünler ({results.products.length})
              </h2>
              <Card className="divide-y divide-slate-100">
                {results.products.map((p) => (
                  <Link
                    key={p.id}
                    href={`/products/${p.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="text-sm text-slate-500">{p.sku} · {p.category ?? "Kategori yok"}</p>
                    </div>
                    <span className="text-sm text-slate-400">Stok: {p.stockQuantity}</span>
                  </Link>
                ))}
              </Card>
            </section>
          ) : null}

          {results.categories.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                Kategoriler ({results.categories.length})
              </h2>
              <Card className="divide-y divide-slate-100">
                {results.categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/categories/${cat.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{cat.name}</p>
                      <p className="text-sm text-slate-500">{cat.slug}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge>{cat._count.products} ürün</Badge>
                      <Badge tone="default">{cat._count.interests} ilgi</Badge>
                    </div>
                  </Link>
                ))}
              </Card>
            </section>
          ) : null}

          {results.notes.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                Notlar ({results.notes.length})
              </h2>
              <Card className="divide-y divide-slate-100">
                {results.notes.map((n) =>
                  n.customerId ? (
                    <Link
                      key={n.id}
                      href={`/customers/${n.customerId}`}
                      className="block px-5 py-4 hover:bg-slate-50"
                    >
                      <p className="text-sm font-semibold text-slate-900">{n.customer?.name}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.content}</p>
                    </Link>
                  ) : (
                    <div key={n.id} className="px-5 py-4">
                      <p className="line-clamp-2 text-sm text-slate-600">{n.content}</p>
                    </div>
                  ),
                )}
              </Card>
            </section>
          ) : null}

          {results.customers.length === 0 &&
          results.quotes.length === 0 &&
          results.products.length === 0 &&
          results.notes.length === 0 &&
          results.categories.length === 0 ? (
            <p className="text-sm text-slate-500">&quot;{q}&quot; için sonuç bulunamadı.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
