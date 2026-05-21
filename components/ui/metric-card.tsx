import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type MetricStatus = "neutral" | "ok" | "warn" | "danger" | "info";

const STATUS_COLOR: Record<MetricStatus, string> = {
  neutral: "var(--text-muted)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
};

const DELTA_COLOR: Record<"up" | "down" | "flat", string> = {
  up: "text-[var(--ok)]",
  down: "text-[var(--danger)]",
  flat: "text-[var(--text-muted)]",
};

export interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  icon?: LucideIcon;
  href?: string;
  status?: MetricStatus;
  /** Optional small descriptor under the value. */
  hint?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  delta,
  icon: Icon,
  href,
  status = "neutral",
  hint,
  className = "",
}: MetricCardProps) {
  const statusColor = STATUS_COLOR[status];

  const body = (
    <div
      className={`flex h-full flex-col justify-between gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4 transition-colors ${
        href ? "hover:border-[var(--border-strong)]" : ""
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          {label}
        </span>
        {Icon ? <Icon size={14} color={statusColor} strokeWidth={1.5} /> : null}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[28px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
            {value}
          </span>
          {unit ? (
            <span className="text-[13px] text-[var(--text-secondary)]">{unit}</span>
          ) : null}
        </div>
        {hint ? (
          <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>
        ) : null}
      </div>
      {delta ? (
        <span className={`text-[12px] font-medium ${DELTA_COLOR[delta.direction]}`}>
          {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "·"} {delta.value}
        </span>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }
  return body;
}
