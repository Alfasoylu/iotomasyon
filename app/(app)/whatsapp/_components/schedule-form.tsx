"use client";

import { useState, useTransition } from "react";
import { CalendarClock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveScheduleAction, deleteScheduleAction } from "@/lib/actions/whatsapp-actions";

const GUNLER = [
  { d: 1, ad: "Pzt" }, { d: 2, ad: "Sal" }, { d: 3, ad: "Çar" }, { d: 4, ad: "Per" },
  { d: 5, ad: "Cum" }, { d: 6, ad: "Cmt" }, { d: 0, ad: "Paz" },
];

export type ScheduleRow = {
  id: string;
  name: string;
  templateName: string | null;
  templateLang: string | null;
  templateParams: string[];
  body: string;
  hour: number;
  minute: number;
  daysOfWeek: number[];
  expectsReply: boolean;
  isActive: boolean;
  recipients: Array<{ contact: { id: string } }>;
};

export function ScheduleForm({
  schedule,
  contacts,
  onClose,
}: {
  schedule?: ScheduleRow;
  contacts: Array<{ id: string; name: string; isActive: boolean }>;
  onClose: () => void;
}) {
  const [bekliyor, basla] = useTransition();
  const [hata, setHata] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: schedule?.name ?? "",
    templateName: schedule?.templateName ?? "",
    templateLang: schedule?.templateLang ?? "tr",
    templateParams: (schedule?.templateParams ?? []).join(" | "),
    body: schedule?.body ?? "",
    hour: schedule?.hour ?? 8,
    minute: schedule?.minute ?? 30,
    daysOfWeek: schedule?.daysOfWeek ?? [1, 2, 3, 4, 5],
    expectsReply: schedule?.expectsReply ?? true,
    isActive: schedule?.isActive ?? true,
    contactIds: schedule?.recipients.map((r) => r.contact.id) ?? [],
  });

  const gunAcKapa = (d: number) =>
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(d)
        ? f.daysOfWeek.filter((x) => x !== d)
        : [...f.daysOfWeek, d],
    }));

  const kisiAcKapa = (id: string) =>
    setForm((f) => ({
      ...f,
      contactIds: f.contactIds.includes(id)
        ? f.contactIds.filter((x) => x !== id)
        : [...f.contactIds, id],
    }));

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{schedule ? "Görevi düzenle" : "Yeni zamanlanmış mesaj"}</h3>
        <button type="button" onClick={onClose} aria-label="Kapat">
          <X size={16} className="text-[var(--text-tertiary)]" />
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-[var(--text-secondary)]">Görev adı</span>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Depo sabah yoklaması"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs text-[var(--text-secondary)]">Saat (0-23)</span>
          <Input
            type="number" min={0} max={23}
            value={form.hour}
            onChange={(e) => setForm({ ...form, hour: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[var(--text-secondary)]">Dakika</span>
          <Input
            type="number" min={0} max={59}
            value={form.minute}
            onChange={(e) => setForm({ ...form, minute: Number(e.target.value) })}
          />
        </label>
        <div className="space-y-1">
          <span className="text-xs text-[var(--text-secondary)]">Saat dilimi</span>
          {/* Saat YEREL: UTC saklamak yaz saatinde mesajı bir saat kaydırırdı. */}
          <p className="pt-2 text-[13px] text-[var(--text-tertiary)]">Europe/Istanbul</p>
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xs text-[var(--text-secondary)]">Günler (hiçbiri seçili değilse her gün)</span>
        <div className="flex flex-wrap gap-1.5">
          {GUNLER.map((g) => (
            <button
              key={g.d}
              type="button"
              onClick={() => gunAcKapa(g.d)}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                form.daysOfWeek.includes(g.d)
                  ? "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
              }`}
            >
              {g.ad}
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-[var(--text-secondary)]">Mesaj</span>
        <Textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="Günaydın, işe başladınız mı?"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs text-[var(--text-secondary)]">Onaylı şablon adı</span>
          <Input
            value={form.templateName}
            onChange={(e) => setForm({ ...form, templateName: e.target.value })}
            placeholder="depo_yoklama"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[var(--text-secondary)]">Şablon dili</span>
          <Input
            value={form.templateLang}
            onChange={(e) => setForm({ ...form, templateLang: e.target.value })}
            placeholder="tr"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[var(--text-secondary)]">Parametreler ( | ile ayır)</span>
          <Input
            value={form.templateParams}
            onChange={(e) => setForm({ ...form, templateParams: e.target.value })}
            placeholder="Depo | sabah"
          />
        </label>
      </div>

      {/* Bu uyarı olmazsa görev "aktif" görünür ve hiçbir mesaj gitmez. */}
      {!form.templateName.trim() && (
        <p className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] p-2.5 text-xs text-[var(--warn)]">
          Şablon adı boş — mesaj <strong>serbest metin</strong> olarak gider ve bu yalnız alıcı
          size son 24 saatte yazmışsa çalışır. Sabah yoklaması gibi bizim başlattığımız
          mesajlarda o pencere <strong>kapalıdır</strong>: Meta reddeder ve mesaj ulaşmaz.
          Düzenli görevler için Meta&apos;da onaylı bir şablon adı girin.
        </p>
      )}

      <div className="space-y-1">
        <span className="text-xs text-[var(--text-secondary)]">
          Alıcılar (herkese AYRI mesaj gider — Cloud API gruba mesaj atamaz)
        </span>
        <div className="flex flex-wrap gap-1.5">
          {contacts.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">Önce kişi ekleyin.</p>
          ) : (
            contacts.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => kisiAcKapa(k.id)}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  form.contactIds.includes(k.id)
                    ? "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                }`}
              >
                {k.name}
                {!k.isActive && " (pasif)"}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.expectsReply}
            onChange={(e) => setForm({ ...form, expectsReply: e.target.checked })}
          />
          <span className="text-[13px]">Cevap bekle (panelde takip edilsin)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span className="text-[13px]">Aktif</span>
        </label>
      </div>

      {hata && <p className="text-xs text-[var(--danger)]">{hata}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={bekliyor}
          onClick={() =>
            basla(async () => {
              setHata(null);
              const r = await saveScheduleAction(schedule?.id ?? null, {
                ...form,
                templateParams: form.templateParams
                  .split("|")
                  .map((p) => p.trim())
                  .filter(Boolean),
              });
              if (r.ok) onClose();
              else setHata(r.message ?? "Kaydedilemedi.");
            })
          }
        >
          {bekliyor ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {schedule && (
          <Button
            variant="danger"
            disabled={bekliyor}
            onClick={() =>
              basla(async () => {
                setHata(null);
                const r = await deleteScheduleAction(schedule.id);
                if (r.ok) onClose();
                else setHata(r.message ?? "Silinemedi.");
              })
            }
          >
            Sil
          </Button>
        )}
      </div>
    </Card>
  );
}

export function AddScheduleButton({
  contacts,
}: {
  contacts: Array<{ id: string; name: string; isActive: boolean }>;
}) {
  const [acik, setAcik] = useState(false);
  if (acik) return <ScheduleForm contacts={contacts} onClose={() => setAcik(false)} />;
  return (
    <Button variant="secondary" onClick={() => setAcik(true)}>
      <CalendarClock size={14} /> Zamanlanmış mesaj ekle
    </Button>
  );
}
