"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useState, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProductCombobox } from "@/components/quotes/product-combobox";
import { createQuoteAction, updateQuoteAction } from "@/lib/actions/quote-actions";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import {
  calculateQuoteLine,
  calculateQuoteTotals,
  DEFAULT_QUOTE_TAX_RATE,
  formatCurrencyAmount,
  formatDisplayPair,
  formatQuoteCurrencyMode,
  normalizeDecimalInput,
  resolveDisplayAmounts,
} from "@/lib/quote-utils";
import { quoteSchema } from "@/lib/validations/quote";
import type { QuoteCurrencyMode, QuoteFormValues } from "@/types/quotes";

const emptyItem = {
  productId: "",
  description: "",
  quantity: 1,
  unitPrice: "",
  currency: "TRY",
  discount: "0",
  tax: String(DEFAULT_QUOTE_TAX_RATE),
};

type TemplateItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  discount: number;
  tax: number;
  productId?: string | null;
};

type TemplateOption = {
  id: string;
  name: string;
  description?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  warrantyTerms?: string | null;
  notes?: string | null;
  items: TemplateItem[];
};

const selectCls =
  "h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] disabled:opacity-50";

export function QuoteForm({
  customerId,
  customerName,
  customerCompany,
  products,
  templates,
  quoteId,
  initialValues,
}: {
  customerId: string;
  customerName?: string;
  customerCompany?: string | null;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    brand?: string | null;
    stockQuantity?: number | null;
    sellingPriceTry?: number | null;
  }>;
  templates?: TemplateOption[];
  quoteId?: string;
  initialValues?: Partial<QuoteFormValues>;
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      notes: "",
      validityDate: "",
      currencyMode: "TRY",
      exchangeRate: "",
      paymentTerms: COMPANY_SETTINGS.paymentTerms,
      deliveryTerms: COMPANY_SETTINGS.deliveryTerms,
      warrantyTerms: COMPANY_SETTINGS.warrantyTerms,
      items: [{ ...emptyItem }],
      ...initialValues,
    },
  });

  const currencyMode = useWatch({
    control: form.control,
    name: "currencyMode",
  }) as QuoteCurrencyMode;

  const exchangeRateValue = useWatch({
    control: form.control,
    name: "exchangeRate",
  });

  const watchedItems =
    useWatch({
      control: form.control,
      name: "items",
    }) ?? [];

  const items = useFieldArray({
    control: form.control,
    name: "items",
  });

  const exchangeRate = normalizeDecimalInput(exchangeRateValue);
  const baseCurrency = watchedItems[0]?.currency || "TRY";
  const totals = calculateQuoteTotals(
    watchedItems.map((item) => ({
      quantity: item?.quantity ?? 1,
      unitPrice: item?.unitPrice ?? "0",
      discount: item?.discount ?? "0",
      tax: item?.tax ?? String(DEFAULT_QUOTE_TAX_RATE),
    })),
  );

  const isEdit = Boolean(quoteId);

  function loadTemplate(templateId: string) {
    const tpl = templates?.find((t) => t.id === templateId);
    if (!tpl) return;
    if (tpl.paymentTerms) form.setValue("paymentTerms", tpl.paymentTerms);
    if (tpl.deliveryTerms) form.setValue("deliveryTerms", tpl.deliveryTerms);
    if (tpl.warrantyTerms) form.setValue("warrantyTerms", tpl.warrantyTerms);
    if (tpl.notes) form.setValue("notes", tpl.notes);
    if (tpl.items.length > 0) {
      const newItems = tpl.items.map((item) => ({
        productId: item.productId ?? "",
        description: item.description,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        currency: item.currency,
        discount: String(item.discount),
        tax: String(item.tax),
      }));
      form.setValue("items", newItems);
    }
    setSelectedTemplateId("");
  }

  const submit = form.handleSubmit((values) => {
    setPending(true);
    setServerMessage(undefined);

    startTransition(async () => {
      const result = isEdit
        ? await updateQuoteAction(quoteId!, values)
        : await createQuoteAction(customerId, values);
      setPending(false);

      if (!result.ok) {
        setServerMessage(result.message);
        return;
      }

      router.push(result.redirectTo ?? `/customers/${customerId}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  Teklif ayarları
                </p>
                <h3 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
                  {isEdit ? "Teklifi düzenle" : "Profesyonel teklif oluştur"}
                </h3>
                <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
                  Kur, KDV, geçerlilik ve satır detaylarını tek ekranda düzenleyin.
                  Oluşturulan teklif PDF ve WhatsApp akışında aynı para gösterim mantığını kullanır.
                </p>
              </div>

              <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-4 py-3 text-[13px] text-[var(--text-secondary)]">
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  Müşteri
                </p>
                <p className="mt-1.5 font-semibold text-[var(--text-primary)]">
                  {customerName ?? "Seçili müşteri"}
                </p>
                <p className="text-[var(--text-muted)]">{customerCompany || "Firma bilgisi eklenmemiş"}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Para birimi görünümü">
                <select {...form.register("currencyMode")} className={selectCls}>
                  <option value="USD">Sadece USD</option>
                  <option value="TRY">Sadece TL</option>
                  <option value="BOTH">USD + TL</option>
                </select>
              </Field>

              {currencyMode === "TRY" || currencyMode === "BOTH" ? (
                <Field label="Kur bilgisi">
                  <Input className="tabular-nums font-mono" {...form.register("exchangeRate")} placeholder="1 USD = kaç TL" />
                </Field>
              ) : null}

              <Field label="Geçerlilik tarihi">
                <Input type="date" {...form.register("validityDate")} />
              </Field>

              <Field label="KDV varsayılanı">
                <div className="flex h-10 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[13px] font-semibold tabular-nums text-[var(--text-primary)]">
                  %{DEFAULT_QUOTE_TAX_RATE}
                </div>
              </Field>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border-subtle)] px-6 py-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Satır editörü
                  </p>
                  <h3 className="mt-1 text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">Teklif kalemleri</h3>
                </div>
                {templates && templates.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="h-9 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[12px] text-[var(--text-secondary)] outline-none focus:border-[var(--accent-border)]"
                    >
                      <option value="">— Şablon seç —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!selectedTemplateId}
                      onClick={() => loadTemplate(selectedTemplateId)}
                    >
                      Şablondan yükle
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Line items table */}
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Ürün / Açıklama</th>
                    <th className="px-4 py-3 text-right">Adet</th>
                    <th className="px-4 py-3 text-right">Birim Fiyat</th>
                    <th className="px-4 py-3 text-left">Pb</th>
                    <th className="px-4 py-3 text-right">İndirim</th>
                    <th className="px-4 py-3 text-right">KDV %</th>
                    <th className="px-4 py-3 text-right">Toplam</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.fields.map((field, index) => {
                    const current = watchedItems[index] ?? emptyItem;
                    const line = calculateQuoteLine(
                      current.quantity ?? 1,
                      current.unitPrice ?? "0",
                      current.discount ?? "0",
                      current.tax ?? String(DEFAULT_QUOTE_TAX_RATE),
                    );
                    const rowDisplay = formatDisplayPair(
                      resolveDisplayAmounts(
                        line.total,
                        current.currency || "TRY",
                        currencyMode,
                        exchangeRate || null,
                      ),
                    );

                    return (
                      <tr
                        key={field.id}
                        className="border-b border-[var(--border-subtle)] align-top"
                      >
                        <td className="px-4 py-3 text-[var(--text-muted)] tabular-nums font-mono">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-2">
                            <ProductCombobox
                              value={form.watch(`items.${index}.productId`) ?? ""}
                              products={products}
                              onChange={(pid, product) => {
                                form.setValue(`items.${index}.productId`, pid, { shouldDirty: true });
                                if (product) {
                                  // Sadece açıklama boşsa otomatik doldur (kullanıcı override'ı korunur)
                                  if (!form.getValues(`items.${index}.description`)?.trim()) {
                                    form.setValue(`items.${index}.description`, product.name, { shouldDirty: true });
                                  }
                                  if (product.sellingPriceTry != null && product.sellingPriceTry > 0) {
                                    form.setValue(`items.${index}.unitPrice`, String(product.sellingPriceTry), { shouldDirty: true });
                                    form.setValue(`items.${index}.currency`, "TRY", { shouldDirty: true });
                                  }
                                }
                              }}
                            />
                            <Input
                              {...form.register(`items.${index}.description`)}
                              placeholder="Teklifte görünecek açıklama (ürün seçince otomatik dolar)"
                              className="text-[12px]"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Input
                            type="number"
                            min={1}
                            className="tabular-nums font-mono text-right"
                            {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Input
                            {...form.register(`items.${index}.unitPrice`)}
                            placeholder="0,00"
                            className="tabular-nums font-mono text-right"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            {...form.register(`items.${index}.currency`)}
                            className={selectCls}
                          >
                            <option value="TRY">TRY</option>
                            <option value="USD">USD</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Input
                            {...form.register(`items.${index}.discount`)}
                            placeholder="0"
                            className="tabular-nums font-mono text-right"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Input
                            {...form.register(`items.${index}.tax`)}
                            placeholder={String(DEFAULT_QUOTE_TAX_RATE)}
                            className="tabular-nums font-mono text-right"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="space-y-0.5 text-right">
                            <p className="text-[13px] font-semibold tabular-nums font-mono text-[var(--text-primary)]">
                              {rowDisplay}
                            </p>
                            <p className="text-[10px] tabular-nums font-mono text-[var(--text-muted)]">
                              ara {formatCurrencyAmount(line.subtotal, current.currency || "TRY")}
                            </p>
                            <p className="text-[10px] tabular-nums font-mono text-[var(--text-muted)]">
                              kdv {formatCurrencyAmount(line.taxAmount, current.currency || "TRY")}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {items.fields.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => items.remove(index)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[var(--text-muted)] transition hover:border-[var(--danger-border)] hover:bg-[var(--danger-dim)] hover:text-[var(--danger)]"
                              aria-label="Kalemi kaldır"
                            >
                              <Trash2 size={14} strokeWidth={1.5} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-[var(--border-subtle)] px-6 py-4">
              <Button type="button" variant="secondary" onClick={() => items.append({ ...emptyItem })}>
                <Plus size={14} strokeWidth={1.5} />
                Yeni kalem ekle
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <Field label="Teklif notu">
              <Textarea
                {...form.register("notes")}
                className="min-h-32"
                placeholder="Ödeme, teslimat, kapsam veya ek açıklamaları yazın."
              />
            </Field>
          </Card>

          <Card className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Ticari koşullar
            </p>
            <h3 className="mt-1 text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
              Bu teklife özel koşullar
            </h3>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              Boş bırakılırsa varsayılan şirket koşulları kullanılır.
            </p>
            <div className="mt-5 space-y-4">
              <Field label="Ödeme koşulu">
                <Textarea
                  {...form.register("paymentTerms")}
                  className="min-h-[60px] resize-none"
                  placeholder={COMPANY_SETTINGS.paymentTerms}
                />
              </Field>
              <Field label="Teslimat koşulu">
                <Textarea
                  {...form.register("deliveryTerms")}
                  className="min-h-[60px] resize-none"
                  placeholder={COMPANY_SETTINGS.deliveryTerms}
                />
              </Field>
              <Field label="Garanti koşulu">
                <Textarea
                  {...form.register("warrantyTerms")}
                  className="min-h-[60px] resize-none"
                  placeholder={COMPANY_SETTINGS.warrantyTerms}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Toplam özeti
            </p>
            <h3 className="mt-1 text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
              Teklif genel görünümü
            </h3>

            <dl className="mt-5 space-y-3">
              <SummaryRow label="Görünüm modu" value={formatQuoteCurrencyMode(currencyMode)} />
              {(currencyMode === "TRY" || currencyMode === "BOTH") && exchangeRate > 0 ? (
                <SummaryRow
                  label="Kur"
                  value={`1 USD = ${exchangeRate.toLocaleString("tr-TR")} TL`}
                />
              ) : null}
              <SummaryRow
                label="Ara toplam"
                value={formatDisplayPair(
                  resolveDisplayAmounts(
                    totals.subtotal,
                    baseCurrency,
                    currencyMode,
                    exchangeRate || null,
                  ),
                )}
              />
              <SummaryRow
                label="İndirim"
                value={formatDisplayPair(
                  resolveDisplayAmounts(
                    totals.discountTotal,
                    baseCurrency,
                    currencyMode,
                    exchangeRate || null,
                  ),
                )}
              />
              <SummaryRow
                label="KDV"
                value={formatDisplayPair(
                  resolveDisplayAmounts(
                    totals.taxTotal,
                    baseCurrency,
                    currencyMode,
                    exchangeRate || null,
                  ),
                )}
              />
              <div className="border-t border-[var(--border-subtle)] pt-3">
                <SummaryRow
                  label="Genel toplam"
                  value={formatDisplayPair(
                    resolveDisplayAmounts(
                      totals.total,
                      baseCurrency,
                      currencyMode,
                      exchangeRate || null,
                    ),
                  )}
                  strong
                />
              </div>
            </dl>

            <div className="mt-5 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] p-3 text-[12px] leading-6 text-[var(--text-secondary)]">
              Yeni satırlarda varsayılan KDV oranı %{DEFAULT_QUOTE_TAX_RATE} olarak gelir.
              Gerekirse satır bazında 0 veya farklı bir oran girebilirsiniz.
            </div>

            {serverMessage ? (
              <p className="mt-4 text-[13px] text-[var(--danger)]">{serverMessage}</p>
            ) : null}

            <Button type="submit" disabled={pending} className="mt-5 w-full">
              {pending
                ? isEdit ? "Kaydediliyor..." : "Teklif hazırlanıyor..."
                : isEdit ? "Değişiklikleri kaydet" : "Teklifi oluştur"}
            </Button>
          </Card>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">{label}</dt>
      <dd
        className={`text-right text-[13px] tabular-nums font-mono ${
          strong
            ? "font-semibold text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
