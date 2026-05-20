"use client";

import { useEffect, useState } from "react";
import { LayoutList, AlignJustify } from "lucide-react";

const STORAGE_KEY = "iotomasyon.customers.density";

/**
 * Phase 95h — Density Toggle
 *
 * Compact ↔ Comfortable arası geçiş. localStorage'da kaydedilir.
 * Liste row'larının padding'i azaltır/artırır.
 *
 * Implementation:
 *   - State: localStorage'da "compact" | "comfortable"
 *   - <body> tag'ine `data-density="..."` ekler
 *   - CSS: [data-density="compact"] [data-customer-row] { @apply py-2; }
 */
export function DensityToggle() {
  const [density, setDensity] = useState<"compact" | "comfortable">("comfortable");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "compact" || saved === "comfortable") {
      setDensity(saved);
    }
  }, []);

  useEffect(() => {
    document.body.dataset.density = density;
    window.localStorage.setItem(STORAGE_KEY, density);
  }, [density]);

  function toggle() {
    setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
      title={density === "compact" ? "Rahat görünüm (Comfortable)" : "Sıkışık görünüm (Compact)"}
    >
      {density === "compact" ? <LayoutList className="h-3.5 w-3.5" /> : <AlignJustify className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{density === "compact" ? "Sıkışık" : "Rahat"}</span>
    </button>
  );
}
