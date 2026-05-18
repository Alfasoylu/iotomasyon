"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePurchaseOrderStatusAction } from "@/lib/actions/purchase-order-actions";

type Status = "DRAFT" | "CONFIRMED" | "ORDERED" | "SHIPPED" | "RECEIVED";

const NEXT_STATUS: Partial<Record<Status, Status>> = {
  DRAFT:     "CONFIRMED",
  CONFIRMED: "ORDERED",
  ORDERED:   "SHIPPED",
  SHIPPED:   "RECEIVED",
};

const NEXT_LABELS: Partial<Record<Status, string>> = {
  DRAFT:     "Onayla",
  CONFIRMED: "Sipariş Verildi",
  ORDERED:   "Yola Çıktı",
  SHIPPED:   "Teslim Alındı",
};

export function PurchaseOrderStatusButton({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const status = currentStatus as Status;
  const nextStatus = NEXT_STATUS[status];

  if (!nextStatus) return null;

  function handleAdvance() {
    setPending(true);
    startTransition(async () => {
      await updatePurchaseOrderStatusAction(orderId, nextStatus!);
      setPending(false);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleAdvance}
      disabled={pending}
      className="text-xs font-medium text-slate-500 hover:text-slate-900 transition disabled:opacity-40"
    >
      {pending ? "..." : `→ ${NEXT_LABELS[status]}`}
    </button>
  );
}
