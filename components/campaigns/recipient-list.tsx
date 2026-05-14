"use client";

import Link from "next/link";
import { startTransition, useState } from "react";

import {
  markRecipientSentAction,
  updateRecipientStatusAction,
  linkRecipientToQuoteAction,
} from "@/lib/actions/outreach-actions";
import { Button } from "@/components/ui/button";
import type { CampaignRecipient } from "@/services/outreach-service";

type Props = {
  recipients: CampaignRecipient[];
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
  const hasFiyatPlaceholder = template.includes("{fiyat}");
  let msg = template
    .replace("{isim}", name)
    .replace("{teklif_metni}", offerText ?? "")
    .replace("{fiyat}", price ? `${price} ${currency}` : "");
  if (price && !hasFiyatPlaceholder) {
    msg += `\n\n💰 Fiyat: ${price} ${currency}`;
  }
  return msg;
}

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("90") && cleaned.length === 12) return cleaned;
  if (cleaned.startsWith("0") && cleaned.length === 11) return `90${cleaned.slice(1)}`;
  if (cleaned.length === 10 && cleaned.startsWith("5")) return `90${cleaned}`;
  return cleaned;
}

function waLink(phone: string | null, message: string): string | null {
  if (!phone) return null;
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

// OPENED removed — dead status, never set in application code
const STATUS_ORDER = ["PENDING", "SENT", "REPLIED", "QUOTED", "WON", "LOST"] as const;
type Status = (typeof STATUS_ORDER)[number];

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Bekliyor",
  SENT:    "Gönderildi",
  REPLIED: "Cevap verdi",
  QUOTED:  "Teklif çıktı",
  WON:     "Kazanıldı",
  LOST:    "Kaybedildi",
};

const STATUS_COLOR: Record<Status, string> = {
  PENDING: "text-slate-500",
  SENT:    "text-blue-600",
  REPLIED: "text-violet-600",
  QUOTED:  "text-amber-600",
  WON:     "text-emerald-700",
  LOST:    "text-red-500",
};

const CARD_BG: Record<Status, string> = {
  PENDING: "border-slate-200 bg-white",
  SENT:    "border-blue-100 bg-blue-50/40",
  REPLIED: "border-violet-100 bg-violet-50/40",
  QUOTED:  "border-amber-100 bg-amber-50/40",
  WON:     "border-emerald-200 bg-emerald-50",
  LOST:    "border-red-100 bg-red-50/40",
};

type RecipientState = {
  status: Status;
  quoteId: string | null;
  quoteNumber: string | null;
  quoteTotal: string | null;
  wonAmount: string | null;
};

