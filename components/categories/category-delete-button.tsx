"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { deleteCategoryAction } from "@/lib/actions/category-actions";
import { Button } from "@/components/ui/button";

export function CategoryDeleteButton({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  function handleClick() {
    if (!confirm("Bu kategoriyi silmek istediginizden emin misiniz?")) return;

    setPending(true);
    setError(undefined);

    startTransition(async () => {
      const result = await deleteCategoryAction(categoryId);
      setPending(false);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      router.push("/categories");
      router.refresh();
    });
  }

  return (
    <div>
      <Button variant="secondary" onClick={handleClick} disabled={pending}>
        {pending ? "Siliniyor..." : "Sil"}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
