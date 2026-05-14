"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useState, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createQuoteAction } from "@/lib/actions/quote-actions";
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

export function QuoteForm({
  customerId,
  customerName,
  customerCompany,
  products,
}: {
  customerId: string;
  customerName?: string;
  customerCompany?: string | null;
  products: Array<{ id: string; name: string; sku: string }>;
}) {
  const router = useRouter();
  const [serverMessage, setServerMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      notes: "",
      validityDate: "",
      currencyMode: "TRY",
      exchangeRate: "",
      items: [{ ...emptyItem }],
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

  const submit = form.handleSubmit((values) => {
    setPending(true);
    setServerMessage(undefined);

    startTransition(async () => {
      const result = await createQuoteAction(customerId, values);
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_320px]">
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Teklif Ayarları
              </p>
              <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-slate-950">
                    Premium teklif oluştur
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                    Döviz görünümü, kur, geçerlilik ve KDV yapısını tek ekranda yönetin.
                    Oluşturulan teklif detail, PDF ve WhatsApp akışında aynı ticari toplamları kullanır.
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
                    Varsayılan KDV
                  </p>
                  <p className="mt-2 text-xl font-semibold">%{DEFAULT_QUOTE_TAX_RATE}</p>
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

                <Field label="Varsayılan KDV">
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900">
                    %{DEFAULT_QUOTE_TAX_RATE}
                  </div>
                </Field>
              </div>
            </Card>

            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Müşteri
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                Teklif alıcısı
              </h3>
              <div className="mt-5 space-y-4">
                <PreviewMetric label="Müşteri adı" value={customerName ?? "Seçili müşteri"} />
                <PreviewMetric
                  label="Firma"
                  value={customerCompany || "Firma bilgisi eklenmemiş"}
                />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                  Teklif oluşturulduktan sonra bu müşteri için detail, PDF ve WhatsApp gönderim akışı
                  hazır olur.
                </div>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Satır editörü
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">Teklif kalemleri</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    Masaüstünde daha yatay, mobilde ise kart düzeninde okunaklı bir teklif çalışma alanı.
                  </p>
                </div>

                <Button type="button" variant="secondary" onClick={() => items.append({ ...emptyItem })}>
                  Yeni kalem ekle
                </Button>
              </div>
            </div>

            <div className="hidden border-b border-slate-200 bg-slate-50 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 xl:grid xl:grid-cols-[1.4fr_2fr_80px_130px_110px_110px_90px_140px] xl:gap-4">
              <span>Ürün</span>
              <span>Açıklama</span>
              <span>Adet</span>
              <span>Birim fiyat</span>
              <span>Para birimi</span>
              <span>İndirim</span>
              <span>KDV %</span>
              <span>Satır toplamı</span>
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
                    className="rounded-3xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Kalem {index + 1}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                          Satır toplamı {rowDisplay}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto px-0 text-slate-500 hover:bg-transparent hover:text-slate-900"
                          onClick={() => items.append({ ...form.getValues(`items.${index}`) })}
                        >
                          Çoğalt
                        </Button>
                        {items.fields.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto px-0 text-red-600 hover:bg-transparent hover:text-red-500"
                            onClick={() => items.remove(index)}
                          >
                            Kaldır
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4 p-5 xl:grid xl:grid-cols-[1.4fr_2fr_80px_130px_110px_110px_90px_140px] xl:gap-4 xl:space-y-0">
                      <Field label="Ürün" compact>
                        <select
                          {...form.register(`items.${index}.productId`)}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                        >
                          <option value="">Ürün bağlama (opsiyonel)</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} ({product.sku})
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Açıklama" compact>
                        <Input
                          {...form.register(`items.${index}.description`)}
                          placeholder="Teklifte görünecek açıklama"
                        />
                      </Field>

                      <Field label="Adet" compact>
                        <Input
                          type="number"
                          min={1}
                          {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                        />
                      </Field>

                      <Field label="Birim fiyat" compact>
                        <Input {...form.register(`items.${index}.unitPrice`)} placeholder="0,00" />
                      </Field>

                      <Field label="Para birimi" compact>
                        <Input
                          {...form.register(`items.${index}.currency`)}
                          placeholder="TRY veya USD"
                        />
                      </Field>

                      <Field label="İndirim" compact>
                        <Input {...form.register(`items.${index}.discount`)} placeholder="0" />
                      </Field>

                      <Field label="KDV %" compact>
                        <Input
                          {...form.register(`items.${index}.tax`)}
                          placeholder={String(DEFAULT_QUOTE_TAX_RATE)}
                        />
                      </Field>

                      <Field label="Satır toplamı" compact>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-950">
                          {rowDisplay}
                        </div>
                      </Field>
                    </div>

                    <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                      <div className="grid gap-3 md:grid-cols-4">
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
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Notlar ve şartlar
            </p>
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <Field label="Teklif notu">
                <Textarea
                  {...form.register("notes")}
                  className="min-h-36"
                  placeholder="Ödeme, teslimat, kapsam veya ek açıklamaları yazın."
                />
              </Field>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Ticari Koşullar (Varsayılan)
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-700">Ödeme</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {COMPANY_SETTINGS.paymentTerms}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">Teslimat</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {COMPANY_SETTINGS.deliveryTerms}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">Garanti</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {COMPANY_SETTINGS.warrantyTerms}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Toplam özeti
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Teklif görünümü</h3>

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
                  resolveDisplayAmounts(totals.subtotal, baseCurrency, currencyMode, exchangeRate || null),
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
                  resolveDisplayAmounts(totals.taxTotal, baseCurrency, currencyMode, exchangeRate || null),
                )}
              />
            </dl>

            <div className="mt-6 rounded-3xl bg-slate-950 p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                Genel toplam
              </p>
              <p className="mt-3 text-3xl font-semibold">
                {formatDisplayPair(
                  resolveDisplayAmounts(totals.total, baseCurrency, currencyMode, exchangeRate || null),
                )}
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
              Yeni satırlarda varsayılan KDV oranı %{DEFAULT_QUOTE_TAX_RATE} olarak gelir.
              Gerekirse satır bazında 0 veya farklı bir oran girebilirsiniz.
            </div>

            {serverMessage ? <p className="mt-4 text-sm text-red-600">{serverMessage}</p> : null}
          </Card>

          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Son adım
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">
              Teklifi hazırla ve müşteriye aç
            </h3>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Teklif oluşturulduktan sonra PDF indir, WhatsApp paylaş ve durum takibi akışı aktif olur.
            </p>

            <Button type="submit" disabled={pending} className="mt-6 h-12 w-full text-base">
              {pending ? "Teklif hazırlanıyor..." : "Teklifi oluştur"}
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
  compact = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span
        className={`block font-semibold uppercase tracking-[0.25em] text-slate-500 ${
          compact ? "mb-2 text-[11px] xl:sr-only" : "mb-1.5 text-xs"
        }`}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="text-right text-sm text-slate-700">{value}</dd>
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

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
