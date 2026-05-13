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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProductFormValues } from "@/types/products";

const emptyValues: ProductFormValues = {
  sku: "",
  name: "",
  category: "",
  brand: "",
  model: "",
  stockQuantity: 0,
  minimumStock: 0,
  location: "",
  description: "",
  isActive: true,
};

export function ProductForm({
  mode,
  productId,
  initialValues,
}: {
  mode: "create" | "edit";
  productId?: string;
  initialValues?: ProductFormValues;
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);

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
          ? await createProductAction(values)
          : await updateProductAction(productId ?? "", values);

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

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="SKU" error={form.formState.errors.sku?.message}>
          <Input {...form.register("sku")} />
        </Field>
        <Field label="Urun adi" error={form.formState.errors.name?.message}>
          <Input {...form.register("name")} />
        </Field>
        <Field label="Kategori" error={form.formState.errors.category?.message}>
          <Input {...form.register("category")} />
        </Field>
        <Field label="Marka" error={form.formState.errors.brand?.message}>
          <Input {...form.register("brand")} />
        </Field>
        <Field label="Model" error={form.formState.errors.model?.message}>
          <Input {...form.register("model")} />
        </Field>
        <Field label="Lokasyon" error={form.formState.errors.location?.message}>
          <Input {...form.register("location")} placeholder="Raf / kutu / bin" />
        </Field>
        <Field label="Stok" error={form.formState.errors.stockQuantity?.message}>
          <Input type="number" min={0} {...form.register("stockQuantity", { valueAsNumber: true })} />
        </Field>
        <Field label="Minimum stok" error={form.formState.errors.minimumStock?.message}>
          <Input type="number" min={0} {...form.register("minimumStock", { valueAsNumber: true })} />
        </Field>
      </div>

      <Field label="Aciklama" error={form.formState.errors.description?.message}>
        <Textarea {...form.register("description")} />
      </Field>

      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4" {...form.register("isActive")} />
        Aktif urun olarak listelensin
      </label>

      {serverMessage ? <p className="text-sm text-red-600">{serverMessage}</p> : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create"
              ? "Kaydediliyor..."
              : "Guncelleniyor..."
            : mode === "create"
              ? "Urunu olustur"
              : "Degisiklikleri kaydet"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(mode === "create" ? "/products" : `/products/${productId}`)}
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
