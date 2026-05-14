"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";

import {
  createCustomerAction,
  updateCustomerAction,
} from "@/lib/actions/customer-actions";
import { customerSchema } from "@/lib/validations/customer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_STATUS_OPTIONS,
  type CustomerFormValues,
} from "@/types/customers";

const emptyValues: CustomerFormValues = {
  name: "",
  company: "",
  phone: "",
  whatsapp: "",
  email: "",
  taxNumber: "",
  address: "",
  city: "",
  country: "",
  notes: "",
  status: "NEW",
};

export function CustomerForm({
  mode,
  customerId,
  initialValues,
}: {
  mode: "create" | "edit";
  customerId?: string;
  initialValues?: CustomerFormValues;
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: initialValues ?? emptyValues,
  });

  const submit = form.handleSubmit((values) => {
    setServerMessage(undefined);
    setPending(true);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCustomerAction(values)
          : await updateCustomerAction(customerId ?? "", values);

      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);

        for (const [fieldName, errors] of Object.entries(result.fieldErrors ?? {})) {
          if (!errors?.length) {
            continue;
          }

          form.setError(fieldName as keyof CustomerFormValues, {
            message: errors[0],
          });
        }

        return;
      }

      router.push(result.redirectTo ?? "/customers");
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Musteri adi *" error={form.formState.errors.name?.message}>
          <Input {...form.register("name")} />
        </Field>
        <Field label="Firma" error={form.formState.errors.company?.message}>
          <Input {...form.register("company")} />
        </Field>
        <Field label="Telefon" error={form.formState.errors.phone?.message}>
          <Input {...form.register("phone")} />
        </Field>
        <Field label="WhatsApp" error={form.formState.errors.whatsapp?.message}>
          <Input {...form.register("whatsapp")} />
        </Field>
        <Field label="E-posta" error={form.formState.errors.email?.message}>
          <Input type="email" {...form.register("email")} />
        </Field>
        <Field label="Vergi no" error={form.formState.errors.taxNumber?.message}>
          <Input {...form.register("taxNumber")} />
        </Field>
        <Field label="Sehir" error={form.formState.errors.city?.message}>
          <Input {...form.register("city")} />
        </Field>
        <Field label="Ulke" error={form.formState.errors.country?.message}>
          <Input {...form.register("country")} />
        </Field>
        <Field label="Durum" error={form.formState.errors.status?.message}>
          <select
            {...form.register("status")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            {CUSTOMER_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Adres" error={form.formState.errors.address?.message}>
        <Textarea {...form.register("address")} className="min-h-24" />
      </Field>

      <Field label="Notlar" error={form.formState.errors.notes?.message}>
        <Textarea {...form.register("notes")} className="min-h-24" />
      </Field>

      {serverMessage ? <p className="text-sm text-red-600">{serverMessage}</p> : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create"
              ? "Kaydediliyor..."
              : "Guncelleniyor..."
            : mode === "create"
              ? "Musteriyi olustur"
              : "Degisiklikleri kaydet"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(mode === "create" ? "/customers" : `/customers/${customerId}`)}
        >
          Vazgec
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
      <p className="text-sm text-red-600">{error}</p>
    </div>
  );
}
