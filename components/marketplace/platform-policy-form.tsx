"use client";

import { useState, useTransition } from "react";
import { upsertPlatformPolicyAction } from "@/lib/actions/marketplace-policy-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const INPUT_CLS =
  "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)]";

const NUMBER_INPUT_CLS = `${INPUT_CLS} font-mono tabular-nums`;

const LABEL_CLS =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]";

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
    <div className="space-y-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{platformLabel}</h3>
        {current ? (
          <Badge variant="ok">Yapılandırıldı</Badge>
        ) : (
          <Badge variant="warn">Varsayılan</Badge>
        )}
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL_CLS}>
            Standart Kargo (₺){" "}
            <span className="font-normal normal-case tracking-normal text-[var(--text-muted)]">
              — kademe yoksa
            </span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={shipping}
            onChange={(e) => setShipping(e.target.value)}
            className={NUMBER_INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Komisyon (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className={NUMBER_INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Ödeme Komisyonu (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            className={NUMBER_INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>İade Rezervi (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={returns}
            onChange={(e) => setReturns(e.target.value)}
            className={NUMBER_INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>KDV Oranı (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
            className={NUMBER_INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Not</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opsiyonel..."
            className={INPUT_CLS}
          />
        </div>
      </div>

      {/* Tiered shipping section */}
      <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              id={`use-tiers-${platform}`}
              type="checkbox"
              checked={useTiers}
              onChange={(e) => setUseTiers(e.target.checked)}
              className="rounded border-[var(--border-default)] accent-[var(--accent)]"
            />
            <label
              htmlFor={`use-tiers-${platform}`}
              className="cursor-pointer text-xs font-semibold text-[var(--text-primary)]"
            >
              USD Kademeli Kargo Kullan
            </label>
          </div>
          {useTiers && (
            <button
              type="button"
              onClick={loadDefaultTiers}
              className="text-xs text-[var(--info)] underline transition hover:brightness-110"
            >
              Trendyol Varsayılanlarını Yükle
            </button>
          )}
        </div>

        {useTiers && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-muted)]">
              Satış fiyatı USD cinsinden eşikle karşılaştırılır. Son satır sınırsız (catch-all) olmalıdır.
            </p>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-x-2 gap-y-1 px-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              <span>Maks. Fiyat (USD)</span>
              <span>Kargo Maliyeti (USD)</span>
              <span />
            </div>
            {tierRows.map((row, idx) => {
              const isLast = idx === tierRows.length - 1;
              return (
                <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-center gap-x-2">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={isLast}
                      placeholder={isLast ? "∞ (catch-all)" : "örn. 5.00"}
                      value={row.maxPriceUsd !== undefined ? String(row.maxPriceUsd) : ""}
                      onChange={(e) => updateTier(idx, "maxPriceUsd", e.target.value)}
                      className={`${NUMBER_INPUT_CLS} disabled:bg-[var(--surface-1)] disabled:text-[var(--text-muted)]`}
                    />
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="örn. 1.20"
                    value={String(row.costUsd)}
                    onChange={(e) => updateTier(idx, "costUsd", e.target.value)}
                    className={NUMBER_INPUT_CLS}
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(idx)}
                    disabled={tierRows.length === 1}
                    className="px-1 text-base text-[var(--text-muted)] transition hover:text-[var(--danger)] disabled:opacity-30"
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
              className="mt-1 text-xs text-[var(--text-secondary)] underline transition hover:text-[var(--text-primary)]"
            >
              + Kademe ekle
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          Kargo ve komisyon değerleri ürün düzeyinde geçersiz kılınabilir.
        </p>
        <div className="flex items-center gap-3">
          {msg && (
            <span
              className={`text-xs font-medium ${msg.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}
            >
              {msg.text}
            </span>
          )}
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
