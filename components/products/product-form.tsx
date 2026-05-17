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
import { RichTextEditor } from "@/components/products/rich-text-editor";
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
  // Phase 8
  unitCostTry: "",
  sellingPriceTry: "",
  wholesalePriceTry: "",
  marketplacePriceTry: "",
  packagingCost: "",
  vatRate: "",
  paymentFeeRate: "",
  returnReserveRate: "",
  // Phase 9
  onlineSalesPotential: "",
  wholesaleSalesPotential: "",
  installerSalesPotential: "",
  // Phase 11
  xmlLocked: false,
  // Phase 11C
  weightKg: "",
  customsRatePct: "",
  shippingMethodPref: "",
  // Phase 31
  sourceCostRmb: "",
  importPaymentFeePct: "",
};

export function ProductForm({
  mode,
  productId,
  initialValues,
  categories,
  allAttributes = [],
  initialAttributeIds = [],
  users = [],
  xmlDescription,
}: {
  mode: "create" | "edit";
  productId?: string;
  initialValues?: ProductFormValues;
  categories?: CategoryOption[];
  allAttributes?: AttributeOption[];
  initialAttributeIds?: string[];
  users?: UserOption[];
  /** Phase 27: XML feed description — shown read-only with a "Editöre taşı" button */
  xmlDescription?: string | null;
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
          <Field label="Görsel URL (birincil)" error={form.formState.errors.imageUrl?.message} className="md:col-span-2">
            <Input {...form.register("imageUrl")} placeholder="https://... — çoklu görsel yönetimi için sayfanın altındaki Medya Stüdyosu'nu kullanın" />
          </Field>
          <Field label="Açıklama (yayınlanan)" error={form.formState.errors.description?.message} className="md:col-span-2">
            <RichTextEditor
              // eslint-disable-next-line react-hooks/incompatible-library
              value={form.watch("description") ?? ""}
              onChange={(html) => form.setValue("description", html, { shouldDirty: true })}
              placeholder="Ürün açıklaması — zengin metin desteklenir"
            />
          </Field>
          {/* Phase 27: XML description governance — show XML source text with opt-in copy */}
          {xmlDescription && (
            <div className="md:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                  XML Kaynak Açıklaması
                </p>
                <button
                  type="button"
                  onClick={() => form.setValue("description", xmlDescription ?? "", { shouldDirty: true })}
                  className="rounded-lg border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                >
                  ↓ Editöre taşı
                </button>
              </div>
              <p className="text-xs text-blue-800 leading-6 line-clamp-4">{xmlDescription}</p>
              <p className="text-[10px] text-blue-500">
                XML senkronizasyonu yayınlanan açıklamanın üzerine yazmaz — &quot;Editöre taşı&quot; ile açıklamayı manuel olarak kopyalayabilirsiniz.
              </p>
            </div>
          )}
        </div>
        <label className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4" {...form.register("isActive")} />
          Aktif ürün olarak listelensin
        </label>
      </Section>

      {/* ── Stok ve konum ── */}
      <Section title="Stok ve konum">
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs text-amber-700 leading-5">
          Güncel stok Entegra ERP üzerinden XML senkronizasyonu ile güncellenir. Manuel düzenleme yalnızca XML kilidi aktif ürünlerde veya XML dışı stok girişlerinde yapılmalıdır.
        </div>
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

      {/* ── Pazar yeri maliyet geçersiz kılmaları ── */}
      {/* Hidden fields: preserve existing DB values without showing duplicate inputs */}
      <input type="hidden" {...form.register("shippingCost")} />
      <input type="hidden" {...form.register("marketplaceCommission")} />
      <Section title="Pazar yeri maliyet geçersiz kılmaları">
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-700 leading-5">
          Standart platform oranları (komisyon, kargo, KDV, ödeme ücreti) için{" "}
          <a href="/admin/marketplace-policies" className="underline font-medium">Pazar Yeri Politikaları</a>{" "}
          sayfasını kullanın. Aşağıdaki alanlar yalnızca <strong>bu ürün için</strong> platfom politikasını geçersiz kılar.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Kargo maliyet geçersiz kılması (₺)" error={form.formState.errors.shippingCostOverride?.message}>
            <Input {...form.register("shippingCostOverride")} placeholder="Boş = platform politikasını kullan" />
          </Field>
          <Field label="Komisyon geçersiz kılması (%)" error={form.formState.errors.marketplaceCommissionOverride?.message}>
            <Input {...form.register("marketplaceCommissionOverride")} placeholder="Boş = platform politikasını kullan" />
          </Field>
          <Field label="Ödeme işlem ücreti geçersiz kılması (%)" error={form.formState.errors.paymentFeeRate?.message}>
            <Input {...form.register("paymentFeeRate")} placeholder="Boş = platform politikasını kullan" />
          </Field>
          <Field label="İade/kusur karşılığı geçersiz kılması (%)" error={form.formState.errors.returnReserveRate?.message}>
            <Input {...form.register("returnReserveRate")} placeholder="Boş = platform politikasını kullan" />
          </Field>
        </div>
        <p className="text-xs text-slate-400 leading-6">
          Değer girilmezse platform politikası → sistem varsayılanı sırasıyla uygulanır.
        </p>
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

      {/* ── Fiyatlandırma ve kârlılık ── */}
      <Section title="Fiyatlandırma ve kârlılık">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Birim maliyet (₺)" error={form.formState.errors.unitCostTry?.message}>
            <Input {...form.register("unitCostTry")} placeholder="0.00" />
          </Field>
          <Field label="Ambalaj maliyeti (₺)" error={form.formState.errors.packagingCost?.message}>
            <Input {...form.register("packagingCost")} placeholder="0.00" />
          </Field>
          <Field label="Perakende satış fiyatı (₺)" error={form.formState.errors.sellingPriceTry?.message}>
            <Input {...form.register("sellingPriceTry")} placeholder="0.00" />
          </Field>
          <Field label="Toptan satış fiyatı (₺)" error={form.formState.errors.wholesalePriceTry?.message}>
            <Input {...form.register("wholesalePriceTry")} placeholder="0.00" />
          </Field>
          <Field
            label="Pazar yeri genel fiyatı (₺) — temel kârlılık"
            error={form.formState.errors.marketplacePriceTry?.message}
          >
            <Input {...form.register("marketplacePriceTry")} placeholder="0.00" />
          </Field>
          <Field label="KDV oranı (%)" error={form.formState.errors.vatRate?.message}>
            <Input {...form.register("vatRate")} placeholder="20" />
          </Field>
        </div>
        <p className="text-xs text-slate-400 leading-6">
          <strong>Pazar yeri genel fiyatı</strong> temel kârlılık hesabı içindir.
          Platform bazlı hassas fiyatlar XML beslemesinden ve listeleme düzeyindeki manuel geçersiz kılmalardan gelir —
          &quot;Pazar Yeri Fiyatlandırması&quot; kartında ürün detayında görülür.
        </p>
      </Section>

      {/* ── Satış potansiyeli ── */}
      <Section title="Satış potansiyeli">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Online/pazar yeri (adet/ay)" error={form.formState.errors.onlineSalesPotential?.message}>
            <Input type="number" min={0} {...form.register("onlineSalesPotential")} placeholder="0" />
          </Field>
          <Field label="Toptan (adet/ay)" error={form.formState.errors.wholesaleSalesPotential?.message}>
            <Input type="number" min={0} {...form.register("wholesaleSalesPotential")} placeholder="0" />
          </Field>
          <Field label="Montör/kurumsal (adet/ay)" error={form.formState.errors.installerSalesPotential?.message}>
            <Input type="number" min={0} {...form.register("installerSalesPotential")} placeholder="0" />
          </Field>
        </div>
        <p className="text-xs text-slate-400 leading-6">
          Aylık satış tahmini kanal bazında girilir. Bu değerler yatırım skoru ve SATIN AL / ALMA sinyali için kullanılır.
        </p>
      </Section>

      {/* ── İthalat Kararı Girdileri ── */}
      <Section title="İthalat kararı girdileri">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Ağırlık (kg)" error={form.formState.errors.weightKg?.message}>
            <Input {...form.register("weightKg")} placeholder="1.5" />
          </Field>
          <Field label="Gümrük oranı (%)" error={form.formState.errors.customsRatePct?.message}>
            <Input {...form.register("customsRatePct")} placeholder="20" />
          </Field>
          <Field label="Tercih edilen kargo yöntemi" error={form.formState.errors.shippingMethodPref?.message}>
            <select {...form.register("shippingMethodPref")} className={selectCls}>
              <option value="">-- Sistem karar versin --</option>
              <option value="AIR">Hava yolu (AIR)</option>
              <option value="SEA">Deniz yolu (SEA)</option>
            </select>
          </Field>
        </div>
        {/* Phase 31 — RMB-first import economics */}
        <div className="grid gap-4 md:grid-cols-2 mt-4 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-3">RMB kaynaklı ithalat (opsiyonel)</p>
            <Field label="Kaynak maliyet (RMB/CNY)" error={form.formState.errors.sourceCostRmb?.message}>
              <Input {...form.register("sourceCostRmb")} placeholder="ör. 85.00" />
            </Field>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-3">&nbsp;</p>
            <Field label="Ödeme komisyonu (%)" error={form.formState.errors.importPaymentFeePct?.message}>
              <Input {...form.register("importPaymentFeePct")} placeholder="ör. 3.0" />
            </Field>
          </div>
        </div>
        <p className="text-xs text-slate-400 leading-6">
          İthalat karar motoru: hava/deniz kargo maliyeti, gümrük ve kârlılık hesabı yaparak en uygun yöntemi önerir.
          RMB maliyet girilirse formül: <code className="font-mono">(RMB ÷ RMB/USD) × (1 + komisyon%) + kargo × ağırlık) × (1 + gümrük%)</code>.
          RMB yoksa &quot;İthalat ve envanter&quot; bölümündeki USD maliyeti kullanılır.
        </p>
      </Section>

      {/* ── XML Senkronizasyon ── */}
      <Section title="XML senkronizasyon">
        <label className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <input type="checkbox" className="h-4 w-4" {...form.register("xmlLocked")} />
          <span>
            <span className="font-semibold">XML kilidi aktif</span> — XML senkronizasyonu bu ürünün stoğunu ve fiyatını güncelleyemez
          </span>
        </label>
        <p className="text-xs text-slate-400 leading-6">
          Bu seçenek işaretlendiğinde, otomatik XML senkronizasyonu bu ürünü atlar. Manuel girilen değerler korunur.
        </p>
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
