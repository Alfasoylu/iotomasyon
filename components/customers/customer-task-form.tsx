"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createCustomerTaskAction } from "@/lib/actions/customer-crm-actions";
import { customerTaskSchema } from "@/lib/validations/customer-crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type CustomerTaskFormValues } from "@/types/customers";

type UserOption = { id: string; name: string };

export function CustomerTaskForm({
  customerId,
  users = [],
  canAssign = false,
}: {
  customerId: string;
  users?: UserOption[];
  canAssign?: boolean;
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  const form = useForm<CustomerTaskFormValues>({
    resolver: zodResolver(customerTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      dueDate: "",
      priority: "MEDIUM",
      assignedToId: "",
    },
  });

  const submit = form.handleSubmit((values) => {
    setServerMessage(undefined);
    setPending(true);

    startTransition(async () => {
      const result = await createCustomerTaskAction(customerId, values);
      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);
        return;
      }

      form.reset({
        title: "",
        description: "",
        dueDate: "",
        priority: "MEDIUM",
        assignedToId: "",
      });
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Input {...form.register("title")} placeholder="Teklifi tekrar ara" />
        <Input type="date" {...form.register("dueDate")} />
      </div>

      <div className={`grid gap-4 ${canAssign && users.length > 0 ? "md:grid-cols-2" : ""}`}>
        <select
          {...form.register("priority")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
        >
          <option value="LOW">Düşük</option>
          <option value="MEDIUM">Orta</option>
          <option value="HIGH">Yüksek</option>
          <option value="URGENT">Acil</option>
        </select>

        {canAssign && users.length > 0 && (
          <select
            {...form.register("assignedToId")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            <option value="">Atanmamış</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <Textarea {...form.register("description")} className="min-h-24" placeholder="Görev açıklaması" />

      {serverMessage ? <p className="text-sm text-red-600">{serverMessage}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Oluşturuluyor..." : "Takip görevi oluştur"}
      </Button>
    </form>
  );
}
