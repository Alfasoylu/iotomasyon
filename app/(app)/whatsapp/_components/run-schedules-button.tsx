"use client";

import { useState, useTransition } from "react";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { runSchedulesNowAction } from "@/lib/actions/whatsapp-actions";

/**
 * Zamanlanmış görevleri şimdi çalıştır.
 *
 * NEDEN VAR: "görev tanımlı" olması mesajın gittiğini KANITLAMAZ. Harici
 * zamanlayıcı kurulmadıysa hiçbir şey çalışmaz ve bu sessizdir; bu düğme
 * kurulumu beklemeden boru hattını doğrular. Mükerrer freni aynen işler —
 * bugün gönderilmiş görev yeniden gitmez.
 */
export function RunSchedulesButton() {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {sonuc && <span className="text-xs text-[var(--text-secondary)]">{sonuc}</span>}
      <Button
        type="button"
        variant="secondary"
        disabled={bekliyor}
        onClick={() =>
          basla(async () => {
            const r = await runSchedulesNowAction();
            setSonuc(r.message ?? (r.ok ? "Çalıştırıldı." : "Başarısız."));
          })
        }
      >
        <Play size={14} />
        {bekliyor ? "Çalışıyor…" : "Görevleri şimdi çalıştır"}
      </Button>
    </div>
  );
}
