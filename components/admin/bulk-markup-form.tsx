"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { bulkApplyMarkupAction } from "@/lib/actions/catalog-pricing-actions";

type Props = {
  categories: { id: string; name: string; productCount: number }[];
  brands: string[];
};

export function BulkMarkupForm({ categories, brands }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [sourceField, setSourceField] = useState<"unitCostUsd" | "wholesalePriceUsd">("unitCostUsd");
  const [targetField, setTargetField] = useState<"wholesalePriceUsd" | "retailPriceUsd">("wholesalePriceUsd");
  const [multiplier, setMultiplier] = useState<string>("1.25");
  const [overwrite, setOverwrite] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (!open) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Toplu Marj Uygulama</h3>
            <p className="text-xs text-slate-500">
              Kategori bazında bir alanı çarpan ile başka bir alana doldur (örn. maliyet × 1.25 = bayi).
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Aç
          </Button>
        </div>
      </Card>
    );
  }

  function submit() {
    const m = Number(multiplier);
    if (!Number.isFinite(m) || m <= 0) {
      setResult("Geçersiz çarpan");
      return;
    }
    if (sourceField === targetField) {
      setResult("Kaynak ve hedef aynı olamaz.");
      return;
    }
    setResult(null);
    startTransition(async () => {
      const res = await bulkApplyMarkupAction({
        categoryId: categoryId || null,
        brand: brand || null,
        sourceField,
        targetField,
        multiplier: m,
        overwriteExisting: overwrite,
        onlyActive: true,
      });
      if (res.ok) {
        setResult(`✓ ${res.updatedCount ?? 0} ürün güncellendi.`);
        router.refresh();
      } else {
        setResult(res.message ?? "Hata");
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Toplu Marj Uygulama</h3>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Kapat
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            Kategori (opsiyonel)
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
          >
            <option value="">Tüm kategoriler</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.productCount})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            Marka (opsiyonel)
          </label>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
          >
            <option value="">Tüm markalar</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            Çarpan
          </label>
          <Input
            type="number"
            step="0.01"
            min="0.5"
            max="10"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            className="h-9 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            Kaynak
          </label>
          <select
            value={sourceField}
            onChange={(e) =>
              setSourceField(e.target.value as "unitCostUsd" | "wholesalePriceUsd")
            }
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
          >
            <option value="unitCostUsd">Maliyet USD</option>
            <option value="wholesalePriceUsd">Bayi USD</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            Hedef
          </label>
          <select
            value={targetField}
            onChange={(e) =>
              setTargetField(e.target.value as "wholesalePriceUsd" | "retailPriceUsd")
            }
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
          >
            <option value="wholesalePriceUsd">Bayi USD</option>
            <option value="retailPriceUsd">Perakende USD</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            Mevcut değerleri üzerine yaz
          </label>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={submit} disabled={pending} size="md">
          {pending ? "Uygulanıyor…" : "Uygula"}
        </Button>
        {result && (
          <span
            className={`text-xs ${
              result.startsWith("✓") ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {result}
          </span>
        )}
      </div>
      <p className="mt-3 text-[10px] text-slate-400">
        Hedef alanı boş olan ürünlere uygulanır (mevcut değerler korunur). Sadece aktif ürünler.
      </p>
    </Card>
  );
}
