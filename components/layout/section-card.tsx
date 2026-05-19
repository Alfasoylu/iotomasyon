import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";

export type SectionTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_STYLES: Record<SectionTone, { card: string; iconBg: string; iconColor: string; subtitle: string }> = {
  neutral: {
    card: "border-slate-200 bg-white",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-700",
    subtitle: "text-slate-500",
  },
  info: {
    card: "border-blue-200 bg-blue-50/40",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
    subtitle: "text-blue-700/70",
  },
  success: {
    card: "border-emerald-200 bg-emerald-50/40",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
    subtitle: "text-emerald-700/70",
  },
  warning: {
    card: "border-amber-200 bg-amber-50/40",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    subtitle: "text-amber-700/70",
  },
  danger: {
    card: "border-rose-200 bg-rose-50/40",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-700",
    subtitle: "text-rose-700/70",
  },
};

interface SectionCardProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  tone?: SectionTone;
  /** Sağ tarafta detay linki ("[Detay →]") */
  href?: string;
  hrefLabel?: string;
  /** Header'ın sağında ek rozet/aksiyon */
  rightSlot?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Section başlığı + içerik için tutarlı kart bileşeni.
 *
 * - Icon + title + subtitle (ne için kullanılıyor)
 * - Sağ tarafta "Detay →" linki veya ek slot
 * - Tone'lara göre renk (neutral/info/success/warning/danger)
 *
 * ```tsx
 * <SectionCard
 *   icon={ShoppingCart}
 *   title="Pazaryerleri"
 *   subtitle="Bu hafta net kâr ve satış adetleri"
 *   tone="info"
 *   href="/marketplace"
 *   hrefLabel="Detay"
 * >
 *   ...
 * </SectionCard>
 * ```
 */
export function SectionCard({
  icon: Icon,
  title,
  subtitle,
  tone = "neutral",
  href,
  hrefLabel = "Detay",
  rightSlot,
  className = "",
  children,
}: SectionCardProps) {
  const styles = TONE_STYLES[tone];

  return (
    <Card className={`overflow-hidden p-0 ${styles.card} ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-current/10 px-5 py-4">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div
              className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg ${styles.iconBg}`}
            >
              <Icon className={`h-4 w-4 ${styles.iconColor}`} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {subtitle && (
              <p className={`mt-0.5 text-xs ${styles.subtitle}`}>{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {rightSlot}
          {href && (
            <Link
              href={href}
              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              {hrefLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </Card>
  );
}
