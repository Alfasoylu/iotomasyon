"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { deleteProductAction } from "@/lib/actions/product-actions";
import { Button } from "@/components/ui/button";

export function ProductDeleteButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Bu urunu silmek istediginizden emin misiniz?")) {
          return;
        }

        setPending(true);

        startTransition(async () => {
          const result = await deleteProductAction(productId);

          if (result.ok) {
            router.push("/products");
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
