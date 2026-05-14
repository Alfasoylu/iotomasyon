"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createCustomerNoteAction } from "@/lib/actions/customer-crm-actions";
import { customerTimelineNoteSchema } from "@/lib/validations/customer-crm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  NOTE_TYPE_OPTIONS,
  type CustomerTimelineNoteFormValues,
} from "@/types/customers";

export function CustomerNoteForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  const form = useForm<CustomerTimelineNoteFormValues>({
    resolver: zodResolver(customerTimelineNoteSchema),
    defaultValues: {
      note: "",
      type: "NOTE",
    },
  });

  const submit = form.handleSubmit((values) => {
    setServerMessage(undefined);
    setPending(true);

    startTransition(async () => {
      const result = await createCustomerNoteAction(customerId, values);
      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);
        return;
      }

      form.reset({ note: "", type: "NOTE" });
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <select
        {...form.register("type")}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
      >
        {NOTE_TYPE_OPTIONS.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      <Textarea {...form.register("note")} className="min-h-24" placeholder="Müşteri ile son görüşme notu" />

      {serverMessage ? <p className="text-sm text-red-600">{serverMessage}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Ekleniyor..." : "Not ekle"}
      </Button>
    </form>
  );
}
