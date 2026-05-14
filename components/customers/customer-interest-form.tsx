"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createCustomerInterestAction } from "@/lib/actions/customer-crm-actions";
import { customerInterestSchema } from "@/lib/validations/customer-crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  INTEREST_STAGE_OPTIONS,
  type CustomerInterestFormValues,
} from "@/types/customers";

export function CustomerInterestForm({
  customerId,
  products,
}: {
  customerId: string;
  products: Array<{ id: string; name: string; sku: string }>;
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  const form = useForm<CustomerInterestFormValues>({
    resolver: zodResolver(customerInterestSchema),
    defaultValues: {
      productId: products[0]?.id ?? "",
      quantity: 1,
      quotedPrice: "",
      currency: "TRY",
      stage: "INTERESTED",
      notes: "",
    },
  });

  const submit = form.handleSubmit((values) => {
    setServerMessage(undefined);
    setPending(true);

    startTransition(async () => {
      const result = await createCustomerInterestAction(customerId, values);
      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);
        return;
      }

      form.reset({
        productId: products[0]?.id ?? "",
        quantity: 1,
        quotedPrice: "",
        currency: "TRY",
        stage: "INTERESTED",
        notes: "",
      });
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Urun">
          <select
            {...form.register("productId")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Asama">
          <select
            {...form.register("stage")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            {INTEREST_STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Miktar">
          <Input
            type="number"
            min={1}
            {...form.register("quantity", { valueAsNumber: true })}
          />
        </Field>
        <Field label="Teklif fiyati">
          <Input {...form.register("quotedPrice")} placeholder="Orn. 12500" />
        </Field>
        <Field label="Para birimi">
          <Input {...form.register("currency")} />
        </Field>
      </div>

      <Field label="Notlar">
        <Textarea {...form.register("notes")} className="min-h-24" />
      </Field>

      {serverMessage ? <p className="text-sm text-red-600">{serverMessage}</p> : null}

      <Button type="submit" disabled={pending || products.length === 0}>
        {pending ? "Ekleniyor..." : "Urun ilgisi ekle"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
