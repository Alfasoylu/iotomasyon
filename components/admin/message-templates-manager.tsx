"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, MessageSquare, MessageCircle, Mail, Check, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createMessageTemplateAction,
  updateMessageTemplateAction,
  deleteMessageTemplateAction,
} from "@/lib/actions/message-template-actions";

type Template = {
  id: string;
  name: string;
  channel: string;
  category: string | null;
  body: string;
  isActive: boolean;
  usageCount: number;
};

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "email", label: "E-posta", icon: Mail },
] as const;

const CATEGORIES = ["follow-up", "negotiation", "after-sale", "intro", "thanks", "reminder"];

export function MessageTemplatesManager({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      {!creating && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni Şablon
          </Button>
        </div>
      )}

      {creating && (
        <TemplateForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}

      {templates.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageSquare size={36} strokeWidth={1.5} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Henüz şablon yok</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            İlk şablonunu eklediğinde müşteri detayında WhatsApp butonu altında çıkacak.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) =>
            editingId === t.id ? (
              <TemplateForm
                key={t.id}
                initial={t}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  router.refresh();
                }}
              />
            ) : (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={() => setEditingId(t.id)}
                onChanged={() => router.refresh()}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onChanged,
}: {
  template: Template;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const channelMeta = CHANNELS.find((c) => c.value === template.channel) ?? CHANNELS[0];
  const Icon = channelMeta.icon;

  function toggleActive() {
    startTransition(async () => {
      const res = await updateMessageTemplateAction({ id: template.id, isActive: !template.isActive });
      if (res.ok) onChanged();
    });
  }

  function onDelete() {
    if (!confirm(`"${template.name}" şablonunu silmek istediğine emin misin?`)) return;
    startTransition(async () => {
      const res = await deleteMessageTemplateAction(template.id);
      if (res.ok) onChanged();
    });
  }

  return (
    <Card className={`p-4 ${template.isActive ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon size={14} strokeWidth={1.5} className="text-[var(--ok)]" />
            <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{template.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="rounded border border-[var(--border-subtle)] bg-[var(--surface-3)] px-1.5 py-0.5 font-medium text-[var(--text-secondary)]">
              {channelMeta.label}
            </span>
            {template.category && (
              <span className="rounded border border-[var(--info-border)] bg-[var(--info-dim)] px-1.5 py-0.5 text-[var(--info)]">
                {template.category}
              </span>
            )}
            <span className="tabular-nums">· {template.usageCount} kullanıldı</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleActive}
            disabled={pending}
            className={`h-7 w-7 rounded-md border text-xs transition ${
              template.isActive
                ? "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-muted)]"
            }`}
            title={template.isActive ? "Aktif" : "Pasif"}
          >
            {template.isActive ? (
              <Check size={14} strokeWidth={1.5} className="mx-auto" />
            ) : (
              <X size={14} strokeWidth={1.5} className="mx-auto" />
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="h-7 w-7 rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            title="Düzenle"
          >
            <Pencil size={14} strokeWidth={1.5} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="h-7 w-7 rounded-md text-[var(--text-muted)] transition hover:bg-[var(--danger-dim)] hover:text-[var(--danger)]"
            title="Sil"
          >
            <Trash2 size={14} strokeWidth={1.5} className="mx-auto" />
          </button>
        </div>
      </div>

      <pre className="mt-3 whitespace-pre-wrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 font-sans text-xs text-[var(--text-secondary)]">
        {template.body}
      </pre>
    </Card>
  );
}

function TemplateForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Template;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState(initial?.channel ?? "whatsapp");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const res = initial
        ? await updateMessageTemplateAction({ id: initial.id, name, channel, category, body })
        : await createMessageTemplateAction({ name, channel, category, body });
      if (res.ok) {
        onSaved();
      } else {
        setError(res.message ?? "Kaydedilemedi.");
      }
    });
  }

  const inputCls =
    "mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]";

  return (
    <Card className="p-5 md:col-span-2">
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        {initial ? "Şablonu Düzenle" : "Yeni Şablon"}
      </h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="md:col-span-2">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Şablon Adı</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="örn: İlk Teklif Sonrası Hatırlatma"
            className={inputCls}
          />
        </label>
        <label>
          <span className="text-xs font-medium text-[var(--text-secondary)]">Kanal</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className={inputCls}
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-medium text-[var(--text-secondary)]">Kategori (opsiyonel)</span>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="message-template-categories"
            placeholder="follow-up, after-sale, vb."
            className={inputCls}
          />
          <datalist id="message-template-categories">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label className="md:col-span-3">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Mesaj İçeriği</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Merhaba {{musteri_adi}}, {{son_gorusme}} tarihinde konuştuğumuz teklif konusunda bilgi vermek istedim..."
            className={`${inputCls} font-mono`}
          />
        </label>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Vazgeç
        </Button>
        <Button onClick={onSubmit} disabled={pending}>
          {pending ? "Kaydediliyor…" : initial ? "Güncelle" : "Kaydet"}
        </Button>
      </div>
    </Card>
  );
}
