import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";

export type SectionTone = "neutral" | "info" | "success" | "warning" | "danger";

const ICON_COLOR: Record<SectionTone, string> = {
  neutral: "var(--text-secondary)",
  info: "var(--info)",
  success: "var(--ok)",
  warning: "var(--warn)",
  danger: "var(--danger)",
};

interface SectionCardProps {
  icon?: React.ComponentType<{ className?: string; color?: string; size?: number; strokeWidth?: number }>;
  title: string;
  subtitle?: string;
  tone?: SectionTone;
  href?: string;
  hrefLabel?: string;
  rightSlot?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Section başlığı + içerik için tutarlı kart bileşeni.
 *
 * Industrial-minimal: tüm kartlar surface-2 + border-default.
 * `tone` artık sadece header icon rengini etkiler (vurgu için);
 * kartın kendisi tek tip görünür.
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
  const iconColor = ICON_COLOR[tone];

  return (
    <Card className={`overflow-hidden p-0 ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <Icon
              size={16}
              strokeWidth={1.5}
              color={iconColor}
              className="mt-0.5 flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {rightSlot}
          {href && (
            <Link
              href={href}
              className="flex items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-100"
            >
              {hrefLabel}
              <ArrowRight size={12} strokeWidth={1.5} />
            </Link>
          )}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </Card>
  );
}
