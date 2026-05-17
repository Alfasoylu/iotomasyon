"use client";

import { useState, useTransition } from "react";
import { upsertExchangeRateAction } from "@/lib/actions/exchange-rate-actions";
import { Button } from "@/components/ui/button";

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

interface Props {
  defaultYear?: number;
  defaultMonth?: number;
}

export function ExchangeRateForm({ defaultYear, defaultMonth }: Props) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(defaultYear ?? currentYear);
  const [month, setMonth] = useState(defaultMonth ?? currentMonth);
  const [rate, setRate] = useState("");
  const [rmbRate, setRmbRate] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const rateNum = parseFloat(rate.replace(",", "."));
    if (!rateNum || rateNum <= 0) {
      setResult({ ok: false, message: "Geçerli bir USD/TRY kur değeri girin." });
      return;
    }
    const rmbRateNum = rmbRate.trim() ? parseFloat(rmbRate.replace(",", ".")) : null;
    if (rmbRate.trim() && (!rmbRateNum || rmbRateNum <= 0)) {
      setResult({ ok: false, message: "Geçerli bir RMB/USD kur değeri girin." });
      return;
    }
    startTransition(async () => {
      const res = await upsertExchangeRateAction({
        year,
        month,
        usdTryRate: rateNum,
        rmbUsdRate: rmbRateNum,
        note: note || "",
      });
      setResult(res);
      if (res.ok) {
        setRate("");
        setRmbRate("");
        setNote("");
        // Reload to show updated list
        window.location.reload();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Yıl</label>
          <input
            type="number"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2020}
            max={2100}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Ay</label>
          <select
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">USD/TRY Kuru</label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="ör. 38.50"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">RMB/USD Kuru <span className="text-slate-400">(isteğe bağlı)</span></label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="ör. 7.25"
            value={rmbRate}
            onChange={(e) => setRmbRate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Not (isteğe bağlı)</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="TCMB ortalaması, vs."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Kaydediliyor..." : "Kaydet / Güncelle"}
        </Button>
        {result && (
          <span className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
            {result.ok ? "Kaydedildi." : result.message}
          </span>
        )}
      </div>
    </div>
  );
}
