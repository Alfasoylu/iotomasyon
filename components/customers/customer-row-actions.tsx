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
export function CustomerRowActions({ customerId, phone, whatsapp, detailHref }: Props) {
  const [openTask, setOpenTask] = useState(false);
  const [openNote, setOpenNote] = useState(false);

  const phoneHref = telLink(phone || whatsapp);
  const waHref = whatsappLink(whatsapp || phone);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 📞 ARA */}
      {phoneHref ? (
        <a
          href={phoneHref}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
          title="Telefon: tel: linki açılır"
        >
          <Phone className="h-3.5 w-3.5" />
          ARA
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-400" title="Telefon yok">
          <Phone className="h-3.5 w-3.5" />
          —
        </span>
      )}

      {/* 💬 WhatsApp */}
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100"
          title="WhatsApp web/uygulamada aç"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          WhatsApp
        </a>
      ) : null}

      {/* ➕ Görev */}
      <button
        type="button"
        onClick={() => setOpenTask(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
        title="Hızlı görev ekle"
      >
        <ListPlus className="h-3.5 w-3.5" />
        Görev
      </button>

      {/* 📝 Hızlı Not */}
      <button
        type="button"
        onClick={() => setOpenNote(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
        title="Hızlı not ekle"
      >
        <NotebookPen className="h-3.5 w-3.5" />
        Not
      </button>

      {/* → Detay */}
      {detailHref && (
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Detay
          <ArrowRight className="h-3 w-3" />
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Hızlı Görev Ekle</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Başlık</label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="örn. Geri ara, fiyat teyit"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Vade tarihi</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Öncelik</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              >
                <option value="LOW">Düşük</option>
                <option value="MEDIUM">Orta</option>
                <option value="HIGH">Yüksek</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700">
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Hızlı Not</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tip</label>
            <div className="flex flex-wrap gap-1">
              {(["CALL", "WHATSAPP", "EMAIL", "MEETING", "NOTE"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    type === t
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t === "CALL" ? "📞 Telefon" :
                   t === "WHATSAPP" ? "💬 WhatsApp" :
                   t === "EMAIL" ? "📩 E-posta" :
                   t === "MEETING" ? "🤝 Toplantı" :
                   "📝 Not"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Not</label>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="örn. Ahmet bey fiyat sordu, kamerayı önerdim..."
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none resize-none"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Not eklenince müşterinin &quot;Son temas&quot; tarihi güncellenir.
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700">
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
