import type { ReactNode } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

import { Card } from "@/components/ui/card";

export type KpiTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_STYLES: Record<KpiTone, { card: string; label: string; value: string }> = {
  neutral: {
    card: "border-slate-200 bg-white",
    label: "text-slate-500",
    value: "text-slate-900",
  },
  info: {
    card: "border-blue-200 bg-blue-50/40",
    label: "text-blue-700",
    value: "text-blue-700",
  },
  success: {
    card: "border-emerald-200 bg-emerald-50/40",
    label: "text-emerald-700",
    value: "text-emerald-700",
  },
  warning: {
    card: "border-amber-200 bg-amber-50/40",
    label: "text-amber-700",
    value: "text-amber-700",
  },
  danger: {
    card: "border-rose-200 bg-rose-50/40",
    label: "text-rose-700",
    value: "text-rose-700",
  },
};

export interface KpiDelta {
  /** Görüntülenecek değişim metni (örn. "+12% bu ay") */
  text: string;
  /** Yönü: up = artış (yeşil), down = azalış (kırmızı), flat = nötr */
  direction?: "up" | "down" | "flat";
}

interface KpiCardProps {
  /** Üstte küçük etiket (örn. "BAĞLI SERMAYE") */
  label: string;
  /** Manşet değer */
  value: string;
  /** Alt açıklama / yardımcı bilgi */
  hint?: ReactNode;
  /** Sayfa rengi tonu */
  tone?: KpiTone;
  /** Değişim rozeti (▲/▼/·) */
  delta?: KpiDelta;
  /** Tıklanırsa detay sayfasına git */
  href?: string;
  className?: string;
}

/**
 * KPI manşet kartı — tutarlı format.
 *
 * - Label (uppercase küçük başlık)
 * - Value (büyük tabular sayı)
 * - Hint (1 satır altyazı)
 * - Delta (opsiyonel — ▲/▼ + %X)
 * - Renk tonları: success (yeşil), info (mavi), warning (amber), danger (kırmızı), neutral (gri)
 *
 * ```tsx
 * <KpiCard
 *   label="Aylık Beklenen Nakit"
 *   value="$7,250"
 *   tone="success"
 *   hint="net kâr (kargo+komisyon sonrası)"
 *   delta={{ text: "+12.4% bu ay", direction: "up" }}
 *   href="/admin/sermaye-saglik"
 * />
 * ```
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  delta,
  href,
  className = "",
}: KpiCardProps) {
  const s = TONE_STYLES[tone];

  const content = (
    <Card className={`p-5 transition-all ${s.card} ${href ? "hover:shadow-md cursor-pointer" : ""} ${className}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${s.label}`}>
        {label}
      </p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${s.value}`}>
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">{hint}</p>
      )}
      {delta && <DeltaBadge delta={delta} className="mt-1.5" />}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function DeltaBadge({ delta, className = "" }: { delta: KpiDelta; className?: string }) {
  const direction = delta.direction ?? "flat";
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const toneClass = {
    up: "text-emerald-600",
    down: "text-rose-600",
    flat: "text-slate-400",
  }[direction];
  return (
    <p className={`flex items-center gap-1 text-xs font-medium ${toneClass} ${className}`}>
      <Icon className="h-3 w-3" />
      {delta.text}
    </p>
  );
}
