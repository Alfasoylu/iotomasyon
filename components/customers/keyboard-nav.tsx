"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";

/**
 * Phase 95g — Klavye Navigasyon + Yardım
 *
 * Liste sayfasında klavye kısayolları:
 *   J / ↓        sonraki müşteri (kart highlight + scroll)
 *   K / ↑        önceki müşteri
 *   Enter        seçili müşteri detayına git
 *   C            seçili müşteriyi telefonla ara (tel: link)
 *   W            seçili müşteri WhatsApp
 *   ?            kısayollar yardımı (modal)
 *   Escape       yardım kapat
 */
export function KeyboardNav() {
  const router = useRouter();
  const [focusIdx, setFocusIdx] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Form field içinde değilse aktif et
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      // Cmd/Ctrl ile birlikteyse modifier shortcut'dur (cmd palette), skip
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Müşteri kart linklerini bul (CustomerRow içinde detail link)
      const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>(
        'a[href^="/customers/"][class*="font-semibold"]'
      )).filter((a) => /\/customers\/[a-z0-9]+$/i.test(a.getAttribute("href") || ""));

      if (cards.length === 0) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => {
          const next = Math.min(cards.length - 1, i + 1);
          const card = cards[next];
          if (card) {
            // Highlight via ring + scroll
            cards.forEach((c) => c.closest("[data-customer-row]")?.classList.remove("ring-2", "ring-slate-900"));
            const row = card.closest("[data-customer-row]");
            if (row) {
              row.classList.add("ring-2", "ring-slate-900");
              row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => {
          const next = Math.max(0, i - 1);
          const card = cards[next];
          if (card) {
            cards.forEach((c) => c.closest("[data-customer-row]")?.classList.remove("ring-2", "ring-slate-900"));
            const row = card.closest("[data-customer-row]");
            if (row) {
              row.classList.add("ring-2", "ring-slate-900");
              row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
          return next;
        });
      } else if (e.key === "Enter" && focusIdx >= 0) {
        e.preventDefault();
        const card = cards[focusIdx];
        if (card) {
          const href = card.getAttribute("href");
          if (href) router.push(href);
        }
      } else if (e.key === "c" && focusIdx >= 0) {
        e.preventDefault();
        const row = cards[focusIdx]?.closest("[data-customer-row]");
        const tel = row?.querySelector('a[href^="tel:"]');
        if (tel) (tel as HTMLAnchorElement).click();
      } else if (e.key === "w" && focusIdx >= 0) {
        e.preventDefault();
        const row = cards[focusIdx]?.closest("[data-customer-row]");
        const wa = row?.querySelector('a[href*="wa.me"]');
        if (wa) (wa as HTMLAnchorElement).click();
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelp(true);
      } else if (e.key === "Escape") {
        setShowHelp(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIdx, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowHelp(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        title="Klavye kısayolları (?)"
      >
        <Keyboard className="h-3.5 w-3.5" />
        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px] font-mono">?</kbd>
      </button>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Keyboard className="h-4 w-4" />
                Klavye Kısayolları
              </h3>
              <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="space-y-2">
              {[
                ["⌘K / Ctrl+K", "Global komut paleti (her sayfa)"],
                ["J / ↓", "Sonraki müşteri (liste'de)"],
                ["K / ↑", "Önceki müşteri"],
                ["Enter", "Seçili müşteriyi aç (detay)"],
                ["C", "Seçili müşteriyi telefonla ara"],
                ["W", "Seçili müşteri WhatsApp"],
                ["?", "Bu yardımı aç"],
                ["Esc", "Modal/dropdown kapat"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-3 text-xs">
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                    {key}
                  </kbd>
                  <span className="flex-1 text-slate-600 text-right">{desc}</span>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
