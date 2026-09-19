import { CircleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { AlfasHata } from "@/lib/alfashome/client";

/**
 * ALFAS okuma hatası kartı — siparişler ve üyeler sayfalarının ORTAK kartı.
 *
 * NEDEN HATA GÖSTERİLİYOR, BOŞ TABLO DEĞİL: boş liste "hiç sipariş yok" /
 * "hiç üye yok" diye okunur ve yanlış karara yol açar (reklam panelinde aynı
 * gerekçe: lib/meta/ads.ts). Sebep ve çözüm adımı burada yazılı.
 *
 * NEDEN TEK BİLEŞEN: iki sayfada kopya durursa biri güncellenip öbürü
 * unutulur; kullanıcı iki sayfada iki farklı açıklama görürdü.
 */
export function AlfasBaglantiHatasi({ hata }: { hata: AlfasHata }) {
  return (
    <Card className="border-[var(--danger)] p-4">
      <div className="flex gap-3">
        <CircleAlert size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" />
        <div className="space-y-2 text-sm">
          <p className="font-medium">{hata.mesaj}</p>
          {hata.detay && (
            <p className="font-mono text-xs text-[var(--text-tertiary)]">{hata.detay}</p>
          )}
          <div className="space-y-1 text-xs text-[var(--text-secondary)]">
            <p>Kurulum iki tarafta yapılır:</p>
            <ul className="list-inside list-disc">
              <li>
                <strong>ALFAS</strong> (Railway → Variables): <code>CRM_API_TOKEN</code> — rastgele,
                en az 24 karakter. Kısa jeton bilerek reddedilir.
              </li>
              <li>
                <strong>Panel</strong> (Vercel → Environment Variables):{" "}
                <code>ALFASHOME_API_URL</code> (ör. <code>https://api.alfashome.com</code>) ve{" "}
                <code>ALFASHOME_API_TOKEN</code> — ALFAS&apos;a yazılan jetonun AYNISI.
              </li>
            </ul>
            <p className="pt-1">
              Uçlar salt okunurdur: panel ALFAS&apos;ta hiçbir şey değiştiremez.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
