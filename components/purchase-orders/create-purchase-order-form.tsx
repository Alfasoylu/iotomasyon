"use client";

/**
 * Phase 77 — Create Purchase Order Form
 *
 * Features:
 * - Supplier select + shipping method toggle (AIR/SEA)
 * - Product search with autocomplete (all active products)
 * - Per-item: qty input, auto-filled landed cost estimate
 * - Capital summary panel: total cost + cost per item
 * - "Önerilen ürünler" section when pre-filled from capital allocation
 * - Live total recalculation as qty changes
 */

import { startTransition, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { createPurchaseOrderAction } from "@/lib/actions/purchase-order-actions";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  minimumStock: number;
  sourceCostRmb: number | null;
  weightKg: number | null;
  shippingMethod: "AIR" | "SEA";
  unitCostTry: number | null;
  monthlyDemand: number;
  needsReorder: boolean;
  suggestedQty: number;
};

type OrderItem = {
  product: ProductOption;
  qty: number;
};

type Props = {
  suppliers: Array<{ id: string; name: string }>;
  products: ProductOption[];
  suggestions: ProductOption[];
  usdTryRate: number;
  rmbUsdRate: number | null;
};

function fmtTry(n: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);
}

export function CreatePurchaseOrderForm({ suppliers, products, suggestions, usdTryRate, rmbUsdRate }: Props) {
  const router = useRouter();

  const [supplierId, setSupplierId] = useState("");
  const [shippingMethod, setShippingMethod] = useState<"AIR" | "SEA" | "">("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Search results
  const searchResults = useMemo(() => {
    if (search.trim().length < 2) return [];
    const q = search.toLowerCase();
    const alreadyAdded = new Set(items.map((i) => i.product.id));
    return products
      .filter((p) => !alreadyAdded.has(p.id) && (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      ))
      .slice(0, 8);
  }, [search, products, items]);

  function addProduct(product: ProductOption, qty?: number) {
    const existing = items.find((i) => i.product.id === product.id);
    if (existing) return; // already added
    setItems((prev) => [...prev, { product, qty: qty ?? (product.suggestedQty > 0 ? product.suggestedQty : 1) }]);
    setSearch("");
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function updateQty(productId: string, qty: number) {
    setItems((prev) =>
      prev.map((i) => i.product.id === productId ? { ...i, qty: Math.max(1, qty) } : i)
    );
  }

  const totalCostTry = items.reduce((sum, item) => {
    const cost = item.product.unitCostTry ?? 0;
    return sum + cost * item.qty;
  }, 0);

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  // Suggestions not yet in items
  const pendingSuggestions = suggestions.filter(
    (s) => !items.find((i) => i.product.id === s.id)
  );

  async function handleSubmit() {
    if (items.length === 0) {
      setMessage({ ok: false, text: "En az bir ürün ekleyin." });
      return;
    }
    setPending(true);
    setMessage(null);
    startTransition(async () => {
      const result = await createPurchaseOrderAction({
        supplierId: supplierId || null,
        shippingMethod: shippingMethod as "AIR" | "SEA" | null || null,
        notes,
        items: items.map((item) => ({
          productId: item.product.id,
          qty: item.qty,
          unitCostRmb: item.product.sourceCostRmb,
          unitCostTry: item.product.unitCostTry,
        })),
      });
      setPending(false);
      if (result.ok && result.orderId) {
        router.push(`/admin/purchase-orders/${result.orderId}`);
      } else {
        setMessage({ ok: false, text: result.message ?? "Hata oluştu." });
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: form */}
      <div className="lg:col-span-2 space-y-6">

        {/* Order header */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Sipariş Bilgileri</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Tedarikçi</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="">— Tedarikçi seçin (opsiyonel)</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Kargo Modu</label>
              <div className="flex gap-2">
                {(["", "SEA", "AIR"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setShippingMethod(m)}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                      shippingMethod === m
                        ? m === "SEA"
                          ? "bg-blue-600 text-white border-blue-600"
                          : m === "AIR"
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 border-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {m === "" ? "Otomatik" : m === "SEA" ? "🚢 Deniz" : "✈ Hava"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Notlar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Tedarikçi iletişim bilgisi, ödeme koşulları..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Product search */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Ürün Ekle</h2>
          <div className="relative">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ürün adı veya SKU ara (en az 2 karakter)..."
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-start justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition first:rounded-t-lg last:rounded-b-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {p.unitCostTry != null && (
                        <p className="text-xs font-semibold text-slate-700">{fmtTry(p.unitCostTry)}/adet</p>
                      )}
                      <p className={`text-xs ${p.needsReorder ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                        Stok: {p.stockQuantity}
                        {p.needsReorder && " ⚠ Düşük"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Capital allocation suggestions */}
          {pendingSuggestions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                📊 Sermaye Önerileri — Düşük Stok
              </p>
              <div className="space-y-1">
                {pendingSuggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p, p.suggestedQty)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-left hover:bg-amber-100 transition"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        Stok: {p.stockQuantity} · Min: {p.minimumStock}
                        {p.monthlyDemand > 0 && ` · Talep: ${p.monthlyDemand}/ay`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {p.unitCostTry != null && (
                        <p className="text-xs font-semibold text-slate-700">{fmtTry(p.unitCostTry)}/adet</p>
                      )}
                      <p className="text-xs text-amber-700 font-semibold">+{p.suggestedQty} adet ekle</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Items list */}
        {items.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Ürün</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Birim Maliyet</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Adet</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Toplam</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const itemTotal = (item.product.unitCostTry ?? 0) * item.qty;
                  return (
                    <tr key={item.product.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 leading-tight">{item.product.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{item.product.sku}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.product.sourceCostRmb != null && (
                            <span className="text-xs text-slate-400">¥{item.product.sourceCostRmb.toFixed(2)}</span>
                          )}
                          <span className={`text-[10px] font-medium ${item.product.shippingMethod === "SEA" ? "text-blue-500" : "text-orange-400"}`}>
                            {item.product.shippingMethod === "SEA" ? "🚢" : "✈"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {item.product.unitCostTry != null ? fmtTry(item.product.unitCostTry) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={(e) => updateQty(item.product.id, parseInt(e.target.value) || 1)}
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                        {item.product.unitCostTry != null ? fmtTry(itemTotal) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeItem(item.product.id)}
                          className="text-slate-300 hover:text-red-500 transition text-lg leading-none"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: summary panel */}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 sticky top-4">
          <h2 className="text-sm font-semibold text-slate-700">Sipariş Özeti</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Ürün çeşidi</span>
              <span className="font-semibold">{items.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Toplam adet</span>
              <span className="font-semibold">{totalQty}</span>
            </div>
            <div className="border-t border-slate-100 pt-2 flex justify-between">
              <span className="text-slate-700 font-medium">Tahmini toplam maliyet</span>
              <span className="font-bold text-slate-900 text-base">{fmtTry(totalCostTry)}</span>
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Maliyet dağılımı</p>
              {items
                .slice()
                .sort((a, b) => (b.product.unitCostTry ?? 0) * b.qty - (a.product.unitCostTry ?? 0) * a.qty)
                .map((item) => {
                  const itemCost = (item.product.unitCostTry ?? 0) * item.qty;
                  const pct = totalCostTry > 0 ? (itemCost / totalCostTry) * 100 : 0;
                  return (
                    <div key={item.product.id}>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600 truncate max-w-[160px]">{item.product.name}</span>
                        <span className="text-slate-500 shrink-0">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-700"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>
              {message.ok ? "✓" : "⚠"} {message.text}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || items.length === 0}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition disabled:opacity-40"
          >
            {pending ? "Oluşturuluyor..." : "Siparişi Oluştur (Taslak)"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="w-full text-xs text-slate-400 hover:text-slate-700 transition"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}
