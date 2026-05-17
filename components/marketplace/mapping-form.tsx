"use client";

import { useState, useTransition } from "react";
import {
  createMarketplaceMappingAction,
  deleteMarketplaceMappingAction,
  type MappingFormValues,
} from "@/lib/actions/marketplace-mapping-actions";
import { Button } from "@/components/ui/button";
import { MarketplacePlatform } from "@prisma/client";

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL: "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11: "N11",
  PTTAVM: "PttAVM",
  KOCTAS: "Koçtaş",
  TEKNOSA: "Teknosa",
  TEMU: "Temu",
  CUSTOM: "Diğer",
};

interface Product {
  id: string;
  name: string;
  sku: string | null;
}

interface Props {
  products: Product[];
  defaultBarcode?: string;
  defaultPlatformTitle?: string;
}

export function MappingForm({ products, defaultBarcode = "", defaultPlatformTitle = "" }: Props) {
  const [platform, setPlatform] = useState<MarketplacePlatform>(MarketplacePlatform.TRENDYOL);
  const [productId, setProductId] = useState("");
  const [platformBarcode, setPlatformBarcode] = useState(defaultBarcode);
  const [platformSku, setPlatformSku] = useState("");
  const [platformListingId, setPlatformListingId] = useState("");
  const [platformTitle, setPlatformTitle] = useState(defaultPlatformTitle);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!productId) { setResult({ ok: false, message: "Ürün seçilmeli." }); return; }
    if (!platformBarcode && !platformSku && !platformListingId) {
      setResult({ ok: false, message: "Barkod, SKU veya listeleme ID'den en az biri gerekli." });
      return;
    }
    const values: MappingFormValues = {
      platform,
      productId,
      platformBarcode: platformBarcode || undefined,
      platformSku: platformSku || undefined,
      platformListingId: platformListingId || undefined,
      platformTitle: platformTitle || undefined,
    };
    startTransition(async () => {
      const res = await createMarketplaceMappingAction(values);
      setResult(res);
      if (res.ok) {
        setProductId(""); setPlatformBarcode(""); setPlatformSku("");
        setPlatformListingId(""); setPlatformTitle("");
        window.location.reload();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Platform</label>
          <select
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as MarketplacePlatform)}
          >
            {Object.values(MarketplacePlatform).map((p) => (
              <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">İç Ürün</label>
          <select
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">— Seçiniz —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.sku ? ` (${p.sku})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Platform Barkod</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="ör. 8681234567890"
            value={platformBarcode}
            onChange={(e) => setPlatformBarcode(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Platform SKU</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="ör. TRN-00123"
            value={platformSku}
            onChange={(e) => setPlatformSku(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Listeleme ID</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Platform listeleme ID'si"
            value={platformListingId}
            onChange={(e) => setPlatformListingId(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Platform Başlığı (isteğe bağlı)</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Platformdaki ürün adı"
            value={platformTitle}
            onChange={(e) => setPlatformTitle(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Kaydediliyor..." : "Eşleştirme Ekle"}
        </Button>
        {result && (
          <span className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
            {result.ok ? (result.message ?? "Kaydedildi.") : result.message}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Delete button ─────────────────────────────────────────────────────────────

export function DeleteMappingButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  if (!confirmed) {
    return (
      <button
        className="text-xs text-red-500 hover:text-red-700 underline"
        onClick={() => setConfirmed(true)}
      >
        Sil
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs">
      <button
        className="text-red-600 font-semibold hover:text-red-800 underline"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await deleteMarketplaceMappingAction(id);
            window.location.reload();
          });
        }}
      >
        {isPending ? "..." : "Onayla"}
      </button>
      <span className="text-slate-400">|</span>
      <button className="text-slate-500 hover:text-slate-700" onClick={() => setConfirmed(false)}>
        İptal
      </button>
    </span>
  );
}
