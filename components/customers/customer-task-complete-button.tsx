"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { completeCustomerTaskAction } from "@/lib/actions/customer-crm-actions";
import { Button } from "@/components/ui/button";

export function CustomerTaskCompleteButton({
  customerId,
  taskId,
}: {
  customerId: string;
  taskId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => {
        setPending(true);

        startTransition(async () => {
          const result = await completeCustomerTaskAction(customerId, taskId);

          if (result.ok) {
            router.refresh();
            return;
          }

          setPending(false);
        });
      }}
    >
      {pending ? "Kaydediliyor..." : "Tamamlandi"}
    </Button>
  );
}
