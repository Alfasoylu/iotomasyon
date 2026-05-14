"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { deleteCustomerAction } from "@/lib/actions/customer-actions";
import { Button } from "@/components/ui/button";

export function CustomerDeleteButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Bu musteriyi silmek istediginizden emin misiniz?")) {
          return;
        }

        setPending(true);

        startTransition(async () => {
          const result = await deleteCustomerAction(customerId);

          if (result.ok) {
            router.push("/customers");
            router.refresh();
            return;
          }

          setPending(false);
        });
      }}
    >
      {pending ? "Siliniyor..." : "Sil"}
    </Button>
  );
}
