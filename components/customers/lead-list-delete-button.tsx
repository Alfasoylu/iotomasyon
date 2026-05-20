"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteLeadListAction } from "@/lib/actions/lead-list-actions";

export function LeadListDeleteButton({
  leadListId,
  listName,
}: {
  leadListId: string;
  listName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteCustomers, setDeleteCustomers] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteLeadListAction(leadListId, { deleteCustomers });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.message ?? "Silinemedi.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
        title="Listeyi sil"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Listeyi sil</h3>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-medium">{listName}</span> listesini silmek istediğinden emin misin?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <input
                type="checkbox"
                checked={deleteCustomers}
                onChange={(e) => setDeleteCustomers(e.target.checked)}
                className="mt-0.5"
              />
              <span className="flex-1">
                <span className="font-medium text-slate-900">Müşterileri de sil</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Yalnızca <span className="font-medium">NEW</span> statüsünde, ürün ilgisi veya satışı olmayan müşteriler silinir
                  (güvenli silme).
                </span>
              </span>
            </label>

            {error && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Vazgeç
              </Button>
              <Button
                onClick={onDelete}
                disabled={pending}
                className="bg-rose-600 hover:bg-rose-700"
              >
                {pending ? "Siliniyor…" : "Evet, sil"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
