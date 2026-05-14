"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";

import { createCategoryInterestAction } from "@/lib/actions/customer-crm-actions";
import { categoryInterestSchema, type CategoryInterestInput } from "@/lib/validations/customer-crm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { INTEREST_STAGE_OPTIONS } from "@/types/customers";
import { formatInterestStage } from "@/lib/customer-utils";

type CategoryOption = { id: string; name: string };

export function CategoryInterestForm({
  customerId,
  categories,
}: {
  customerId: string;
  categories: CategoryOption[];
}) {
  const [pending, setPending] = useState(false);
  const [serverMessage, setServerMessage] = useState<string>();

  const form = useForm<CategoryInterestInput>({
    resolver: zodResolver(categoryInterestSchema),
    defaultValues: { categoryId: "", stage: "INTERESTED", notes: "" },
  });

  const submit = form.handleSubmit((values) => {
    setServerMessage(undefined);
    setPending(true);

    startTransition(async () => {
      const result = await createCategoryInterestAction(customerId, values);
      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);

        for (const [fieldName, errors] of Object.entries(result.fieldErrors ?? {})) {
          if (!errors?.length) continue;
          form.setError(fieldName as keyof CategoryInterestInput, { message: errors[0] });
        }

        return;
      }

      form.reset();
    });
  });

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-700">Kategori ilgisi ekle</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Kategori
          </label>
          <select
            {...form.register("categoryId")}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="">-- Secin --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {form.formState.errors.categoryId && (
            <p className="text-xs text-red-600">{form.formState.errors.categoryId.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Aşama
          </label>
          <select
            {...form.register("stage")}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            {INTEREST_STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {formatInterestStage(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Not (opsiyonel)
        </label>
        <Textarea
          {...form.register("notes")}
          placeholder="Kategori ilgisi hakkinda not ekleyin..."
          className="min-h-[60px]"
        />
      </div>

      {serverMessage ? <p className="text-xs text-red-600">{serverMessage}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Ekleniyor..." : "Kategori ilgisi ekle"}
      </Button>
    </form>
  );
}
