"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  createQuoteTemplateAction,
  deleteQuoteTemplateAction,
  type QuoteTemplateFormValues,
} from "@/lib/actions/quote-template-actions";

interface Product {
  id: string;
  name: string;
  sku: string;
  sellingPriceTry?: number | null;
}

interface ItemDraft {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  currency: string;
  discount: string;
  tax: string;
}

const emptyItem = (): ItemDraft => ({
  productId: "",
  description: "",
  quantity: 1,
  unitPrice: "",
  currency: "TRY",
  discount: "0",
  tax: "20",
});

interface Props {
  products: Product[];
  defaultPaymentTerms?: string;
  defaultDeliveryTerms?: string;
  defaultWarrantyTerms?: string;
}

export function QuoteTemplateForm({ products, defaultPaymentTerms = "", defaultDeliveryTerms = "", defaultWarrantyTerms = "" }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(defaultPaymentTerms);
  const [deliveryTerms, setDeliveryTerms] = useState(defaultDeliveryTerms);
  const [warrantyTerms, setWarrantyTerms] = useState(defaultWarrantyTerms);
  const [currencyMode, setCurrencyMode] = useState<"TRY" | "USD" | "BOTH">("TRY");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleProductChange(index: number, productId: string) {
    const updated = [...items];
    updated[index].productId = productId;
    if (productId) {
      const p = products.find((pr) => pr.id === productId);
      if (p) {
        if (!updated[index].description) {
          updated[index].description = p.name;
        }
        if (p.sellingPriceTry != null && p.sellingPriceTry > 0) {
          updated[index].unitPrice = String(p.sellingPriceTry);
          updated[index].currency = "TRY";
        }
      }
    }
    setItems(updated);
  }

  function updateItem(index: number, field: keyof ItemDraft, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  function addItem() {
    setItems([...items, emptyItem()]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    if (!name.trim()) {
      setResult({ ok: false, message: "Şablon adı zorunludur." });
      return;
    }

    const values: QuoteTemplateFormValues = {
      name: name.trim(),
      description: description.trim() || undefined,
      paymentTerms: paymentTerms.trim() || undefined,
      deliveryTerms: deliveryTerms.trim() || undefined,
      warrantyTerms: warrantyTerms.trim() || undefined,
      notes: undefined,
      currencyMode,
      items: items
        .filter((item) => item.description.trim())
        .map((item, idx) => ({
          productId: item.productId || undefined,
          description: item.description.trim(),
          quantity: Math.max(1, Number(item.quantity) || 1),
          unitPrice: parseFloat(item.unitPrice.replace(",", ".")) || 0,
          currency: item.currency,
          discount: parseFloat(item.discount) || 0,
          tax: parseFloat(item.tax) || 20,
          sortOrder: idx,
        })),
    };

    startTransition(async () => {
      const res = await createQuoteTemplateAction(values);
      setResult(res);
      if (res.ok) {
        setName("");
        setDescription("");
        setItems([emptyItem()]);
        window.location.reload();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <FieldBlock label="Şablon Adı *">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ör. Toptan Elektronik Paketi"
            className="input-base"
          />
        </FieldBlock>
        <FieldBlock label="Açıklama">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opsiyonel kısa açıklama"
            className="input-base"
          />
        </FieldBlock>
        <FieldBlock label="Para Birimi Modu">
          <select
            value={currencyMode}
            onChange={(e) => setCurrencyMode(e.target.value as "TRY" | "USD" | "BOTH")}
            className="input-base"
          >
            <option value="TRY">Sadece TL</option>
            <option value="USD">Sadece USD</option>
            <option value="BOTH">USD + TL</option>
          </select>
        </FieldBlock>
      </div>

      {/* Items */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Kalemler</p>
        {items.map((item, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Kalem {index + 1}</span>
              {items.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Kaldır
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FieldBlock label="Ürün">
                <select
                  value={item.productId}
                  onChange={(e) => handleProductChange(index, e.target.value)}
                  className="input-base"
                >
                  <option value="">Ürün bağlama (opsiyonel)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </FieldBlock>
              <FieldBlock label="Açıklama" className="xl:col-span-3">
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  placeholder="Teklifte görünecek açıklama"
                  className="input-base"
                />
              </FieldBlock>
              <FieldBlock label="Adet">
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", e.target.value)}
                  className="input-base"
                />
              </FieldBlock>
              <FieldBlock label="Birim Fiyat">
                <input
                  type="text"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                  placeholder="0,00"
                  className="input-base"
                />
              </FieldBlock>
              <FieldBlock label="Para Birimi">
                <select
                  value={item.currency}
                  onChange={(e) => updateItem(index, "currency", e.target.value)}
                  className="input-base"
                >
                  <option value="TRY">TRY ₺</option>
                  <option value="USD">USD $</option>
                </select>
              </FieldBlock>
              <FieldBlock label="İndirim %">
                <input
                  type="text"
                  value={item.discount}
                  onChange={(e) => updateItem(index, "discount", e.target.value)}
                  placeholder="0"
                  className="input-base"
                />
              </FieldBlock>
              <FieldBlock label="KDV %">
                <input
                  type="text"
                  value={item.tax}
                  onChange={(e) => updateItem(index, "tax", e.target.value)}
                  placeholder="20"
                  className="input-base"
                />
              </FieldBlock>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          + Kalem ekle
        </button>
      </div>

      {/* Terms */}
      <div className="grid gap-4 md:grid-cols-3">
        <FieldBlock label="Ödeme Koşulu">
          <textarea
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            rows={3}
            className="input-base resize-none"
          />
        </FieldBlock>
        <FieldBlock label="Teslimat Koşulu">
          <textarea
            value={deliveryTerms}
            onChange={(e) => setDeliveryTerms(e.target.value)}
            rows={3}
            className="input-base resize-none"
          />
        </FieldBlock>
        <FieldBlock label="Garanti Koşulu">
          <textarea
            value={warrantyTerms}
            onChange={(e) => setWarrantyTerms(e.target.value)}
            rows={3}
            className="input-base resize-none"
          />
        </FieldBlock>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Kaydediliyor..." : "Şablonu Kaydet"}
        </Button>
        {result ? (
          <span className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
            {result.ok ? "Şablon kaydedildi." : result.message}
          </span>
        ) : null}
      </div>

      <style jsx>{`
        .input-base {
          width: 100%;
          height: 2.5rem;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
          background: white;
          padding: 0 0.75rem;
          font-size: 0.875rem;
          color: #0f172a;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-base:focus {
          border-color: #94a3b8;
        }
        textarea.input-base {
          height: auto;
          padding-top: 0.5rem;
          padding-bottom: 0.5rem;
        }
        select.input-base {
          appearance: auto;
        }
      `}</style>
    </div>
  );
}

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  function handleDelete() {
    if (!confirm(`"${name}" şablonunu silmek istediğinize emin misiniz?`)) return;
    startTransition(async () => {
      const res = await deleteQuoteTemplateAction(id);
      setResult(res);
      if (res.ok) window.location.reload();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {result && !result.ok ? (
        <span className="text-xs text-red-600">{result.message}</span>
      ) : null}
      <Button variant="danger" size="sm" onClick={handleDelete} disabled={isPending}>
        {isPending ? "Siliniyor..." : "Sil"}
      </Button>
    </div>
  );
}

function FieldBlock({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
