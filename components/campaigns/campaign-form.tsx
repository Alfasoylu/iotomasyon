"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { createCampaignAction } from "@/lib/actions/outreach-actions";
import type { CampaignCandidate } from "@/services/outreach-service";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  productId?: string;
  categoryId?: string;
  productName?: string;
  categoryName?: string;
  candidates: CampaignCandidate[];
};

function buildDefaultMessage(productName?: string, categoryName?: string): string {
  const subject = productName ?? categoryName ?? "ürünlerimiz";
  return `Merhaba {isim},

${subject} hakkında sizinle bilgi paylaşmak istedik.

{teklif_metni}

Detaylı bilgi ve fiyat teklifi için lütfen bizimle iletişime geçin.

Saygılarımızla,
Soylu Elektronik`;
}

export function CampaignForm({ productId, categoryId, productName, categoryName, candidates }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(candidates.map((c) => c.customerId)),
  );
  const [message, setMessage] = useState(buildDefaultMessage(productName, categoryName));
  const [offerText, setOfferText] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("TRY");

  function toggleCustomer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.customerId)));
    }
  }

  function personalizedMessage(name: string): string {
    return message
      .replace("{isim}", name)
      .replace("{teklif_metni}", offerText || "(teklif metni)")
      .replace("{fiyat}", price ? `${price} ${currency}` : "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.size === 0) {
      setError("En az bir müşteri seçilmelidir.");
      return;
    }
    setError(undefined);
    setPending(true);

    const customerPhones: Record<string, string | undefined> = {};
    for (const c of candidates) {
      customerPhones[c.customerId] = c.whatsapp ?? c.phone ?? undefined;
    }

    startTransition(async () => {
      const result = await createCampaignAction({
        productId,
        categoryId,
        message,
        offerText: offerText || undefined,
        price: price || undefined,
        currency,
        selectedCustomerIds: Array.from(selectedIds),
        customerPhones,
      });

      setPending(false);
      if (!result.ok) {
        setError(result.message ?? "Bir hata oluştu.");
        return;
      }
      router.push(`/campaigns/${result.campaignId}`);
    });
  }

  const allSelected = selectedIds.size === candidates.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Customer picker */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Alıcılar
            <span className="ml-2 text-sm font-normal text-slate-500">
              {selectedIds.size} / {candidates.length} seçili
            </span>
          </h2>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 underline"
          >
            {allSelected ? "Tümünü kaldır" : "Tümünü seç"}
          </button>
        </div>

        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {candidates.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              Bu ürün/kategori için kayıtlı ilgi bulunamadı.
            </p>
          ) : (
            candidates.map((c) => (
              <label
                key={c.customerId}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.customerId)}
                  onChange={() => toggleCustomer(c.customerId)}
                  className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{c.name}</p>
                  {c.company ? <p className="text-xs text-slate-500">{c.company}</p> : null}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">{c.whatsapp ?? c.phone ?? "—"}</p>
                  <span
                    className={`text-xs font-medium ${
                      c.source === "direct" ? "text-emerald-600" : "text-violet-600"
                    }`}
                  >
                    {c.source === "direct" ? "Ürün ilgisi" : "Kategori ilgisi"}
                  </span>
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Message template */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Mesaj şablonu</h2>
        <p className="text-sm text-slate-500">
          Kullanılabilir değişkenler: <code className="bg-slate-100 px-1 rounded">{"{isim}"}</code>{" "}
          <code className="bg-slate-100 px-1 rounded">{"{teklif_metni}"}</code>{" "}
          <code className="bg-slate-100 px-1 rounded">{"{fiyat}"}</code>
        </p>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Mesaj
          </label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[180px] font-mono text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              Teklif metni (opsiyonel)
            </label>
            <Textarea
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
              placeholder="Kısa teklif açıklaması..."
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                Fiyat (opsiyonel)
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="12500"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                Para birimi
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      {selectedIds.size > 0 && candidates.find((c) => selectedIds.has(c.customerId)) && (() => {
        const first = candidates.find((c) => selectedIds.has(c.customerId))!;
        return (
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">
              Önizleme — {first.name}
            </h2>
            <pre className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {personalizedMessage(first.name)}
              {price ? `\n\n💰 Fiyat: ${price} ${currency}` : ""}
            </pre>
          </div>
        );
      })()}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button type="submit" disabled={pending || selectedIds.size === 0}>
        {pending ? "Kampanya oluşturuluyor..." : `Kampanya oluştur (${selectedIds.size} alıcı)`}
      </Button>
    </form>
  );
}
