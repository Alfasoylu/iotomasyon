"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createListingAction,
  updateListingAction,
  deleteListingAction,
  type ListingFormValues,
} from "@/lib/actions/marketplace-listing-actions";

const PLATFORMS = [
  { value: "TRENDYOL",   label: "Trendyol" },
  { value: "HEPSIBURADA", label: "Hepsiburada" },
  { value: "N11",        label: "N11" },
  { value: "PTTAVM",     label: "PTT AVM" },
  { value: "KOCTAS",     label: "Koçtaş" },
  { value: "TEKNOSA",    label: "Teknosa" },
  { value: "TEMU",       label: "Temu" },
  { value: "CUSTOM",     label: "Diğer / Özel" },
];

const STATUSES = [
  { value: "UNKNOWN",   label: "Bilinmiyor" },
  { value: "ACTIVE",    label: "Aktif" },
  { value: "INACTIVE",  label: "Pasif" },
  { value: "SUSPENDED", label: "Askıya alındı" },
];

type Product = { id: string; sku: string; name: string };
type UserOption = { id: string; name: string };

const emptyValues: ListingFormValues = {
  productId: "",
  platform: "TRENDYOL",
  platformListingId: "",
  listingUrl: "",
  listingBarcode: "",
  listingSku: "",
  listingTitle: "",
  status: "UNKNOWN",
  notes: "",
  responsibleId: "",
};

export function ListingForm({
  mode,
  listingId,
  initialValues,
  products,
  users,
}: {
  mode: "create" | "edit";
  listingId?: string;
  initialValues?: ListingFormValues;
  products: Product[];
  users: UserOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<ListingFormValues>(initialValues ?? emptyValues);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  function set<K extends keyof ListingFormValues>(key: K, val: ListingFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage(undefined);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createListingAction(values)
          : await updateListingAction(listingId ?? "", values);
      setPending(false);
      if (!result.ok) {
        setMessage(result.message);
      } else if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!listingId) return;
    if (!confirm("Bu listelemeyi silmek istediğinizden emin misiniz?")) return;
    setPending(true);
    startTransition(async () => {
      const result = await deleteListingAction(listingId);
      setPending(false);
      if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  const selectCls = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      <Section title="Temel bilgiler">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Ürün *">
            <select value={values.productId} onChange={(e) => set("productId", e.target.value)} className={selectCls} required>
              <option value="">-- Ürün seçin --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Platform *">
            <select value={values.platform} onChange={(e) => set("platform", e.target.value as ListingFormValues["platform"])} className={selectCls}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Durum">
            <select value={values.status} onChange={(e) => set("status", e.target.value as ListingFormValues["status"])} className={selectCls}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Sorumlu personel">
            <select value={values.responsibleId} onChange={(e) => set("responsibleId", e.target.value)} className={selectCls}>
              <option value="">-- Seçin --</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Platform detayları">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Platform listeleme ID">
            <Input value={values.platformListingId} onChange={(e) => set("platformListingId", e.target.value)} placeholder="123456789" className="font-mono" />
          </Field>
          <Field label="Listeleme SKU">
            <Input value={values.listingSku} onChange={(e) => set("listingSku", e.target.value)} placeholder="Platform SKU kodu" className="font-mono" />
          </Field>
          <Field label="Listeleme barkod">
            <Input value={values.listingBarcode} onChange={(e) => set("listingBarcode", e.target.value)} placeholder="8681234567890" className="font-mono" />
          </Field>
          <Field label="Listeleme başlığı" className="md:col-span-2">
            <Input value={values.listingTitle} onChange={(e) => set("listingTitle", e.target.value)} placeholder="Platformdaki ürün başlığı" />
          </Field>
          <Field label="Listeleme URL" className="md:col-span-2">
            <Input value={values.listingUrl} onChange={(e) => set("listingUrl", e.target.value)} placeholder="https://www.trendyol.com/..." />
          </Field>
          <Field label="Notlar" className="md:col-span-2">
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Listelemeyle ilgili notlar..." />
          </Field>
        </div>
      </Section>

      {message && (
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <span className="text-base leading-none">⚠</span> {message}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (mode === "create" ? "Kaydediliyor..." : "Güncelleniyor...") : (mode === "create" ? "Listeleme oluştur" : "Değişiklikleri kaydet")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push(mode === "create" ? "/marketplace" : `/marketplace/${listingId}`)}>
          Vazgeç
        </Button>
        {mode === "edit" && (
          <Button type="button" variant="secondary" onClick={handleDelete} disabled={pending}>
            Listelemeyi sil
          </Button>
        )}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      <div className="rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}
