"use client";

import { startTransition, useState } from "react";

import { markRecipientSentAction } from "@/lib/actions/outreach-actions";
import { Button } from "@/components/ui/button";

type Recipient = {
  id: string;
  phone: string | null;
  status: string;
  sentAt: Date | null;
  customer: { id: string; name: string; company: string | null };
};

type Props = {
  recipients: Recipient[];
  message: string;
  offerText: string | null;
  price: string | null;
  currency: string;
};

function personalizeMessage(
  template: string,
  name: string,
  offerText: string | null,
  price: string | null,
  currency: string,
): string {
  let msg = template
    .replace("{isim}", name)
    .replace("{teklif_metni}", offerText ?? "")
    .replace("{fiyat}", price ? `${price} ${currency}` : "");

  if (price) {
    msg += `\n\n💰 Fiyat: ${price} ${currency}`;
  }

  return msg;
}

function waLink(phone: string | null, message: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, "");
  const normalized = cleaned.startsWith("0") ? `90${cleaned.slice(1)}` : cleaned;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function RecipientList({ recipients, message, offerText, price, currency }: Props) {
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(recipients.map((r) => [r.id, r.status])),
  );
  const [copying, setCopying] = useState(false);

  async function markSent(recipientId: string) {
    startTransition(async () => {
      await markRecipientSentAction(recipientId);
      setStatuses((prev) => ({ ...prev, [recipientId]: "SENT" }));
    });
  }

  async function copyAll() {
    const text = recipients
      .map((r) => {
        const msg = personalizeMessage(message, r.customer.name, offerText, price, currency);
        return `=== ${r.customer.name} ===\n${msg}`;
      })
      .join("\n\n" + "─".repeat(40) + "\n\n");

    await navigator.clipboard.writeText(text);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {recipients.filter((r) => statuses[r.id] === "SENT").length} / {recipients.length} gönderildi
        </p>
        <Button type="button" onClick={copyAll} variant="secondary">
          {copying ? "Kopyalandı!" : "Tümünü kopyala"}
        </Button>
      </div>

      <div className="space-y-3">
        {recipients.map((r) => {
          const msg = personalizeMessage(message, r.customer.name, offerText, price, currency);
          const link = waLink(r.phone, msg);
          const sent = statuses[r.id] === "SENT";

          return (
            <div
              key={r.id}
              className={`rounded-2xl border p-4 space-y-3 ${sent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{r.customer.name}</p>
                  {r.customer.company ? (
                    <p className="text-xs text-slate-500">{r.customer.company}</p>
                  ) : null}
                  <p className="text-xs text-slate-400 mt-1">{r.phone ?? "Telefon yok"}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer">
                      <Button type="button" variant={sent ? "secondary" : "primary"}>
                        WhatsApp&nbsp;aç
                      </Button>
                    </a>
                  ) : (
                    <Button type="button" variant="secondary" disabled>
                      Telefon yok
                    </Button>
                  )}
                  {!sent ? (
                    <Button type="button" variant="secondary" onClick={() => markSent(r.id)}>
                      Gönderildi&nbsp;işaretle
                    </Button>
                  ) : (
                    <span className="inline-flex items-center text-xs font-medium text-emerald-700">
                      ✓ Gönderildi
                    </span>
                  )}
                </div>
              </div>

              <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600 border border-slate-100">
                {msg}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
