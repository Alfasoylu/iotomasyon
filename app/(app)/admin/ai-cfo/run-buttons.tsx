"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const LABEL: Record<string, string> = {
  disabled: "Motor kapalı (AI_CFO_MONITOR_ENABLED) — hiçbir şey yazılmadı.",
  locked: "Başka bir koşu sürüyor.", duplicate: "Bu 20 dakikalık dilimde zaten çalıştı.",
  completed: "Tamamlandı: bulgular ve cfo_gun_ozeti güncellendi.", failed: "Koşu tamamlanamadı.",
};

export function RunButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/admin/ai-cfo/runner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "engine" }) });
      const data = await res.json().catch(() => ({}));
      setMessage(data.status ? `${LABEL[data.status] ?? data.status}${data.findings != null ? ` · ${data.findings} bulgu` : ""}${data.error ? ` (${data.error})` : ""}` : `Çalıştırılamadı (${data.error ?? res.status}).`);
      router.refresh();
    } catch { setMessage("Çalıştırılamadı."); } finally { setBusy(false); }
  };
  return <div className="flex flex-wrap items-center gap-2">
    <Button disabled={busy} onClick={run}>Motoru şimdi çalıştır</Button>
    {message && <span className="text-sm">{message}</span>}
  </div>;
}
