"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";

import {
  createCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/category-actions";
import { categorySchema } from "@/lib/validations/category";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryFormValues } from "@/types/categories";

const emptyValues: CategoryFormValues = {
  name: "",
  slug: "",
  description: "",
  parentId: "",
};

type ParentOption = { id: string; name: string };

export function CategoryForm({
  mode,
  categoryId,
  initialValues,
  parentOptions,
}: {
  mode: "create" | "edit";
  categoryId?: string;
  initialValues?: CategoryFormValues;
  parentOptions: ParentOption[];
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: initialValues ?? emptyValues,
  });

  const nameValue = form.watch("name");

  function autoSlug() {
    const slug = nameValue
      .toLowerCase()
      .replace(/[çc]/g, "c")
      .replace(/[ğg]/g, "g")
      .replace(/[iı]/g, "i")
      .replace(/[öo]/g, "o")
      .replace(/[şs]/g, "s")
      .replace(/[üu]/g, "u")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    form.setValue("slug", slug);
  }

  const submit = form.handleSubmit((values) => {
    setServerMessage(undefined);
    setPending(true);

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCategoryAction(values)
          : await updateCategoryAction(categoryId ?? "", values);

      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);

        for (const [fieldName, errors] of Object.entries(result.fieldErrors ?? {})) {
          if (!errors?.length) continue;
          form.setError(fieldName as keyof CategoryFormValues, { message: errors[0] });
        }

        return;
      }

      router.push(result.redirectTo ?? "/categories");
      router.refresh();
    });
  });

  const availableParents = parentOptions.filter((p) => p.id !== categoryId);

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Kategori adı" error={form.formState.errors.name?.message}>
          <Input {...form.register("name")} placeholder="orn. Endüstriyel Motorlar" />
        </Field>

        <Field label="Slug" error={form.formState.errors.slug?.message}>
          <div className="flex gap-2">
            <Input
              {...form.register("slug")}
              placeholder="endustriyel-motorlar"
              className="flex-1"
            />
            <Button type="button" variant="secondary" onClick={autoSlug}>
              Otomatik
            </Button>
          </div>
        </Field>

        <Field label="Üst kategori (opsiyonel)" error={form.formState.errors.parentId?.message}>
          <select
            {...form.register("parentId")}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="">-- Yok --</option>
            {availableParents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Açıklama" error={form.formState.errors.description?.message}>
        <Textarea {...form.register("description")} placeholder="Kategori hakkında kısa açıklama" />
      </Field>

      {serverMessage ? <p className="text-sm text-red-600">{serverMessage}</p> : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create"
              ? "Kaydediliyor..."
              : "Güncelleniyor..."
            : mode === "create"
              ? "Kategori oluştur"
              : "Değişiklikleri kaydet"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(mode === "create" ? "/categories" : `/categories/${categoryId}`)}
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
