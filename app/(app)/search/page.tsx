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
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Arama</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Global arama</h1>
      </div>

      <form method="GET" action="/search">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="Müşteri, telefon, ürün, teklif, not..."
            className="h-10 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent-border)]"
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--accent)] px-5 text-sm font-medium text-[var(--accent-fg)] transition hover:brightness-110"
          >
            Ara
          </button>
        </div>
      </form>

      {q.length > 0 && q.length < 2 ? <p className="text-sm text-[var(--text-muted)]">En az 2 karakter girin.</p> : null}

      {results ? (
        <div className="space-y-6">
          {results.customers.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Müşteriler ({results.customers.length})
              </h2>
              <Card className="divide-y divide-[var(--border-subtle)]">
                {results.customers.map((c) => (
                  <Link
                    key={c.id}
                    href={`/customers/${c.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[var(--surface-3)]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{c.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
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
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Teklifler ({results.quotes.length})
              </h2>
              <Card className="divide-y divide-[var(--border-subtle)]">
                {results.quotes.map((quote) => (
                  <Link
                    key={quote.id}
                    href={`/quotes/${quote.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[var(--surface-3)]"
                  >
                    <div>
                      <p className="text-sm font-medium tabular-nums font-mono text-[var(--text-primary)]">{quote.quoteNumber}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {quote.customer.name} · <span className="tabular-nums font-mono">{formatCurrencyAmount(quote.total.toString(), "TRY")}</span>
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
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Ürünler ({results.products.length})
              </h2>
              <Card className="divide-y divide-[var(--border-subtle)]">
                {results.products.map((p) => (
                  <Link
                    key={p.id}
                    href={`/products/${p.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[var(--surface-3)]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{p.name}</p>
                      <p className="text-xs text-[var(--text-muted)]"><span className="font-mono">{p.sku}</span> · {p.category ?? "Kategori yok"}</p>
                    </div>
                    <span className="text-xs tabular-nums font-mono text-[var(--text-muted)]">Stok: {p.stockQuantity}</span>
                  </Link>
                ))}
              </Card>
            </section>
          ) : null}

          {results.categories.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Kategoriler ({results.categories.length})
              </h2>
              <Card className="divide-y divide-[var(--border-subtle)]">
                {results.categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/categories/${cat.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[var(--surface-3)]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{cat.name}</p>
                      <p className="text-xs font-mono text-[var(--text-muted)]">{cat.slug}</p>
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
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Notlar ({results.notes.length})
              </h2>
              <Card className="divide-y divide-[var(--border-subtle)]">
                {results.notes.map((n) =>
                  n.customerId ? (
                    <Link
                      key={n.id}
                      href={`/customers/${n.customerId}`}
                      className="block px-5 py-3.5 hover:bg-[var(--surface-3)]"
                    >
                      <p className="text-sm font-medium text-[var(--text-primary)]">{n.customer?.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{n.content}</p>
                    </Link>
                  ) : (
                    <div key={n.id} className="px-5 py-3.5">
                      <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">{n.content}</p>
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
            <p className="text-sm text-[var(--text-muted)]">&quot;{q}&quot; için sonuç bulunamadı.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
