"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveXmlSourceAction,
  deleteXmlSourceAction,
  triggerXmlSyncAction,
} from "@/lib/actions/xml-sync-actions";

type Source = {
  id: string;
  name: string;
  url: string;
  isEnabled: boolean;
  authHeader: string | null;
  lastSyncAt: Date | null;
  lastStatus: string | null;
};

export function XmlSyncForm({ source }: { source?: Source }) {
  const router = useRouter();
  const [name, setName] = useState(source?.name ?? "");
  const [url, setUrl] = useState(source?.url ?? "");
  const [authHeader, setAuthHeader] = useState(source?.authHeader ?? "");
  const [isEnabled, setIsEnabled] = useState(source?.isEnabled ?? true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function handleSave() {
    setPending(true);
    setMessage(null);
    startTransition(async () => {
      const result = await saveXmlSourceAction(source?.id ?? null, name, url, isEnabled, authHeader);
      setPending(false);
      if (result.ok) {
        setMessage({ ok: true, text: "Kaynak kaydedildi." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.message ?? "Kayıt başarısız." });
      }
    });
  }

  function handleDelete() {
    if (!source?.id) return;
    if (!confirm("Bu kaynağı silmek istediğinizden emin misiniz?")) return;
    setPending(true);
    startTransition(async () => {
      const result = await deleteXmlSourceAction(source.id);
      setPending(false);
      if (result.ok) {
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.message ?? "Silme başarısız." });
      }
    });
  }

  function handleSync() {
    if (!source?.id) return;
    setPending(true);
    setMessage(null);
    startTransition(async () => {
      const result = await triggerXmlSyncAction(source.id);
      setPending(false);
      setMessage({ ok: result.ok, text: result.message ?? (result.ok ? "Senkronizasyon tamamlandı." : "Hata oluştu.") });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Kaynak adı
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Entegra XML" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            XML URL
          </label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Yetkilendirme başlığı (opsiyonel)
          </label>
          <Input
            value={authHeader}
            onChange={(e) => setAuthHeader(e.target.value)}
            placeholder="Bearer token veya Basic auth değeri"
            className="font-mono"
          />
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
        />
        Otomatik senkronizasyon aktif
      </label>

      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>
          {message.ok ? "✓" : "⚠"} {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Kaydediliyor..." : source ? "Değişiklikleri kaydet" : "Kaynak ekle"}
        </Button>
        {source && (
          <>
            <Button onClick={handleSync} disabled={pending} variant="secondary">
              {pending ? "Senkronize ediliyor..." : "Şimdi senkronize et"}
            </Button>
            <Button onClick={handleDelete} disabled={pending} variant="secondary">
              Kaynağı sil
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// Compact "add new" form (no existing source)
export function NewXmlSourceForm() {
  return <XmlSyncForm />;
}
