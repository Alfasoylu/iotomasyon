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
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--danger-dim)] hover:text-[var(--danger)]"
        title="Listeyi sil"
      >
        <Trash2 size={14} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Listeyi sil
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">{listName}</span> listesini silmek istediğinden emin misin?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                aria-label="Kapat"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] p-3 text-sm">
              <input
                type="checkbox"
                checked={deleteCustomers}
                onChange={(e) => setDeleteCustomers(e.target.checked)}
                className="mt-0.5"
              />
              <span className="flex-1">
                <span className="font-medium text-[var(--text-primary)]">Müşterileri de sil</span>
                <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                  Yalnızca <span className="font-medium">NEW</span> statüsünde, ürün ilgisi veya satışı olmayan müşteriler silinir
                  (güvenli silme).
                </span>
              </span>
            </label>

            {error && (
              <div className="mt-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Vazgeç
              </Button>
              <Button variant="danger" onClick={onDelete} disabled={pending}>
                {pending ? "Siliniyor…" : "Evet, sil"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
