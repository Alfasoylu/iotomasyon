"use client";

/**
 * Phase 88 — UpdateInterestForm client component
 *
 * Renders status + priority selects per interest row in the expanded product table.
 * On change, immediately calls updateInterestAction and refreshes via router.refresh().
 */

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { updateInterestAction } from "@/lib/actions/update-interest-action";

const STATUS_OPTIONS = [
  { value: "NEW",           label: "Yeni" },
  { value: "WAITING_STOCK", label: "Stok Bekliyor" },
  { value: "CONTACTED",     label: "İletişim Kuruldu" },
  { value: "QUOTED",        label: "Teklif Verildi" },
  { value: "WON",           label: "Kazanıldı" },
  { value: "LOST",          label: "Kaybedildi" },
  { value: "CANCELLED",     label: "İptal" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW",    label: "Düşük" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH",   label: "Yüksek" },
  { value: "URGENT", label: "Acil" },
];

type Props = {
  interestId: string;
  currentStatus: string;
  currentPriority: string;
};

export function UpdateInterestForm({
  interestId,
  currentStatus,
  currentPriority,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(field: "status" | "priority", value: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateInterestAction(interestId, { [field]: value });
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        defaultValue={currentStatus}
        onChange={(e) => handleChange("status", e.target.value)}
        disabled={isPending}
        className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none focus:border-slate-400 disabled:opacity-50"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        defaultValue={currentPriority}
        onChange={(e) => handleChange("priority", e.target.value)}
        disabled={isPending}
        className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none focus:border-slate-400 disabled:opacity-50"
      >
        {PRIORITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {isPending && (
        <span className="text-[10px] text-slate-400">…</span>
      )}
      {error && (
        <span className="text-[10px] text-red-500">{error}</span>
      )}
    </div>
  );
}
