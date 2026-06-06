"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useMemo } from "react";
import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  updateCatalogPriceAction,
  updateCatalogSortOrderAction,
} from "@/lib/actions/catalog-pricing-actions";

type Product = {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  brand: string | null;
  categoryName: string | null;
  stockQuantity: number;
  unitCostUsd: number | null;
  wholesalePriceUsd: number | null;
  retailPriceUsd: number | null;
  catalogSortOrder: number;
};

type ActiveFilters = {
  categoryId: string | null;
  brand: string | null;
  filter: "all" | "empty-wholesale" | "empty-retail" | "empty-both";
  q: string;
};

type Props = {
  products: Product[];
  categories: { id: string; name: string }[];
  brands: string[];
  activeFilters: ActiveFilters;
};

function fmtUsd(n: number | null): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function marginPct(cost: number | null, sell: number | null): number | null {
  if (!cost || !sell || sell <= 0) return null;
  return ((sell - cost) / sell) * 100;
}

const selectClass =
  "h-9 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)] transition";

export function ProductPricingTable({ products, categories, brands, activeFilters }: Props) {
  const router = useRouter();

  function applyFilter(updates: Partial<ActiveFilters>) {
    const next = { ...activeFilters, ...updates };
    const params = new URLSearchParams();
    if (next.categoryId) params.set("categoryId", next.categoryId);
    if (next.brand) params.set("brand", next.brand);
    if (next.filter !== "all") params.set("filter", next.filter);
    if (next.q) params.set("q", next.q);
    router.push(`/admin/product-pricing?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Bilgilendirme */}
      <div className="rounded-md border border-[var(--accent-border)] bg-[var(--accent-dim)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">Katalog sıralaması:</span> Sıra sütununa <code className="rounded bg-[var(--surface-3)] px-1 font-mono text-[var(--text-primary)]">1-999</code> arası bir sayı gir (küçük olan kataloğun başında çıkar). Boş bırakırsan otomatik (stok+ad) sıralanır.
        Fiyat bayi modu için <strong>wholesalePriceUsd</strong> (manuel) → boşsa <strong>xmlBayiPrice</strong> (XML); perakende için <strong>retailPriceUsd</strong> → boşsa <strong>xmlPrice4</strong>.
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={activeFilters.filter}
          onChange={(e) => applyFilter({ filter: e.target.value as ActiveFilters["filter"] })}
          className={selectClass}
        >
          <option value="all">Tümü</option>
          <option value="empty-both">Her İki USD Fiyatı Boş</option>
          <option value="empty-wholesale">Bayi USD Boş</option>
          <option value="empty-retail">Perakende USD Boş</option>
        </select>
        <select
          value={activeFilters.categoryId ?? ""}
          onChange={(e) => applyFilter({ categoryId: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Tüm Kategoriler</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={activeFilters.brand ?? ""}
          onChange={(e) => applyFilter({ brand: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Tüm Markalar</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <SearchInput initial={activeFilters.q} onChange={(q) => applyFilter({ q })} />
        <span className="ml-auto text-xs tabular-nums text-[var(--text-muted)]">{products.length} ürün gösteriliyor (max 300)</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            <tr>
              <th className="px-2 py-2.5 text-right" title="Katalog sıralaması — 1-999 manuel, boş/0 = otomatik">Sıra</th>
              <th className="px-3 py-2.5 text-left">Ürün</th>
              <th className="px-3 py-2.5 text-left">Kategori</th>
              <th className="px-3 py-2.5 text-right">Stok</th>
              <th className="px-3 py-2.5 text-right">Maliyet $</th>
              <th className="px-3 py-2.5 text-right">Bayi USD</th>
              <th className="px-3 py-2.5 text-right">Perakende USD</th>
              <th className="px-3 py-2.5 text-right">Marj (Per.)</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                  Filtre kriterlerine uyan ürün bulunamadı.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchInput({ initial, onChange }: { initial: string; onChange: (q: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onChange(value);
      }}
      className="flex items-center gap-1"
    >
      <Input
        type="search"
        placeholder="SKU veya ad ara…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 w-48 text-xs"
      />
      <Button type="submit" size="sm" variant="secondary">
        Ara
      </Button>
    </form>
  );
}

function ProductRow({ product }: { product: Product }) {
  const [wholesale, setWholesale] = useState<string>(
    product.wholesalePriceUsd != null ? String(product.wholesalePriceUsd) : "",
  );
  const [retail, setRetail] = useState<string>(
    product.retailPriceUsd != null ? String(product.retailPriceUsd) : "",
  );
  // Sıra No: 1000 (default) → boş gösterilir; manuel (1-999) → değer gösterilir
  const [sortOrder, setSortOrder] = useState<string>(
    product.catalogSortOrder !== 1000 ? String(product.catalogSortOrder) : "",
  );
  const [sortSavedAt, setSortSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function saveSortOrder() {
    const raw = sortOrder.trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 99999)) {
      setError("Sıra: 0-99999 arası bir sayı");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateCatalogSortOrderAction(product.id, value);
      if (res.ok) {
        setSortSavedAt(Date.now());
        setTimeout(() => setSortSavedAt(null), 1500);
      } else {
        setError(res.message ?? "Sıralama kaydedilemedi");
      }
    });
  }

  const margin = useMemo(() => {
    const r = retail ? Number(retail) : null;
    return marginPct(product.unitCostUsd, r);
  }, [retail, product.unitCostUsd]);

  function save(field: "wholesale" | "retail") {
    const raw = field === "wholesale" ? wholesale : retail;
    const value = raw.trim() === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError("Geçersiz değer");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateCatalogPriceAction(
        product.id,
        field === "wholesale" ? { wholesalePriceUsd: value } : { retailPriceUsd: value },
      );
      if (res.ok) {
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 1500);
      } else {
        setError(res.message ?? "Kaydedilemedi");
      }
    });
  }

  const justSaved = savedAt && Date.now() - savedAt < 1500;

  const sortJustSaved = sortSavedAt && Date.now() - sortSavedAt < 1500;

  return (
    <tr className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
      <td className="px-2 py-2 align-top">
        <Input
          type="number"
          min="0"
          max="999"
          step="1"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          onBlur={saveSortOrder}
          placeholder="—"
          disabled={pending}
          className="h-8 w-14 text-right text-xs tabular-nums font-mono"
          title="1-999 manuel sıralama (küçük önce). Boş = otomatik (stok+ad)."
        />
        {sortJustSaved && (
          <span className="mt-0.5 block text-center text-[9px] text-[var(--ok)]">✓</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-start gap-2">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-10 w-10 flex-shrink-0 rounded object-cover ring-1 ring-[var(--border-default)]"
              loading="lazy"
            />
          ) : (
            <div className="h-10 w-10 flex-shrink-0 rounded bg-[var(--surface-3)]" />
          )}
          <div className="min-w-0">
            <Link
              href={`/products/${product.id}`}
              className="line-clamp-2 text-xs font-medium text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline"
            >
              {product.name}
            </Link>
            <p className="font-mono text-[10px] text-[var(--text-muted)]">{product.sku}</p>
            {product.brand && (
              <span className="text-[10px] text-[var(--text-muted)]">{product.brand}</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 align-top text-xs text-[var(--text-secondary)]">{product.categoryName ?? "—"}</td>
      <td className="px-3 py-2 align-top text-right text-xs tabular-nums font-mono">
        <span className={product.stockQuantity > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>
          {product.stockQuantity}
        </span>
      </td>
      <td className="px-3 py-2 align-top text-right font-mono text-xs tabular-nums text-[var(--text-muted)]">
        {fmtUsd(product.unitCostUsd)}
      </td>
      <td className="px-3 py-2 align-top text-right">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={wholesale}
          onChange={(e) => setWholesale(e.target.value)}
          onBlur={() => save("wholesale")}
          placeholder="0.00"
          disabled={pending}
          className="h-8 w-24 text-right text-xs tabular-nums font-mono"
        />
      </td>
      <td className="px-3 py-2 align-top text-right">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={retail}
          onChange={(e) => setRetail(e.target.value)}
          onBlur={() => save("retail")}
          placeholder="0.00"
          disabled={pending}
          className="h-8 w-24 text-right text-xs tabular-nums font-mono"
        />
        {error && <p className="mt-1 text-[10px] text-[var(--danger)]">{error}</p>}
        {justSaved && (
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--ok)]">
            <Check size={10} strokeWidth={1.5} /> Kaydedildi
          </p>
        )}
      </td>
      <td className="px-3 py-2 align-top text-right text-xs">
        {margin == null ? (
          <span className="text-[var(--text-muted)]">—</span>
        ) : (
          <Badge variant={margin >= 25 ? "ok" : margin >= 10 ? "warn" : "danger"}>
            {margin.toFixed(1)}%
          </Badge>
        )}
      </td>
    </tr>
  );
}
