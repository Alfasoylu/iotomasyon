import type { ReactNode } from "react";

interface AbbrProps {
  /** Açılım — hover ile gösterilen tooltip metni */
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Kısaltma tooltip bileşeni.
 *
 * Tüm tablo/UI'larda T30G, ROI, KDV gibi kısaltmalar için kullanılır.
 * Hover'da (desktop) veya tap'te (mobile via :focus) açılımı gösterir.
 *
 * ```tsx
 * <Abbr title="Son 30 Gün — Trendyol satış adedi">T30G</Abbr>
 * <Abbr title="Yatırım getirisi (Return on Investment)">ROI</Abbr>
 * ```
 *
 * HTML <abbr> tag'i kullanır — semantik ve erişilebilir.
 */
export function Abbr({ title, children, className = "" }: AbbrProps) {
  return (
    <abbr
      title={title}
      className={`cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2 ${className}`}
    >
      {children}
    </abbr>
  );
}