function QuoteLinkForm({
  recipientId,
  onLinked,
}: {
  recipientId: string;
  onLinked: (quoteId: string, quoteNumber: string, quoteTotal: string | null) => void;
}) {
  const [quoteNum, setQuoteNum] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleLink() {
    if (!quoteNum.trim()) return;
    setPending(true);
    setError(undefined);
    startTransition(async () => {
      const result = await linkRecipientToQuoteAction(recipientId, quoteNum.trim());
      setPending(false);
      if (!result.ok) {
        setError(result.message ?? "Hata oluştu.");
      } else if (result.quoteId) {
        onLinked(result.quoteId, quoteNum.trim(), result.quoteTotal ?? null);
      }
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          type="text"
          value={quoteNum}
          onChange={(e) => setQuoteNum(e.target.value)}
          placeholder="Teklif no (örn: TKL-0001)"
          className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400"
          onKeyDown={(e) => { if (e.key === "Enter") handleLink(); }}
        />
        <Button type="button" variant="secondary" onClick={handleLink} disabled={pending}>
          {pending ? "Bağlanıyor…" : "Bağla"}
        </Button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function RecipientCard({
  r,
  message,
  offerText,
  price,
  currency,
}: {
  r: CampaignRecipient;
  message: string;
  offerText: string | null;
  price: string | null;
  currency: string;
}) {
  const [state, setState] = useState<RecipientState>({
    status: r.status as Status,
    quoteId: r.quoteId,
    quoteNumber: r.quote?.quoteNumber ?? null,
    quoteTotal: r.quote?.total ?? null,
    wonAmount: r.wonAmount,
  });
  const [showQuoteLink, setShowQuoteLink] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const msg = personalizeMessage(message, r.customer.name, offerText, price, currency);
  const link = waLink(r.phone, msg);
  const { status } = state;

  // Forward transitions (REPLIED, WON, LOST) via updateRecipientStatusAction
  function doStatus(next: "REPLIED" | "WON" | "LOST") {
    setActionError(undefined);
    startTransition(async () => {
      const result = await updateRecipientStatusAction(r.id, next);
      if (!result.ok) {
        setActionError(result.message ?? "İşlem başarısız.");
        return;
      }
      setState((prev) => ({ ...prev, status: next }));
    });
  }

  // PENDING → SENT (sets sentAt)
  function doMarkSent() {
    setActionError(undefined);
    startTransition(async () => {
      const result = await markRecipientSentAction(r.id);
      if (!result.ok) {
        setActionError(result.message ?? "İşlem başarısız.");
        return;
      }
      setState((prev) => ({ ...prev, status: "SENT" }));
    });
  }

  // Reversals: WON/LOST → QUOTED, REPLIED → SENT
  // Requires confirmation before calling server.
  function doReversal(next: "QUOTED" | "SENT") {
    const targetLabel = next === "QUOTED" ? "Teklif çıktı" : "Gönderildi";
    if (!window.confirm(`Durumu "${targetLabel}" olarak geri almak istediğinize emin misiniz?`)) return;
    setActionError(undefined);
    startTransition(async () => {
      const result = await updateRecipientStatusAction(r.id, next);
      if (!result.ok) {
        setActionError(result.message ?? "İşlem başarısız.");
        return;
      }
      setState((prev) => ({ ...prev, status: next }));
    });
  }

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${CARD_BG[status] ?? CARD_BG.PENDING}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{r.customer.name}</p>
          {r.customer.company ? (
            <p className="text-xs text-slate-500">{r.customer.company}</p>
          ) : null}
          <p className="text-xs text-slate-400 mt-0.5">{r.phone ?? "Telefon yok"}</p>
          <span className={`mt-1 inline-block text-xs font-semibold ${STATUS_COLOR[status] ?? ""}`}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>

        {/* WhatsApp button */}
        <div className="shrink-0">
          {link ? (
            <a href={link} target="_blank" rel="noreferrer">
              <Button type="button" variant={status === "PENDING" ? "primary" : "secondary"} className="text-sm">
                WhatsApp aç
              </Button>
            </a>
          ) : (
            <Button type="button" variant="secondary" disabled className="text-sm">
              Telefon yok
            </Button>
          )}
        </div>
      </div>

      {/* Personalized message */}
      <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600 border border-slate-100">
        {msg}
      </pre>

      {/* Linked quote */}
      {state.quoteId ? (
        <div className="flex items-center gap-2 text-xs text-amber-700">
          <span>Teklif:</span>
          <Link href={`/quotes/${state.quoteId}`} className="font-semibold underline hover:text-amber-900">
            {state.quoteNumber}
          </Link>
          {state.quoteTotal ? (
            <span className="text-slate-500">— {parseFloat(state.quoteTotal).toLocaleString("tr-TR")} {currency}</span>
          ) : null}
        </div>
      ) : null}

      {/* Won amount */}
      {status === "WON" && state.wonAmount ? (
        <p className="text-xs font-semibold text-emerald-700">
          💰 Kazanılan: {parseFloat(state.wonAmount).toLocaleString("tr-TR")} {currency}
        </p>
      ) : null}

      {/* Server-side error feedback */}
      {actionError ? (
        <p className="text-xs text-red-600">{actionError}</p>
      ) : null}

      {/* Action buttons by status */}
      <div className="flex flex-wrap gap-2">

        {/* PENDING */}
        {status === "PENDING" && (
          <Button type="button" variant="secondary" onClick={doMarkSent}>
            Gönderildi işaretle
          </Button>
        )}

        {/* SENT */}
        {status === "SENT" && (
          <>
            <Button type="button" variant="secondary" onClick={() => doStatus("REPLIED")}>
              Cevap verdi
            </Button>
            {!state.quoteId && (
              <Button type="button" variant="secondary" onClick={() => setShowQuoteLink((v) => !v)}>
                Teklif bağla
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => doStatus("WON")}
              disabled={!state.quoteId}
              title={!state.quoteId ? "Kazanıldı için önce teklif bağlayın" : undefined}
            >
              Kazanıldı
            </Button>
            <Button type="button" variant="secondary" onClick={() => doStatus("LOST")}>
              Kaybedildi
            </Button>
          </>
        )}

        {/* REPLIED */}
        {status === "REPLIED" && (
          <>
            <Button type="button" variant="secondary" onClick={() => doReversal("SENT")}>
              ← Gönderildi&apos;ye al
            </Button>
            {!state.quoteId && (
              <Button type="button" variant="secondary" onClick={() => setShowQuoteLink((v) => !v)}>
                Teklif bağla
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => doStatus("WON")}
              disabled={!state.quoteId}
              title={!state.quoteId ? "Kazanıldı için önce teklif bağlayın" : undefined}
            >
              Kazanıldı
            </Button>
            <Button type="button" variant="secondary" onClick={() => doStatus("LOST")}>
              Kaybedildi
            </Button>
          </>
        )}

        {/* QUOTED */}
        {status === "QUOTED" && (
          <>
            <Button type="button" variant="secondary" onClick={() => doStatus("WON")}>
              Kazanıldı
            </Button>
            <Button type="button" variant="secondary" onClick={() => doStatus("LOST")}>
              Kaybedildi
            </Button>
          </>
        )}

        {/* WON — terminal with reversal */}
        {status === "WON" && (
          <>
            <span className="inline-flex items-center text-xs font-semibold text-emerald-700">
              ✓ Kazanıldı
            </span>
            <Button type="button" variant="secondary" onClick={() => doReversal("QUOTED")}>
              ← Geri al
            </Button>
          </>
        )}

        {/* LOST — terminal with reversal */}
        {status === "LOST" && (
          <>
            <span className="inline-flex items-center text-xs font-semibold text-red-500">
              ✗ Kaybedildi
            </span>
            <Button type="button" variant="secondary" onClick={() => doReversal("QUOTED")}>
              ← Geri al
            </Button>
          </>
        )}
      </div>

      {/* Quote number entry — only for SENT/REPLIED without linked quote */}
      {showQuoteLink && !state.quoteId && (
        <QuoteLinkForm
          recipientId={r.id}
          onLinked={(quoteId, quoteNumber, quoteTotal) => {
            setState((prev) => ({ ...prev, status: "QUOTED", quoteId, quoteNumber, quoteTotal }));
            setShowQuoteLink(false);
          }}
        />
      )}

      {/* Customer link */}
      <div className="pt-1">
        <Link
          href={`/customers/${r.customer.id}`}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          Müşteri sayfası →
        </Link>
      </div>
    </div>
  );
}

export function RecipientList({ recipients, message, offerText, price, currency }: Props) {
  const sentCount = recipients.filter((r) =>
    ["SENT", "REPLIED", "QUOTED", "WON", "LOST"].includes(r.status),
  ).length;

  async function copyAll() {
    const text = recipients
      .map((r) => {
        const msg = personalizeMessage(message, r.customer.name, offerText, price, currency);
        return `=== ${r.customer.name} ===\n${msg}`;
      })
      .join("\n\n" + "─".repeat(40) + "\n\n");
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {sentCount} / {recipients.length} gönderildi
        </p>
        <Button type="button" onClick={copyAll} variant="secondary">
          Tümünü kopyala
        </Button>
      </div>

      <div className="space-y-3">
        {recipients.map((r) => (
          <RecipientCard
            key={r.id}
            r={r}
            message={message}
            offerText={offerText}
            price={price}
            currency={currency}
          />
        ))}
      </div>
    </div>
  );
}
