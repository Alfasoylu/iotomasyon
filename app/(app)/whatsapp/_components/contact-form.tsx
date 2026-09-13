"use client";

import { useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveContactAction, deleteContactAction } from "@/lib/actions/whatsapp-actions";

export type ContactRow = {
  id: string;
  name: string;
  phone: string;
  label: string | null;
  isActive: boolean;
};

/**
 * Kişi ekleme / düzenleme.
 *
 * ⚠️ Kişi eklemek İSTEĞE BAĞLI DEĞİL: webhook, tanımadığı numaradan gelen
 * mesajı KAYDETMEZ (adres herkese açık olduğu için her yabancı numaraya kayıt
 * açmak tabloyu çöple doldururdu). Yani kişi listede yoksa cevabı da hiç
 * görünmez.
 */
export function ContactForm({ contact, onClose }: { contact?: ContactRow; onClose: () => void }) {
  const [bekliyor, basla] = useTransition();
  const [hata, setHata] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: contact?.name ?? "",
    phone: contact?.phone ? `+${contact.phone}` : "",
    label: contact?.label ?? "",
    isActive: contact?.isActive ?? true,
  });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{contact ? "Kişiyi düzenle" : "Yeni kişi"}</h3>
        <button type="button" onClick={onClose} aria-label="Kapat">
          <X size={16} className="text-[var(--text-tertiary)]" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-[var(--text-secondary)]">İsim</span>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Depo — Ahmet"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[var(--text-secondary)]">Telefon</span>
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="0532 111 22 33"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[var(--text-secondary)]">Etiket</span>
          <Input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="depocu / müdür / kurye"
          />
        </label>
        <label className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span className="text-[13px]">Aktif</span>
        </label>
      </div>

      {/* Numara biçimi kullanıcıyı en çok yakan yer; beklentiyi önceden söyle. */}
      <p className="text-xs text-[var(--text-tertiary)]">
        Numarayı istediğiniz gibi yazın — boşluklu, <code>+90</code>&apos;lı ya da{" "}
        <code>0</code>&apos;lı. Kaydederken tek biçime çevrilir.
      </p>

      {hata && <p className="text-xs text-[var(--danger)]">{hata}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={bekliyor}
          onClick={() =>
            basla(async () => {
              setHata(null);
              const r = await saveContactAction(contact?.id ?? null, form);
              if (r.ok) onClose();
              else setHata(r.message ?? "Kaydedilemedi.");
            })
          }
        >
          {bekliyor ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {contact && (
          <Button
            variant="danger"
            disabled={bekliyor}
            onClick={() =>
              basla(async () => {
                setHata(null);
                const r = await deleteContactAction(contact.id);
                if (r.ok) onClose();
                // Mesaj geçmişi olan kişi silinemez (FK RESTRICT) — sebebi
                // yaz, yoksa kullanıcı butonun bozuk olduğunu sanar.
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

export function AddContactButton() {
  const [acik, setAcik] = useState(false);
  if (acik) return <ContactForm onClose={() => setAcik(false)} />;
  return (
    <Button variant="secondary" onClick={() => setAcik(true)}>
      <UserPlus size={14} /> Kişi ekle
    </Button>
  );
}
