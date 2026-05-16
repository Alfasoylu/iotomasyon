"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";

import {
  createProductAction,
  updateProductAction,
} from "@/lib/actions/product-actions";
import { productSchema } from "@/lib/validations/product";
import { AttributePicker } from "@/components/attributes/attribute-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AttributeOption } from "@/services/attribute-service";
import type { ProductFormValues } from "@/types/products";

type CategoryOption = { id: string; name: string };
type UserOption = { id: string; name: string };

const STOCK_SOURCE_OPTIONS = [
  { value: "", label: "-- Seçin --" },
  { value: "MANUAL", label: "Manuel giriş" },
  { value: "XML", label: "XML senkronizasyon" },
  { value: "API", label: "API entegrasyonu" },
  { value: "IMPORT", label: "İthalat" },
];

const STOCK_CONFIDENCE_OPTIONS = [
  { value: "", label: "-- Seçin --" },
  { value: "HIGH", label: "Yüksek — Sayıma dayalı" },
  { value: "MEDIUM", label: "Orta — Hesaplama/tahmin" },
  { value: "LOW", label: "Düşük — Eski/belirsiz veri" },
];

const emptyValues: ProductFormValues = {
  sku: "",
  barcode: "",
  name: "",
  imageUrl: "",
  category: "",
  categoryId: "",
  brand: "",
  model: "",
  supplier: "",
  stockQuantity: 0,
  minimumStock: 0,
  reorderLeadTime: "",
  stockSource: "",
  stockConfidence: "",
  lastStockSyncAt: "",
  lastStockCountById: "",
  location: "",
  description: "",
  isActive: true,
  shippingCost: "",
  shippingCostOverride: "",
  marketplaceCommission: "",
  marketplaceCommissionOverride: "",
  importDate: "",
  importQuantity: "",
  importUnitCostUsd: "",
  inventoryCountDate: "",
  inventoryCountStock: "",
};

