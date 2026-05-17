"use client";

import { useState, useTransition } from "react";
import { upsertPlatformPolicyAction } from "@/lib/actions/marketplace-policy-actions";
import { Button } from "@/components/ui/button";
import type { MarketplacePlatform } from "@prisma/client";

interface PlatformPolicyFormProps {
  platform: MarketplacePlatform;
  platformLabel: string;
  current: {
    standardShippingTry: number;
    standardCommissionPct: number;
    paymentFeePct: number;
    returnReservePct: number;
    vatPct: number;
    notes: string | null;
  } | null;
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

  function handleSave() {
    setMsg(null);
    startTransition(async () => {
      const result = await upsertPlatformPolicyAction({
        platform,
        standardShippingTry: parseFloat(shipping) || 0,
        standardCommissionPct: parseFloat(commission) || 0,
        paymentFeePct: parseFloat(payment) || 0,
        returnReservePct: parseFloat(returns) || 0,
        vatPct: parseFloat(vat) || 20,
        notes: notes || "",
      });
      setMsg({ ok: result.ok, text: result.ok ? "Kaydedildi ✓" : (result.message ?? "Hata") });
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{platformLabel}</h3>
        {current && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Yapılandırıldı
          </span>
        )}
        {!current && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Varsayılan
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Standart Kargo (₺)
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
