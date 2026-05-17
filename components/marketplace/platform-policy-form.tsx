"use client";

import { useState, useTransition } from "react";
import { upsertPlatformPolicyAction } from "@/lib/actions/marketplace-policy-actions";
import { Button } from "@/components/ui/button";
import type { MarketplacePlatform } from "@prisma/client";
import {
  parseShippingTiers,
  type ShippingTier,
} from "@/lib/marketplace-policy";

interface PlatformPolicyFormProps {
  platform: MarketplacePlatform;
  platformLabel: string;
  current: {
    standardShippingTry: number;
    standardCommissionPct: number;
    paymentFeePct: number;
    returnReservePct: number;
    vatPct: number;
    shippingTiersJson: string | null;
    notes: string | null;
  } | null;
}

function tiersToRows(json: string | null | undefined): ShippingTier[] {
  const tiers = parseShippingTiers(json);
  // Ensure at least one catch-all row
  if (tiers.length === 0) return [{ costUsd: 0 }];
  return tiers;
}

function rowsToJson(rows: ShippingTier[]): string {
  return JSON.stringify(rows.map((r) => ({
    ...(r.maxPriceUsd !== undefined ? { maxPriceUsd: r.maxPriceUsd } : {}),
    costUsd: r.costUsd,
  })));
}

export function PlatformPolicyForm({
  platform,
  platformLabel,
  current,
}: PlatformPolicyFormProps) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [shipping, setShipping] = useState(
    String(current?.standardShippingTry ?? "0"),
  );
  const [commission, setCommission] = useState(
    String(current?.standardCommissionPct ?? "20"),
  );
  const [payment, setPayment] = useState(
    String(current?.paymentFeePct ?? "0"),
  );
  const [returns, setReturns] = useState(
    String(current?.returnReservePct ?? "0"),
  );
  const [vat, setVat] = useState(
    String(current?.vatPct ?? "20"),
  );
  const [notes, setNotes] = useState(current?.notes ?? "");

  // Tiered shipping rows state
  const [tierRows, setTierRows] = useState<ShippingTier[]>(
    tiersToRows(current?.shippingTiersJson),
  );
  const [useTiers, setUseTiers] = useState(
    !!(current?.shippingTiersJson && parseShippingTiers(current.shippingTiersJson).length > 0),
  );

  function addTier() {
    setTierRows((prev) => {
      // Insert before last catch-all row
      const rows = [...prev];
      const last = rows.pop()!;
      return [...rows, { maxPriceUsd: 0, costUsd: 0 }, last];
    });
  }

  function removeTier(idx: number) {
    setTierRows((prev) => {
      const rows = [...prev];
      rows.splice(idx, 1);
      // Always keep a catch-all
      if (rows.length === 0) rows.push({ costUsd: 0 });
      return rows;
    });
  }

  function updateTier(idx: number, field: keyof ShippingTier, raw: string) {
    const val = parseFloat(raw);
    setTierRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        if (field === "maxPriceUsd") {
          return isNaN(val) ? { ...r, maxPriceUsd: undefined } : { ...r, maxPriceUsd: val };
        }
        return { ...r, costUsd: isNaN(val) ? 0 : val };
      }),
    );
  }

  function handleSave() {
    setMsg(null);
    const tiersJson = useTiers && tierRows.length > 0 ? rowsToJson(tierRows) : null;

    startTransition(async () => {
      const result = await upsertPlatformPolicyAction({
        platform,
        standardShippingTry:   parseFloat(shipping) || 0,
        standardCommissionPct: parseFloat(commission) || 0,
        paymentFeePct:         parseFloat(payment) || 0,
        returnReservePct:      parseFloat(returns) || 0,
        vatPct:                parseFloat(vat) || 20,
        shippingTiersJson:     tiersJson ?? "",
        notes:                 notes || "",
      });
      setMsg({ ok: result.ok, text: result.ok ? "Kaydedildi ✓" : (result.message ?? "Hata") });
    });
  }

  // Load default Trendyol tiers
  function loadDefaultTiers() {
    setTierRows([
      { maxPriceUsd: 5.0,  costUsd: 1.2 },
      { maxPriceUsd: 7.5,  costUsd: 2.0 },
      { costUsd: 3.3 },
    ]);
    setUseTiers(true);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{platformLabel}</h3>
        {current ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Yapılandırıldı
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Varsayılan
          </span>
        )}
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Standart Kargo (₺) <span className="text-slate-400 font-normal">— kademe yoksa</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={shipping}
            onChange={(e) => setShipping(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Komisyon (%)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Ödeme Komisyonu (%)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            İade Rezervi (%)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={returns}
            onChange={(e) => setReturns(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            KDV Oranı (%)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Not
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opsiyonel..."
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
      </div>

      {/* Tiered shipping section */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              id={`use-tiers-${platform}`}
              type="checkbox"
              checked={useTiers}
              onChange={(e) => setUseTiers(e.target.checked)}
              className="rounded border-slate-300"
            />
            <label
              htmlFor={`use-tiers-${platform}`}
              className="text-xs font-semibold text-slate-700 cursor-pointer"
            >
              USD Kademeli Kargo Kullan
            </label>
          </div>
          {useTiers && (
            <button
              type="button"
              onClick={loadDefaultTiers}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Trendyol Varsayılanlarını Yükle
            </button>
          )}
        </div>

        {useTiers && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              Satış fiyatı USD cinsinden eşikle karşılaştırılır. Son satır sınırsız (catch-all) olmalıdır.
            </p>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-x-2 gap-y-1 text-xs font-semibold text-slate-500 px-1">
              <span>Maks. Fiyat (USD)</span>
              <span>Kargo Maliyeti (USD)</span>
              <span />
            </div>
            {tierRows.map((row, idx) => {
              const isLast = idx === tierRows.length - 1;
              return (
                <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-x-2 items-center">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={isLast}
                      placeholder={isLast ? "∞ (catch-all)" : "örn. 5.00"}
                      value={row.maxPriceUsd !== undefined ? String(row.maxPriceUsd) : ""}
                      onChange={(e) => updateTier(idx, "maxPriceUsd", e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="örn. 1.20"
                    value={String(row.costUsd)}
                    onChange={(e) => updateTier(idx, "costUsd", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(idx)}
                    disabled={tierRows.length === 1}
                    className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-base px-1"
                    title="Satırı sil"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addTier}
              className="text-xs text-slate-500 hover:text-slate-800 underline mt-1"
            >
              + Kademe ekle
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Kargo ve komisyon değerleri ürün düzeyinde geçersiz kılınabilir.
        </p>
        <div className="flex items-center gap-3">
          {msg && (
            <span
              className={`text-xs font-medium ${msg.ok ? "text-emerald-600" : "text-red-600"}`}
            >
              {msg.text}
            </span>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
