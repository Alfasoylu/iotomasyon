import Link from "next/link";
import { Sparkles, Package } from "lucide-react";
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
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900">İlgi Alanı Önerileri</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          Kategori geçmişine göre
        </span>
      </div>

      <div className="space-y-1.5">
        {products.map((p) => {
          const stockBadge =
            p.stockQuantity === null
              ? null
              : p.stockQuantity > 0
                ? {
                    text: `${p.stockQuantity}`,
                    className: "bg-emerald-50 text-emerald-700",
                  }
                : { text: "Stok yok", className: "bg-rose-50 text-rose-700" };
          return (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="block rounded-lg border border-slate-100 px-3 py-2 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <Package className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {p.brand ? `${p.brand} · ` : ""}
                    {p.categoryName ?? ""} {p.sku ? `· ${p.sku}` : ""}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 text-right">
                  {stockBadge && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${stockBadge.className}`}>
                      {stockBadge.text}
                    </span>
                  )}
                  {p.priceTry !== null && (
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {fmtTry(p.priceTry)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Bu ürünleri "Teklifler" sekmesinde teklife ekleyebilirsin.
      </p>
    </Card>
  );
}
