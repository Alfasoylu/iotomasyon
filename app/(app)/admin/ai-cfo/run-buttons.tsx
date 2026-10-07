"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const LABEL: Record<string, string> = {
  disabled: "Monitor kapalı (AI_CFO_MONITOR_ENABLED) — hiçbir şey yazılmadı.",
  too_early: "Sabah özeti 09:30 İstanbul'dan önce çalışmaz.",
  locked: "Başka bir çalışma sürüyor.", duplicate: "Bu dönem için zaten çalıştı.",
  no_actionable_anomaly: "Gönderilecek yeni bulgu yok; model çağrılmadı.",
  open_task: "Bulgular için açık iş/soru var; model çağrılmadı.", cooldown: "Bulgular soğuma süresinde; model çağrılmadı.",
  data_quality_only: "Yalnız veri kalitesi bulgusu var (deterministik); model çağrılmadı.",
  no_material_change: "Önemli değişiklik yok; model çağrılmadı.", same_input: "Karar girdisi son değerlendirmeyle aynı; model çağrılmadı.",
  blocked_by_scheduled_limit: "Günlük planlı çağrı hakkı kullanıldı.", blocked_by_daily_limit: "Günlük çağrı sınırı doldu.",
  blocked_by_run_cost: "Koşu başı TL tavanı aşılırdı; çağrı yapılmadı.", blocked_by_daily_budget: "Günlük TL tavanı doldu.", blocked_by_budget: "Aylık bütçe doldu.",
  blocked_by_input_tokens: "Girdi sınırına sığmadı (paket küçültüldü ama yetmedi); çağrı yapılmadı.", ai_disabled: "Deterministik kayıt alındı; AI kapalı.",
  release_gates_pending: "Deterministik kayıt alındı; yayın kapıları bekliyor.", provider_unavailable: "Sağlayıcı yapılandırılmadı; model çağrılmadı.",
  completed: "Tamamlandı (reddedilen içgörü varsa nedeni parantez içinde).", invalid_output: "Model çıktısındaki içgörülerin hiçbiri denetimden geçmedi; içgörü kaydedilmedi.", failed: "Çalışma tamamlanamadı.",
};

export function RunButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const run = async (action: "monitor" | "morning" | "deep_review") => {
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
    <Button disabled={busy} variant="secondary" onClick={() => { if (confirm("Derin inceleme el kitabının tamamını gönderir (~25.000 token, ~5 TL). Devam edilsin mi?")) run("deep_review"); }}>Derin inceleme (elle)</Button>
    {message && <span className="text-sm">{message}</span>}
  </div>;
}
