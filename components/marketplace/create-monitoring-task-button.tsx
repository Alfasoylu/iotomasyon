"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createListingMonitoringTaskAction } from "@/lib/actions/marketplace-listing-actions";

interface Props {
  productId: string;
  title: string;
  description: string;
  assignedToId?: string;
}

export function CreateMonitoringTaskButton({ productId, title, description, assignedToId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createListingMonitoringTaskAction({ productId, title, description, assignedToId });
      if (result.ok) {
        setDone(true);
      } else {
        setError(result.message ?? null);
      }
    });
  }

  if (done) {
    return (
      <span className="text-xs font-medium text-emerald-600">✓ Görev oluşturuldu</span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs h-7 px-2"
      >
        {isPending ? "Oluşturuluyor…" : "Görev oluştur"}
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
