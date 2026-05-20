"use client";

import { useState, useTransition } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";

import { markCustomerContactedAction } from "@/lib/actions/customer-crm-actions";
import { incrementTemplateUsageAction } from "@/lib/actions/message-template-actions";

export interface WhatsAppTemplate {
  id: string;
  name: string;
  body: string;
  category: string | null;
}

interface CustomerContext {
  name: string;
  company?: string | null;
  city?: string | null;
  phone?: string | null;
  lastQuoteNumber?: string | null;
  lastContactedAt?: Date | null;
}

function renderTemplate(body: string, ctx: CustomerContext): string {
  const now = new Date();
  const lastGorusme = ctx.lastContactedAt
    ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long" }).format(ctx.lastContactedAt)
    : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long" }).format(now);
  return body
    .replace(/\{\{musteri_adi\}\}/g, ctx.name || "")
    .replace(/\{\{firma\}\}/g, ctx.company || "")
    .replace(/\{\{telefon\}\}/g, ctx.phone || "")
    .replace(/\{\{sehir\}\}/g, ctx.city || "")
    .replace(/\{\{teklif_no\}\}/g, ctx.lastQuoteNumber || "")
    .replace(/\{\{son_gorusme\}\}/g, lastGorusme);
}

export function CustomerWhatsAppButton({
  customerId,
  phone,
  customerName,
  customerCompany,
  customerCity,
  lastQuoteNumber,
  lastContactedAt,
  templates,
}: {
  customerId: string;
  phone: string | null | undefined;
  customerName: string;
  customerCompany?: string | null;
  customerCity?: string | null;
  lastQuoteNumber?: string | null;
  lastContactedAt?: Date | null;
  templates?: WhatsAppTemplate[];
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const normalized = phone?.replace(/\D/g, "") ?? "";
  const ctx: CustomerContext = {
    name: customerName,
    company: customerCompany,
    city: customerCity,
    phone,
    lastQuoteNumber,
    lastContactedAt,
  };
  const defaultMessage = `Merhaba ${customerName},`;
  const waUrlFor = (msg: string) =>
    normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}` : null;

  function logContact() {
    startTransition(async () => {
      await markCustomerContactedAction(customerId);
    });
  }

  function onTemplateClick(t: WhatsAppTemplate) {
    setOpen(false);
    startTransition(async () => {
      await Promise.all([
        markCustomerContactedAction(customerId),
        incrementTemplateUsageAction(t.id),
      ]);
    });
    const url = waUrlFor(renderTemplate(t.body, ctx));
    if (url) window.open(url, "_blank", "noopener");
  }

  if (!normalized) {
    return (
      <span className="inline-flex h-9 items-center rounded-xl bg-slate-100 px-4 text-sm text-slate-400">
        WhatsApp numarası yok
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={waUrlFor(defaultMessage) ?? "#"}
        target="_blank"
        rel="noreferrer"
        onClick={logContact}
        className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        WhatsApp aç
      </a>

      {templates && templates.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <MessageSquare className="h-4 w-4" />
            Şablon
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {open && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <div className="absolute right-0 top-10 z-20 max-h-80 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onTemplateClick(t)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <div className="font-medium text-slate-900">{t.name}</div>
                    {t.category && (
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        {t.category}
                      </div>
                    )}
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{t.body}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <button
        disabled={isPending}
        onClick={logContact}
        className="inline-flex h-9 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {isPending ? "..." : "İletişim kuruldu"}
      </button>
    </div>
  );
}
