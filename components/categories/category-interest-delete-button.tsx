"use client";

import { startTransition, useState } from "react";

import { deleteCategoryInterestAction } from "@/lib/actions/customer-crm-actions";
import { Button } from "@/components/ui/button";

export function CategoryInterestDeleteButton({
  customerId,
  interestId,
}: {
  customerId: string;
  interestId: string;
}) {
  const [pending, setPending] = useState(false);

  function handleClick() {
    setPending(true);
    startTransition(async () => {
      await deleteCategoryInterestAction(customerId, interestId);
      setPending(false);
    });
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={pending}>
      {pending ? "Siliniyor..." : "Kaldir"}
    </Button>
  );
}
