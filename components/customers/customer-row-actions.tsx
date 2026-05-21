"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, MessageCircle, ListPlus, NotebookPen, ArrowRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createCustomerNoteAction,
  createCustomerTaskAction,
} from "@/lib/actions/customer-crm-actions";
import { telLink, whatsappLink } from "@/lib/customer-contact";

interface Props {
  customerId: string;
  phone: string | null;
  whatsapp: string | null;
  detailHref?: string;
  /** Detay sayfasında ARA/WhatsApp/Detay zaten başka yerde — sadece Not + Görev modal'larını göster */
  compact?: boolean;
}

/**
 * Liste sayfasında her müşteri satırında gösterilen 5'li inline aksiyon çubuğu:
 *   📞 ARA          → tel:+90...
 *   💬 WhatsApp     → wa.me/...
 *   ➕ Görev        → modal (başlık + vade tarihi)
 *   📝 Hızlı Not    → modal (textarea + tip seç)
 *   →  Detaya git   → /customers/[id]
 *
 * Hedef: çağrı merkezi sales rep detaya gitmeden günlük işini bitirir.
 */
export function CustomerRowActions({ customerId, phone, whatsapp, detailHref, compact = false }: Props) {
  const [openTask, setOpenTask] = useState(false);
  const [openNote, setOpenNote] = useState(false);

  const phoneHref = telLink(phone || whatsapp);
  const waHref = whatsappLink(whatsapp || phone);

  const actionBase =
    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-widest transition";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* ARA */}
      {!compact && (phoneHref ? (
        <a
          href={phoneHref}
          className={`${actionBase} border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)] hover:brightness-110`}
          title="Telefon: tel: linki açılır"
        >
          <Phone size={14} strokeWidth={1.5} />
          Ara
        </a>
      ) : (
        <span
          className={`${actionBase} border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-muted)]`}
          title="Telefon yok"
        >
          <Phone size={14} strokeWidth={1.5} />
          —
        </span>
      ))}

      {/* WhatsApp */}
      {!compact && waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${actionBase} border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)] hover:brightness-110`}
          title="WhatsApp web/uygulamada aç"
        >
          <MessageCircle size={14} strokeWidth={1.5} />
          WhatsApp
        </a>
      )}

      {/* Görev */}
      <button
        type="button"
        onClick={() => setOpenTask(true)}
        className={`${actionBase} border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)] hover:brightness-110`}
        title="Hızlı görev ekle"
      >
        <ListPlus size={14} strokeWidth={1.5} />
        Görev
      </button>

      {/* Hızlı Not */}
      <button
        type="button"
        onClick={() => setOpenNote(true)}
        className={`${actionBase} border-[var(--info-border)] bg-[var(--info-dim)] text-[var(--info)] hover:brightness-110`}
        title="Hızlı not ekle"
      >
        <NotebookPen size={14} strokeWidth={1.5} />
        Not
      </button>

      {/* Detay */}
      {!compact && detailHref && (
        <Link
          href={detailHref}
          className={`${actionBase} border-[var(--border-default)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]`}
        >
          Detay
          <ArrowRight size={14} strokeWidth={1.5} />
        </Link>
      )}

      {/* Modaller */}
      {openTask && (
        <QuickTaskModal customerId={customerId} onClose={() => setOpenTask(false)} />
      )}
      {openNote && (
        <QuickNoteModal customerId={customerId} onClose={() => setOpenNote(false)} />
      )}
    </div>
  );
}

// ── Hızlı Görev Modal ──────────────────────────────────────────────────────

function QuickTaskModal({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCustomerTaskAction(customerId, {
        title: title.trim(),
        description: "",
        dueDate,
        priority,
        assignedToId: "",
      });
      if (!result.ok) {
        setError(result.message ?? "Görev oluşturulamadı.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const inputCls =
    "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Hızlı Görev Ekle
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Başlık</label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="örn. Geri ara, fiyat teyit"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Vade tarihi</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Öncelik</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
                className={inputCls}
              >
                <option value="LOW">Düşük</option>
                <option value="MEDIUM">Orta</option>
                <option value="HIGH">Yüksek</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] p-2 text-xs text-[var(--danger)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>İptal</Button>
            <Button onClick={submit} disabled={pending || !title.trim()}>
              {pending ? "Kaydediliyor..." : "Görev ekle"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hızlı Not Modal ────────────────────────────────────────────────────────

function QuickNoteModal({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [type, setType] = useState<"NOTE" | "CALL" | "WHATSAPP" | "EMAIL" | "MEETING">("CALL");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCustomerNoteAction(customerId, {
        note: note.trim(),
        type,
      });
      if (!result.ok) {
        setError(result.message ?? "Not eklenemedi.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const inputCls =
    "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]";
  const noteTypeLabels: Record<"NOTE" | "CALL" | "WHATSAPP" | "EMAIL" | "MEETING", string> = {
    CALL: "Telefon",
    WHATSAPP: "WhatsApp",
    EMAIL: "E-posta",
    MEETING: "Toplantı",
    NOTE: "Not",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Hızlı Not
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Tip</label>
            <div className="flex flex-wrap gap-1">
              {(["CALL", "WHATSAPP", "EMAIL", "MEETING", "NOTE"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium uppercase tracking-widest transition ${
                    type === t
                      ? "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {noteTypeLabels[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Not</label>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="örn. Ahmet bey fiyat sordu, kamerayı önerdim..."
              rows={4}
              className={`${inputCls} resize-none`}
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Not eklenince müşterinin &quot;Son temas&quot; tarihi güncellenir.
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] p-2 text-xs text-[var(--danger)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>İptal</Button>
            <Button onClick={submit} disabled={pending || !note.trim()}>
              {pending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
