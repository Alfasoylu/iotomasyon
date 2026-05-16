"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useState, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  products: Array<{ id: string; name: string; sku: string; sellingPriceTry?: number | null }>;
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
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Teklif ayarları
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-slate-950">
                  {isEdit ? "Teklifi düzenle" : "Profesyonel teklif oluştur"}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                  Kur, KDV, geçerlilik ve satır detaylarını tek ekranda düzenleyin.
                  Oluşturulan teklif PDF ve WhatsApp akışında aynı para gösterim mantığını kullanır.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Müşteri
                </p>
                <p className="mt-2 font-semibold text-slate-900">
                  {customerName ?? "Seçili müşteri"}
                </p>
                <p>{customerCompany || "Firma bilgisi eklenmemiş"}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Para birimi görünümü">
                <select
                  {...form.register("currencyMode")}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                >
                  <option value="USD">Sadece USD</option>
                  <option value="TRY">Sadece TL</option>
                  <option value="BOTH">USD + TL</option>
                </select>
              </Field>

              {currencyMode === "TRY" || currencyMode === "BOTH" ? (
                <Field label="Kur bilgisi">
                  <Input {...form.register("exchangeRate")} placeholder="1 USD = kaç TL" />
                </Field>
              ) : null}

              <Field label="Geçerlilik tarihi">
                <Input type="date" {...form.register("validityDate")} />
              </Field>

              <Field label="KDV varsayılanı">
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900">
                  %{DEFAULT_QUOTE_TAX_RATE}
                </div>
              </Field>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Satır editörü
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">Teklif kalemleri</h3>
                </div>
                {templates && templates.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
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
                      Şablondan Yükle
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 px-6 py-6">
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
                  <div
                    key={field.id}
                    className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5"
                  >
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Kalem {index + 1}</p>
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                          Satır toplamı {rowDisplay}
                        </p>
                      </div>

                      {items.fields.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto px-0 text-red-600 hover:bg-transparent hover:text-red-500"
                          onClick={() => items.remove(index)}
                        >
                          Kalemi kaldır
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                      <Field label="Ürün">
                        {(() => {
                          const { onChange: rhfOnChange, ...restReg } = form.register(`items.${index}.productId`);
                          return (
                            <select
                              {...restReg}
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                              onChange={(e) => {
                                rhfOnChange(e);
                                const pid = e.target.value;
                                if (pid) {
                                  const p = products.find((pr) => pr.id === pid);
                                  if (p) {
                                    if (!form.getValues(`items.${index}.description`)) {
                                      form.setValue(`items.${index}.description`, p.name);
                                    }
                                    if (p.sellingPriceTry != null && p.sellingPriceTry > 0) {
                                      form.setValue(`items.${index}.unitPrice`, String(p.sellingPriceTry));
                                      form.setValue(`items.${index}.currency`, "TRY");
                                    }
                                  }
                                }
                              }}
                            >
                              <option value="">Ürün bağlama (opsiyonel)</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} ({product.sku})
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                      </Field>

                      <Field label="Açıklama" className="xl:col-span-3">
                        <Input
                          {...form.register(`items.${index}.description`)}
                          placeholder="Teklifte görünecek açıklama"
                        />
                      </Field>

                      <Field label="Adet">
                        <Input
                          type="number"
                          min={1}
                          {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                        />
                      </Field>

                      <Field label="Birim fiyat">
                        <Input {...form.register(`items.${index}.unitPrice`)} placeholder="0,00" />
                      </Field>

                      <Field label="Para birimi">
                        <select
                          {...form.register(`items.${index}.currency`)}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                        >
                          <option value="TRY">TRY ₺</option>
                          <option value="USD">USD $</option>
                        </select>
                      </Field>

                      <Field label="İndirim">
                        <Input {...form.register(`items.${index}.discount`)} placeholder="0" />
                      </Field>

                      <Field label="KDV %">
                        <Input
                          {...form.register(`items.${index}.tax`)}
                          placeholder={String(DEFAULT_QUOTE_TAX_RATE)}
                        />
                      </Field>

                      <Field label="Satır özeti" className="xl:col-span-3">
                        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
                          <MiniMetric
                            label="Ara toplam"
                            value={formatCurrencyAmount(line.subtotal, current.currency || "TRY")}
                          />
                          <MiniMetric
                            label="İndirim"
                            value={formatCurrencyAmount(line.discount, current.currency || "TRY")}
                          />
                          <MiniMetric
                            label="KDV"
                            value={formatCurrencyAmount(line.taxAmount, current.currency || "TRY")}
                          />
                          <MiniMetric label="Genel toplam" value={rowDisplay} strong />
                        </div>
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 px-6 py-5">
              <Button type="button" variant="secondary" onClick={() => items.append({ ...emptyItem })}>
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
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Ticari Koşullar
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Bu teklife özel koşullar</h3>
            <p className="mt-1 text-sm text-slate-500">
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
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Toplam özeti
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Teklif genel görünümü</h3>

            <dl className="mt-6 space-y-4">
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
            </dl>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
              Yeni satırlarda varsayılan KDV oranı %{DEFAULT_QUOTE_TAX_RATE} olarak gelir.
              Gerekirse satır bazında 0 veya farklı bir oran girebilirsiniz.
            </div>

            {serverMessage ? <p className="mt-4 text-sm text-red-600">{serverMessage}</p> : null}

            <Button type="submit" disabled={pending} className="mt-6 w-full">
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
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
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
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd
        className={`text-right text-sm ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className={`mt-2 text-sm ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}>
        {value}
      </p>
    </div>
  );
}
