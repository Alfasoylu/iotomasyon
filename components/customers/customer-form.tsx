"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  createCustomerAction,
  updateCustomerAction,
} from "@/lib/actions/customer-actions";
import { customerSchema } from "@/lib/validations/customer";
import { AttributePicker } from "@/components/attributes/attribute-picker";
import { LocationCombobox } from "@/components/customers/location-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_SOURCE_OPTIONS,
  type CustomerFormValues,
} from "@/types/customers";
import type { AttributeOption } from "@/services/attribute-service";
import type { UserOption } from "@/services/customer-service";

const emptyValues: CustomerFormValues = {
  name:      "",
  company:   "",
  phone:     "",
  whatsapp:  "",
  email:     "",
  taxNumber: "",
  address:   "",
  city:      "",
  district:  "",
  notes:     "",
  status:    "NEW",
  source:    "",
  ownedById: "",
};

export function CustomerForm({
  mode,
  customerId,
  initialValues,
  users = [],
  allAttributes = [],
  initialAttributeIds = [],
  preselectedProductId,
  preselectedCategoryId,
  cities = [],
  districtsByCity = {},
}: {
  mode: "create" | "edit";
  customerId?: string;
  initialValues?: CustomerFormValues;
  users?: UserOption[];
  allAttributes?: AttributeOption[];
  initialAttributeIds?: string[];
  preselectedProductId?: string;
  preselectedCategoryId?: string;
  cities?: string[];
  districtsByCity?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [selectedAttributeIds, setSelectedAttributeIds] = useState<string[]>(initialAttributeIds);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: initialValues ?? emptyValues,
  });

  const selectedCity = useWatch({ control: form.control, name: "city" }) ?? "";
  const selectedDistrict = useWatch({ control: form.control, name: "district" }) ?? "";
  const districtOptions = districtsByCity[selectedCity] ?? [];

  const submit = form.handleSubmit((values) => {
    setServerMessage(undefined);
    setPending(true);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCustomerAction(values, {
              productId:    preselectedProductId,
              categoryId:   preselectedCategoryId,
              attributeIds: selectedAttributeIds,
            })
          : await updateCustomerAction(customerId ?? "", values, selectedAttributeIds);

      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);

        for (const [fieldName, errors] of Object.entries(result.fieldErrors ?? {})) {
          if (!errors?.length) continue;
          form.setError(fieldName as keyof CustomerFormValues, { message: errors[0] });
        }
        return;
      }

      router.push(result.redirectTo ?? "/customers");
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Pre-link notice */}
      {(preselectedProductId || preselectedCategoryId) && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {preselectedProductId
            ? "Müşteri kaydedilince seçili ürün ilgisi otomatik eklenir."
            : "Müşteri kaydedilince seçili kategori ilgisi otomatik eklenir."}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Müşteri adı *" error={form.formState.errors.name?.message}>
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

        {/* City combobox */}
        <Field label="İl" error={form.formState.errors.city?.message}>
          <LocationCombobox
            options={cities}
            value={selectedCity}
            onChange={(val) => {
              form.setValue("city", val, { shouldValidate: true });
              form.setValue("district", "");
            }}
            placeholder="İl seçin veya yazın..."
          />
        </Field>

        {/* District combobox — key resets component when city changes */}
        <Field label="İlçe" error={form.formState.errors.district?.message}>
          <LocationCombobox
            key={selectedCity}
            options={districtOptions}
            value={selectedDistrict}
            onChange={(val) =>
              form.setValue("district", val, { shouldValidate: true })
            }
            placeholder={
              selectedCity ? "İlçe seçin veya yazın..." : "Önce il seçin"
            }
            disabled={!selectedCity}
          />
        </Field>

        <Field label="Durum" error={form.formState.errors.status?.message}>
          <select
            {...form.register("status")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            {CUSTOMER_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Müşteri nereden geldi?" error={form.formState.errors.source?.message}>
          <select
            {...form.register("source")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            <option value="">— Kaynak seçin —</option>
            {CUSTOMER_SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        {users.length > 0 && (
          <Field label="Müşteri sahibi" error={form.formState.errors.ownedById?.message}>
            <select
              {...form.register("ownedById")}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
            >
              <option value="">— Sahip seçin —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="Adres" error={form.formState.errors.address?.message}>
        <Textarea {...form.register("address")} className="min-h-24" />
      </Field>

      <Field label="Notlar" error={form.formState.errors.notes?.message}>
        <Textarea {...form.register("notes")} className="min-h-24" />
      </Field>

      {allAttributes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">İlgi alanları</p>
          <p className="text-xs text-slate-500">Müşterinin ilgilendiği ürün özelliklerini seçin.</p>
          <AttributePicker
            value={selectedAttributeIds}
            onChange={setSelectedAttributeIds}
            options={allAttributes}
          />
        </div>
      )}

      {serverMessage ? <p className="text-sm text-red-600">{serverMessage}</p> : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create" ? "Kaydediliyor..." : "Güncelleniyor..."
            : mode === "create" ? "Müşteriyi oluştur" : "Değişiklikleri kaydet"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(mode === "create" ? "/customers" : `/customers/${customerId}`)}
        >
          Vazgeç
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
