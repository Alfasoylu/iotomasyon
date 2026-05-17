"use client";

import { useTransition, useState } from "react";
import { createImportDecisionSnapshotAction } from "@/lib/actions/import-snapshot-actions";

interface Props {
  productId: string;
}

export function ImportSnapshotButton({ productId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message?: string } | null>(null);

  function handleClick() {
    setStatus(null);
    startTransition(async () => {
      const res = await createImportDecisionSnapshotAction(productId);
      setStatus({ ok: res.ok, message: res.ok ? "Karar kaydedildi." : res.message });
      // Clear success message after 3s
      if (res.ok) setTimeout(() => setStatus(null), 3000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition"
      >
        {isPending ? "Kaydediliyor…" : "Kararı Kaydet"}
      </button>
      {status && (
        <span className={`text-xs font-medium ${status.ok ? "text-emerald-600" : "text-red-500"}`}>
          {status.message}
        </span>
      )}
    </div>
  );
}
