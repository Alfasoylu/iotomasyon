"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

import { createQuoteAction } from "@/lib/actions/quote-actions";
import { quoteSchema } from "@/lib/validations/quote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { QuoteFormValues } from "@/types/quotes";

const emptyItem = {
  productId: "",
  description: "",
  quantity: 1,
  unitPrice: "",
  currency: "TRY",
  discount: "0",
  tax: "0",
};

export function QuoteForm({
  customerId,
  products,
}: {
  customerId: string;
  products: Array<{ id: string; name: string; sku: string }>;
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      notes: "",
      validityDate: "",
      items: [{ ...emptyItem }],
    },
  });

  const items = useFieldArray({
    control: form.control,
    name: "items",
  });

  const submit = form.handleSubmit((values) => {
    setPending(true);
    setServerMessage(undefined);

    startTransition(async () => {
      const result = await createQuoteAction(customerId, values);
      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);
        return;
      }

      router.push(result.redirectTo ?? `/customers/${customerId}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-4">
        {items.fields.map((field, index) => (
          <div key={field.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <select
                {...form.register(`items.${index}.productId`)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
              >
                <option value="">Urun baglama (opsiyonel)</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
              <Input
                {...form.register(`items.${index}.description`)}
                placeholder="Kalem aciklamasi"
              />
              <Input
                type="number"
                min={1}
                {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                placeholder="Miktar"
              />
              <Input
                {...form.register(`items.${index}.unitPrice`)}
                placeholder="Birim fiyat"
              />
              <Input
                {...form.register(`items.${index}.currency`)}
                placeholder="TRY"
              />
              <Input
                {...form.register(`items.${index}.discount`)}
                placeholder="Indirim"
              />
              <Input
                {...form.register(`items.${index}.tax`)}
                placeholder="Vergi"
              />
            </div>

            {items.fields.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-4 h-auto px-0 text-red-600 hover:bg-transparent hover:text-red-500"
                onClick={() => items.remove(index)}
              >
                Kalemi kaldir
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={() => items.append({ ...emptyItem })}
      >
        Kalem ekle
      </Button>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Gecerlilik tarihi
          </label>
          <Input type="date" {...form.register("validityDate")} />
        </div>
      </div>

      <Textarea {...form.register("notes")} className="min-h-24" placeholder="Teklif notu" />

      {serverMessage ? <p className="text-sm text-red-600">{serverMessage}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Olusturuluyor..." : "Teklif olustur"}
      </Button>
    </form>
  );
}
