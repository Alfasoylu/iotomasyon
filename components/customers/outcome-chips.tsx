"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check, PhoneOff, X, ThumbsDown, DollarSign, BellOff, Clock,
  type LucideIcon,
} from "lucide-react";

import {
  logCallOutcomeAction,
  type CallOutcomeKind,
} from "@/lib/actions/customer-crm-actions";

interface OutcomeDef {
  kind: CallOutcomeKind;
  label: string;
  icon: LucideIcon;
  color: string;
  hint: string;
  needsDate?: boolean;        // tarih seç (görev oluşturur)
  needsConfirm?: boolean;     // tıklayınca pop-up onay
}

const OUTCOMES: OutcomeDef[] = [
  { kind: "INTERESTED", label: "İlgileniyor", icon: Check, color: "emerald", hint: "Olumlu — görev oluştur", needsDate: true },
  { kind: "NO_ANSWER", label: "Açmadı", icon: PhoneOff, color: "amber", hint: "Tekrar dene (3 kez sonrası otomatik snooze)" },
  { kind: "WRONG_NUMBER", label: "Yanlış numara", icon: X, color: "slate", hint: "Numara hatalı" },
  { kind: "NOT_INTERESTED", label: "İlgisiz", icon: ThumbsDown, color: "rose", hint: "Status → LOST", needsConfirm: true },
  { kind: "DEAL_WON", label: "Satış oldu", icon: DollarSign, color: "emerald", hint: "Status → WON" },
  { kind: "DND", label: "Aramayın", icon: BellOff, color: "rose", hint: "DND işaretle", needsConfirm: true },
  { kind: "CALL_LATER", label: "Sonra ara", icon: Clock, color: "blue", hint: "Snooze + görev oluştur", needsDate: true },
];

const COLOR_CLASSES: Record<string, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  amber: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  slate: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
  rose: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  blue: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
};

/**
 * Çağrı sonu wrap-up rozetleri.
 *
 * 7 outcome tipi:
 *   ✅ İlgileniyor → görev oluştur (tarih seç popover)
 *   📞 Açmadı → callAttempts++ otomatik
 *   📵 Yanlış numara → flag
 *   👎 İlgisiz → status=LOST (onay)
 *   💰 Satış oldu → status=WON + teklif aç linki
 *   🔇 Aramayın → doNotCall=true (onay)
 *   ⏰ Sonra ara → snooze tarihi seç
 *
 * Modal yerine: tıkla → minimal popover veya direkt aksiyon.
 */
export function OutcomeChips({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeOutcome, setActiveOutcome] = useState<OutcomeDef | null>(null);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [note, setNote] = useState("");
  const [showSuccess, setShowSuccess] = useState<string | null>(null);

  function execute(outcome: OutcomeDef, extra?: { nextActionDate?: string; note?: string }) {
    startTransition(async () => {
      const result = await logCallOutcomeAction(customerId, {
        outcome: outcome.kind,
        nextActionDate: extra?.nextActionDate,
        nextActionTitle: outcome.kind === "CALL_LATER" ? "Geri ara" : "Takip görüşmesi",
        note: extra?.note,
      });
      if (result.ok) {
        setShowSuccess(outcome.label);
        setTimeout(() => setShowSuccess(null), 2000);
        setActiveOutcome(null);
        setNote("");
        router.refresh();
      }
    });
  }

  function handleClick(outcome: OutcomeDef) {
    if (outcome.needsDate || outcome.needsConfirm) {
      setActiveOutcome(outcome);
      return;
    }
    execute(outcome);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          📞 Çağrı Sonu — Tek Tıkla Logla
        </p>
        {showSuccess && (
          <p className="text-xs text-emerald-700 font-medium animate-pulse">
            ✓ {showSuccess} kaydedildi
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {OUTCOMES.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.kind}
              type="button"
              onClick={() => handleClick(o)}
              disabled={pending}
              title={o.hint}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${COLOR_CLASSES[o.color]}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Popover for needs-date or needs-confirm outcomes */}
      {activeOutcome && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4"
          onClick={() => setActiveOutcome(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <activeOutcome.icon className={`h-4 w-4 text-${activeOutcome.color}-700`} />
              <h3 className="text-sm font-semibold text-slate-900">{activeOutcome.label}</h3>
            </div>

            {activeOutcome.needsDate && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {activeOutcome.kind === "CALL_LATER" ? "Geri arama tarihi" : "Takip tarihi"}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>
            )}

            {activeOutcome.kind === "DEAL_WON" && (
              <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                <p className="text-xs text-emerald-900">
                  🎉 Status &quot;Kazanıldı&quot; olarak güncellenecek.
                </p>
                <Link
                  href={`/quotes/new?customerId=${customerId}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 underline"
                >
                  Yeni teklif oluştur →
                </Link>
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Not (opsiyonel)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Detay ekle..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveOutcome(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => execute(activeOutcome, {
                  nextActionDate: activeOutcome.needsDate ? date : undefined,
                  note: note.trim() || undefined,
                })}
                disabled={pending}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${COLOR_CLASSES[activeOutcome.color]}`}
              >
                {pending ? "Kaydediliyor..." : "Onayla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
