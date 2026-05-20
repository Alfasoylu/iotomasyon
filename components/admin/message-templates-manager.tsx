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
          <MessageSquare className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Henüz şablon yok</p>
          <p className="mt-1 text-xs text-slate-500">
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
            <Icon className="h-4 w-4 text-emerald-600" />
            <h3 className="truncate text-sm font-semibold text-slate-900">{template.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">{channelMeta.label}</span>
            {template.category && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{template.category}</span>
            )}
            <span>· {template.usageCount} kullanıldı</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleActive}
            disabled={pending}
            className={`h-7 w-7 rounded-md text-xs ${
              template.isActive
                ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                : "bg-slate-100 text-slate-400 hover:bg-slate-200"
            }`}
            title={template.isActive ? "Aktif" : "Pasif"}
          >
            {template.isActive ? <Check className="mx-auto h-3.5 w-3.5" /> : <X className="mx-auto h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="h-7 w-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Düzenle"
          >
            <Pencil className="mx-auto h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="h-7 w-7 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            title="Sil"
          >
            <Trash2 className="mx-auto h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-700">
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

  return (
    <Card className="p-5 md:col-span-2">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">
        {initial ? "Şablonu Düzenle" : "Yeni Şablon"}
      </h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="md:col-span-2">
          <span className="text-xs font-medium text-slate-700">Şablon Adı</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="örn: İlk Teklif Sonrası Hatırlatma"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="text-xs font-medium text-slate-700">Kanal</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-medium text-slate-700">Kategori (opsiyonel)</span>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="message-template-categories"
            placeholder="follow-up, after-sale, vb."
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <datalist id="message-template-categories">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label className="md:col-span-3">
          <span className="text-xs font-medium text-slate-700">Mesaj İçeriği</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Merhaba {{musteri_adi}}, {{son_gorusme}} tarihinde konuştuğumuz teklif konusunda bilgi vermek istedim..."
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
        </label>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
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
