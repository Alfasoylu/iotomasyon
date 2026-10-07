"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const LABEL: Record<string, string> = {
  disabled: "Monitor kapalı (AI_CFO_MONITOR_ENABLED) — hiçbir şey yazılmadı.",
  too_early: "Sabah özeti 09:30 İstanbul'dan önce çalışmaz.",
  locked: "Başka bir çalışma sürüyor.", duplicate: "Bu dönem için zaten çalıştı.",
  no_actionable_anomaly: "Gönderilecek yeni bulgu yok; model çağrılmadı.", ai_disabled: "Deterministik kayıt alındı; AI kapalı.",
  release_gates_pending: "Deterministik kayıt alındı; yayın kapıları bekliyor.", provider_unavailable: "Sağlayıcı yapılandırılmadı; model çağrılmadı.",
  completed: "Tamamlandı (reddedilen içgörü varsa nedeni parantez içinde).", invalid_output: "Model çıktısındaki içgörülerin hiçbiri denetimden geçmedi; içgörü kaydedilmedi.", failed: "Çalışma tamamlanamadı.",
};

export function RunButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const run = async (action: "monitor" | "morning") => {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/admin/ai-cfo/runner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await res.json().catch(() => ({}));
      setMessage(data.status ? `${LABEL[data.status] ?? data.status}${data.error ? ` (${data.error})` : ""}` : `Çalıştırılamadı (${data.error ?? res.status}).`);
      router.refresh();
    } catch { setMessage("Çalıştırılamadı."); } finally { setBusy(false); }
  };
  return <div className="flex flex-wrap items-center gap-2">
    <Button disabled={busy} onClick={() => run("monitor")}>Monitor&apos;ü şimdi çalıştır</Button>
    <Button disabled={busy} variant="secondary" onClick={() => run("morning")}>Sabah özetini çalıştır</Button>
    {message && <span className="text-sm">{message}</span>}
  </div>;
}
