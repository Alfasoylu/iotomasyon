"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCapitalConfigAction } from "@/lib/actions/capital-actions";

type InitialValues = {
  totalCapitalTry: string;
  reservePct: string;
  desiredTurnoverMonths: string;
};

export function CapitalConfigForm({ initialValues }: { initialValues: InitialValues }) {
  const router = useRouter();
  const [total, setTotal] = useState(initialValues.totalCapitalTry);
  const [reserve, setReserve] = useState(initialValues.reservePct);
  const [turnover, setTurnover] = useState(initialValues.desiredTurnoverMonths);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(undefined);
    setSuccess(false);
    setPending(true);
    startTransition(async () => {
      const result = await saveCapitalConfigAction(total, reserve, turnover);
      setPending(false);
      if (result.ok) {
        setSuccess(true);
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  const inputCls = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Toplam sermaye (₺) *
          </label>
          <Input
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="1000000"
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Rezerv oranı (%)
          </label>
          <Input
            value={reserve}
            onChange={(e) => setReserve(e.target.value)}
            placeholder="20"
            className={inputCls}
          />
          <p className="text-xs text-slate-400">Önerilen: %20 — bu tutar hiç kullanılmaz.</p>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Hedef devir süresi (ay)
          </label>
          <Input
            value={turnover}
            onChange={(e) => setTurnover(e.target.value)}
            placeholder="3"
            className={inputCls}
          />
          <p className="text-xs text-slate-400">Kaç aylık stok hedefleniyor?</p>
        </div>
      </div>
      {message ? (
        <p className="text-sm text-red-600">⚠ {message}</p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-600">✓ Ayarlar kaydedildi. Tablo güncelleniyor…</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Hesapla ve kaydet"}
      </Button>
    </form>
  );
}
