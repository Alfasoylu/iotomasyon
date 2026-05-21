import Link from "next/link";
import { Sparkles, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { SuggestedProduct } from "@/services/customer-product-suggestions-service";

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

export function CustomerProductSuggestionsWidget({
  customerId,
  products,
}: {
  customerId: string;
  products: SuggestedProduct[];
}) {
  if (products.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} strokeWidth={1.5} className="text-[var(--accent)]" />
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İlgi Alanı Önerileri</h3>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
          Kategori geçmişine göre
        </span>
      </div>

      <div className="space-y-1.5">
        {products.map((p) => {
          const stockNode =
            p.stockQuantity === null
              ? null
              : p.stockQuantity > 0
                ? <Badge variant="ok">{p.stockQuantity}</Badge>
                : <Badge variant="danger">Stok yok</Badge>;
          return (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="block rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]"
            >
              <div className="flex items-center gap-3">
                <Package size={14} strokeWidth={1.5} className="flex-shrink-0 text-[var(--text-muted)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{p.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                    {p.brand ? `${p.brand} · ` : ""}
                    {p.categoryName ?? ""} {p.sku ? <span className="font-mono">· {p.sku}</span> : null}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 text-right">
                  {stockNode}
                  {p.priceTry !== null && (
                    <span className="text-sm font-semibold tabular-nums font-mono text-[var(--text-primary)]">
                      {fmtTry(p.priceTry)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-[var(--text-muted)]">
        Bu ürünleri &quot;Teklifler&quot; sekmesinde teklife ekleyebilirsin.
      </p>
    </Card>
  );
}
