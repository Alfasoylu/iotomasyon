"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { deleteCustomerInterestAction } from "@/lib/actions/customer-crm-actions";
import { Button } from "@/components/ui/button";

export function CustomerInterestDeleteButton({
  customerId,
  interestId,
}: {
  customerId: string;
  interestId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      className="h-auto px-0 text-red-600 hover:bg-transparent hover:text-red-500"
      disabled={pending}
      onClick={() => {
        setPending(true);

        startTransition(async () => {
          const result = await deleteCustomerInterestAction(customerId, interestId);

          if (result.ok) {
            router.refresh();
            return;
          }

          setPending(false);
        });
      }}
    >
      {pending ? "Siliniyor..." : "Kaldir"}
    </Button>
  );
}