export function ProductForm({
  mode,
  productId,
  initialValues,
  categories,
  allAttributes = [],
  initialAttributeIds = [],
  users = [],
}: {
  mode: "create" | "edit";
  productId?: string;
  initialValues?: ProductFormValues;
  categories?: CategoryOption[];
  allAttributes?: AttributeOption[];
  initialAttributeIds?: string[];
  users?: UserOption[];
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [selectedAttributeIds, setSelectedAttributeIds] = useState<string[]>(initialAttributeIds);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: initialValues ?? emptyValues,
  });

  const submit = form.handleSubmit((values) => {
    setServerMessage(undefined);
    setPending(true);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createProductAction(values, selectedAttributeIds)
          : await updateProductAction(productId ?? "", values, selectedAttributeIds);

      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);

        for (const [fieldName, errors] of Object.entries(result.fieldErrors ?? {})) {
          if (!errors?.length) {
            continue;
          }

          form.setError(fieldName as keyof ProductFormValues, {
            message: errors[0],
          });
        }

        return;
      }

      router.push(result.redirectTo ?? "/products");
      router.refresh();
    });
  });

  const selectCls =
    "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100";

  return (
    <form onSubmit={submit} className="space-y-8">

      {/* ── Temel bilgiler ── */}
      <Section title="Temel bilgiler">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="SKU *" error={form.formState.errors.sku?.message}>
            <Input {...form.register("sku")} placeholder="ÜRN-001" className="font-mono uppercase" />
          </Field>
          <Field label="Barkod" error={form.formState.errors.barcode?.message}>
            <Input {...form.register("barcode")} placeholder="8681234567890" className="font-mono" />
          </Field>
          <Field label="Ürün adı *" error={form.formState.errors.name?.message} className="md:col-span-2">
            <Input {...form.register("name")} placeholder="Ürünün tam adı" />
          </Field>
          <Field label="Marka" error={form.formState.errors.brand?.message}>
            <Input {...form.register("brand")} />
          </Field>
          <Field label="Model" error={form.formState.errors.model?.message}>
            <Input {...form.register("model")} />
          </Field>
          <Field label="Tedarikçi" error={form.formState.errors.supplier?.message}>
            <Input {...form.register("supplier")} placeholder="Tedarikçi / kaynak firma" />
          </Field>
          <Field label="Kategori" error={form.formState.errors.categoryId?.message}>
            {categories && categories.length > 0 ? (
              <select {...form.register("categoryId")} className={selectCls}>
                <option value="">-- Seçin --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <Input {...form.register("category")} placeholder="Kategori adı" />
            )}
          </Field>
          <Field label="Görsel URL" error={form.formState.errors.imageUrl?.message} className="md:col-span-2">
            <Input {...form.register("imageUrl")} placeholder="https://..." />
          </Field>
          <Field label="Açıklama" error={form.formState.errors.description?.message} className="md:col-span-2">
            <Textarea {...form.register("description")} />
          </Field>
        </div>
        <label className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4" {...form.register("isActive")} />
          Aktif ürün olarak listelensin
        </label>
      </Section>

      {/* ── Stok ve konum ── */}
      <Section title="Stok ve konum">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Güncel stok" error={form.formState.errors.stockQuantity?.message}>
            <Input type="number" min={0} {...form.register("stockQuantity", { valueAsNumber: true })} />
          </Field>
          <Field label="Minimum stok eşiği" error={form.formState.errors.minimumStock?.message}>
            <Input type="number" min={0} {...form.register("minimumStock", { valueAsNumber: true })} />
          </Field>
          <Field label="Temin süresi (gün)" error={form.formState.errors.reorderLeadTime?.message}>
            <Input type="number" min={0} {...form.register("reorderLeadTime")} placeholder="0" />
          </Field>
          <Field label="Raf / konum kodu" error={form.formState.errors.location?.message}>
            <Input {...form.register("location")} placeholder="A3-Raf2 / Depo-B" />
          </Field>
          <Field label="Stok kaynağı" error={form.formState.errors.stockSource?.message}>
            <select {...form.register("stockSource")} className={selectCls}>
              {STOCK_SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Stok güvenilirliği" error={form.formState.errors.stockConfidence?.message}>
            <select {...form.register("stockConfidence")} className={selectCls}>
              {STOCK_CONFIDENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Son harici senkronizasyon" error={form.formState.errors.lastStockSyncAt?.message}>
            <Input type="date" {...form.register("lastStockSyncAt")} />
          </Field>
          {users.length > 0 && (
            <Field label="Son manuel sayımı yapan" error={form.formState.errors.lastStockCountById?.message}>
              <select {...form.register("lastStockCountById")} className={selectCls}>
                <option value="">-- Seçin --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Section>

      {/* ── Maliyet girdileri ── */}
      <Section title="Maliyet girdileri">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Standart kargo maliyeti (₺)" error={form.formState.errors.shippingCost?.message}>
            <Input {...form.register("shippingCost")} placeholder="0.00" />
          </Field>
          <Field label="Kargo maliyeti (manuel override)" error={form.formState.errors.shippingCostOverride?.message}>
            <Input {...form.register("shippingCostOverride")} placeholder="0.00" />
          </Field>
          <Field label="Standart pazar komisyonu (%)" error={form.formState.errors.marketplaceCommission?.message}>
            <Input {...form.register("marketplaceCommission")} placeholder="20" />
          </Field>
          <Field label="Komisyon (manuel override %)" error={form.formState.errors.marketplaceCommissionOverride?.message}>
            <Input {...form.register("marketplaceCommissionOverride")} placeholder="20" />
          </Field>
        </div>
      </Section>

      {/* ── İthalat ve envanter ── */}
      <Section title="İthalat ve envanter">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="İthalat tarihi" error={form.formState.errors.importDate?.message}>
            <Input type="date" {...form.register("importDate")} />
          </Field>
          <Field label="İthalatta gelen adet" error={form.formState.errors.importQuantity?.message}>
            <Input type="number" min={0} {...form.register("importQuantity")} placeholder="0" />
          </Field>
          <Field label="İthalat birim maliyeti (USD)" error={form.formState.errors.importUnitCostUsd?.message}>
            <Input {...form.register("importUnitCostUsd")} placeholder="0.00" />
          </Field>
          <Field label="Depo sayım tarihi" error={form.formState.errors.inventoryCountDate?.message}>
            <Input type="date" {...form.register("inventoryCountDate")} />
          </Field>
          <Field label="Sayım tarihindeki stok" error={form.formState.errors.inventoryCountStock?.message}>
            <Input type="number" min={0} {...form.register("inventoryCountStock")} placeholder="0" />
          </Field>
        </div>
      </Section>

      {/* ── Özellikler ── */}
      {allAttributes.length > 0 && (
        <Section title="Özellikler">
          <AttributePicker
            value={selectedAttributeIds}
            onChange={setSelectedAttributeIds}
            options={allAttributes}
          />
        </Section>
      )}

      {serverMessage ? (
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <span className="text-base leading-none">⚠</span> {serverMessage}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create"
              ? "Kaydediliyor..."
              : "Güncelleniyor..."
            : mode === "create"
              ? "Ürünü oluştur"
              : "Değişiklikleri kaydet"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(mode === "create" ? "/products" : `/products/${productId}`)}
        >
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      <div className="rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-5 space-y-4">
        {children}
      </div>
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
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
