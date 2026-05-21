import type { ReactNode } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type KpiTone = "neutral" | "info" | "success" | "warning" | "danger";

const VALUE_COLOR: Record<KpiTone, string> = {
  neutral: "var(--text-primary)",
  info: "var(--info)",
  success: "var(--ok)",
  warning: "var(--warn)",
  danger: "var(--danger)",
};

export interface KpiDelta {
  /** Görüntülenecek değişim metni (örn. "+12% bu ay") */
  text: string;
  /** Yönü: up = artış (yeşil), down = azalış (kırmızı), flat = nötr */
  direction?: "up" | "down" | "flat";
}

interface KpiCardProps {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: KpiTone;
  delta?: KpiDelta;
  href?: string;
  className?: string;
}

/**
 * KPI manşet kartı — tutarlı format.
 *
 * Industrial-minimal: surface-2 + border-default. `tone` sadece
 * büyük sayının rengini etkiler — kart bg tek tip kalır.
 *
 * Yeni componentler için: `MetricCard` (Lucide icon + status).
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
  const valueColor = VALUE_COLOR[tone];

  const content = (
    <div
      className={`rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4 transition-colors ${
        href ? "hover:border-[var(--border-strong)]" : ""
      } ${className}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className="mt-2 text-[24px] font-semibold leading-none tabular-nums"
        style={{ color: valueColor }}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)] leading-relaxed">{hint}</p>
      )}
      {delta && <DeltaBadge delta={delta} className="mt-1.5" />}
    </div>
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
  const toneColor =
    direction === "up"
      ? "var(--ok)"
      : direction === "down"
        ? "var(--danger)"
        : "var(--text-muted)";
  return (
    <p
      className={`flex items-center gap-1 text-[12px] font-medium ${className}`}
      style={{ color: toneColor }}
    >
      <Icon size={12} strokeWidth={1.5} />
      {delta.text}
    </p>
  );
}
