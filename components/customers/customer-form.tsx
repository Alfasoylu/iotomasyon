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
  CUSTOMER_TYPE_OPTIONS,
  CUSTOMER_TYPE_LABELS,
  USED_TECH_OPTIONS,
  type CustomerFormValues,
} from "@/types/customers";
import type { AttributeOption } from "@/services/attribute-service";
import type { UserOption } from "@/services/customer-service";

const emptyValues: CustomerFormValues = {
  name:                  "",
  company:               "",
  phone:                 "",
  whatsapp:              "",
  email:                 "",
  taxNumber:             "",
  address:               "",
  city:                  "",
  district:              "",
  notes:                 "",
  status:                "NEW",
  source:                "",
  ownedById:             "",
  customerType:          "",
  monthlySalesPotential: "",
  platformNotes:         "",
  industryId:            "",
  usedTech:              [],
  currentSupplier:       "",
};

interface IndustryOptionGroup {
  id: string;
  name: string;
  children: Array<{ id: string; name: string }>;
}

const selectCls =
  "h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] disabled:opacity-50";

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
  industryGroups = [],
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
  industryGroups?: IndustryOptionGroup[];
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

  const selectedIndustryId = useWatch({ control: form.control, name: "industryId" }) ?? "";
  const selectedUsedTech = useWatch({ control: form.control, name: "usedTech" }) ?? [];
  // Sektör + grubunu bul (UI'da hangi grup işaretli görünsün diye)
  const selectedIndustryGroup = industryGroups.find((g) =>
    g.children.some((c) => c.id === selectedIndustryId),
  );

  function toggleUsedTech(value: string) {
    const current = form.getValues("usedTech") ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    form.setValue("usedTech", next, { shouldValidate: true });
  }

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
        <div className="rounded-md border border-[var(--info-border)] bg-[var(--info-dim)] px-4 py-3 text-[13px] text-[var(--info)]">
          {preselectedProductId
            ? "Müşteri kaydedilince seçili ürün ilgisi otomatik eklenir."
            : "Müşteri kaydedilince seçili kategori ilgisi otomatik eklenir."}
        </div>
      )}

      <Section title="Kimlik & İletişim">
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
            <Input {...form.register("taxNumber")} className="font-mono" />
          </Field>
        </div>
      </Section>

      <Section title="Konum">
        <div className="grid gap-4 md:grid-cols-2">
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
        </div>

        <Field label="Adres" error={form.formState.errors.address?.message}>
          <Textarea {...form.register("address")} className="min-h-24" />
        </Field>
      </Section>

      <Section title="Sınıflandırma">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Durum" error={form.formState.errors.status?.message}>
            <select {...form.register("status")} className={selectCls}>
              {CUSTOMER_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Müşteri nereden geldi?" error={form.formState.errors.source?.message}>
            <select {...form.register("source")} className={selectCls}>
              <option value="">— Kaynak seçin —</option>
              {CUSTOMER_SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Müşteri tipi" error={form.formState.errors.customerType?.message}>
            <select {...form.register("customerType")} className={selectCls}>
              <option value="">— Tip seçin —</option>
              {CUSTOMER_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Aylık satış potansiyeli (USD)" error={form.formState.errors.monthlySalesPotential?.message}>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className="font-mono tabular-nums"
              {...form.register("monthlySalesPotential")}
            />
          </Field>
          {users.length > 0 && (
            <Field label="Müşteri sahibi" error={form.formState.errors.ownedById?.message}>
              <select {...form.register("ownedById")} className={selectCls}>
                <option value="">— Sahip seçin —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Section>

      {/* Phase 99 — Sektör + Teknoloji + Mevcut Tedarikçi */}
      {industryGroups.length > 0 && (
        <Section title="Sektör & Teknoloji Profili">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Sektör grubu">
              <select
                value={selectedIndustryGroup?.id ?? ""}
                onChange={(e) => {
                  const newGroupId = e.target.value;
                  form.setValue("industryId", "");
                  if (!newGroupId) return;
                  const grp = industryGroups.find((g) => g.id === newGroupId);
                  if (grp?.children[0]) {
                    form.setValue("industryId", grp.children[0].id, { shouldValidate: true });
                  }
                }}
                className={selectCls}
              >
                <option value="">— Grup seçin —</option>
                {industryGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Alt sektör">
              <select
                {...form.register("industryId")}
                disabled={!selectedIndustryGroup}
                className={selectCls}
              >
                <option value="">{selectedIndustryGroup ? "— Alt sektör —" : "Önce grup seçin"}</option>
                {selectedIndustryGroup?.children.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Kullandığı teknoloji (çağrıda öğrenirken işaretle)">
            <div className="flex flex-wrap gap-2">
              {USED_TECH_OPTIONS.map((opt) => {
                const checked = selectedUsedTech.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleUsedTech(opt.value)}
                    className={`rounded-md border px-3 py-1.5 text-[12px] font-medium transition ${
                      checked
                        ? "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
                        : "border-[var(--border-default)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Mevcut tedarikçisi / marka (rakip — biliyorsan)" error={form.formState.errors.currentSupplier?.message}>
            <Input
              {...form.register("currentSupplier")}
              placeholder="örn: Hikvision, Avocon, Dahua..."
            />
          </Field>
        </Section>
      )}

      <Section title="Notlar">
        <Field label="Notlar" error={form.formState.errors.notes?.message}>
          <Textarea {...form.register("notes")} className="min-h-24" />
        </Field>

        <Field label="Platform notları" error={form.formState.errors.platformNotes?.message}>
          <Textarea
            {...form.register("platformNotes")}
            className="min-h-24"
            placeholder="Platform özelinde notlar (ör. Trendyol mağaza linki, özel anlaşmalar...)"
          />
        </Field>
      </Section>

      {allAttributes.length > 0 && (
        <Section title="İlgi alanları">
          <p className="text-[12px] text-[var(--text-muted)]">
            Müşterinin ilgilendiği ürün özelliklerini seçin.
          </p>
          <AttributePicker
            value={selectedAttributeIds}
            onChange={setSelectedAttributeIds}
            options={allAttributes}
          />
        </Section>
      )}

      {serverMessage ? (
        <p className="text-[13px] text-[var(--danger)]">{serverMessage}</p>
      ) : null}

      <div className="flex gap-2 border-t border-[var(--border-subtle)] pt-5">
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create" ? "Kaydediliyor..." : "Güncelleniyor..."
            : mode === "create" ? "Müşteriyi oluştur" : "Değişiklikleri kaydet"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(mode === "create" ? "/customers" : `/customers/${customerId}`)}
        >
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 border-t border-[var(--border-subtle)] pt-5 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label className="block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12px] text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
