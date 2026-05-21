"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  formatCustomerStatus,
  getCustomerStatusTone,
} from "@/lib/customer-utils";
import { updateCustomerStatusAction } from "@/lib/actions/customer-crm-actions";

type Status = "NEW" | "CONTACTED" | "QUOTED" | "NEGOTIATING" | "WON" | "LOST";

const STATUSES: Status[] = ["NEW", "CONTACTED", "QUOTED", "NEGOTIATING", "WON", "LOST"];

/**
 * Status rozetine tıklayınca dropdown açar, seçince inline kaydeder.
 * Sayfaya / edit'e gitmek yok.
 */
export function InlineStatusEditor({
  customerId,
  currentStatus,
}: {
  customerId: string;
  currentStatus: Status;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function selectStatus(status: Status) {
    if (status === currentStatus) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await updateCustomerStatusAction(customerId, status);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 opacity-90 transition hover:opacity-100"
        disabled={pending}
        title="Durumu değiştir"
      >
        <Badge tone={getCustomerStatusTone(currentStatus)}>
          {formatCustomerStatus(currentStatus)}
        </Badge>
        <ChevronDown size={12} strokeWidth={1.5} className="text-[var(--text-muted)]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-2)]">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectStatus(s)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${
                s === currentStatus
                  ? "bg-[var(--surface-3)]"
                  : "hover:bg-[var(--surface-3)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <Badge tone={getCustomerStatusTone(s)}>
                  {formatCustomerStatus(s)}
                </Badge>
              </span>
              {s === currentStatus && (
                <Check size={12} strokeWidth={1.5} className="text-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
