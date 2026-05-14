"use client";

import { useState, useTransition } from "react";

import { toggleCustomerAttributeInterestAction } from "@/lib/actions/attribute-actions";
import type { AttributeOption } from "@/services/attribute-service";

export function CustomerAttributeSection({
  customerId,
  allAttributes,
  initialAttributeIds,
}: {
  customerId: string;
  allAttributes: AttributeOption[];
  initialAttributeIds: string[];
}) {
  const [selectedIds, setSelectedIds] = useState(initialAttributeIds);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const toggle = (attributeId: string) => {
    const add = !selectedIds.includes(attributeId);
    startTransition(async () => {
      const result = await toggleCustomerAttributeInterestAction(customerId, attributeId, add);
      if (result.ok) {
        setSelectedIds(add
          ? [...selectedIds, attributeId]
          : selectedIds.filter((id) => id !== attributeId),
        );
        setError(undefined);
      } else {
        setError(result.message);
      }
    });
  };

  if (allAttributes.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {allAttributes.map((attr) => {
          const selected = selectedIds.includes(attr.id);
          return (
            <button
              key={attr.id}
              type="button"
              onClick={() => toggle(attr.id)}
              disabled={isPending}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                selected
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                  : "border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300"
              }`}
            >
              {attr.name}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
