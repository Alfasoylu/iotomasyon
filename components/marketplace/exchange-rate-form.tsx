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

const INPUT_CLS =
  "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)]";

const LABEL_CLS =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]";

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
          <label className={LABEL_CLS}>Yıl</label>
          <input
            type="number"
            className={`${INPUT_CLS} font-mono tabular-nums`}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2020}
            max={2100}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Ay</label>
          <select
            className={INPUT_CLS}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>USD/TRY Kuru</label>
          <input
            type="text"
            inputMode="decimal"
            className={`${INPUT_CLS} font-mono tabular-nums`}
            placeholder="ör. 38.50"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>
            RMB/USD Kuru{" "}
            <span className="font-normal text-[var(--text-muted)] normal-case tracking-normal">
              (isteğe bağlı)
            </span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            className={`${INPUT_CLS} font-mono tabular-nums`}
            placeholder="ör. 7.25"
            value={rmbRate}
            onChange={(e) => setRmbRate(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Not (isteğe bağlı)</label>
          <input
            type="text"
            className={INPUT_CLS}
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
          <span className={`text-xs font-medium ${result.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
            {result.ok ? "Kaydedildi." : result.message}
          </span>
        )}
      </div>
    </div>
  );
}
