import type { ReactNode } from "react";

type Variant = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

// Back-compat with old call sites that used `tone`.
type LegacyTone = "default" | "success" | "danger" | "warning";

const VARIANTS: Record<Variant, string> = {
  neutral:
    "bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
  accent:
    "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent-border)]",
  ok: "bg-[var(--ok-dim)] text-[var(--ok)] border-[var(--ok-border)]",
  warn: "bg-[var(--warn-dim)] text-[var(--warn)] border-[var(--warn-border)]",
  danger:
    "bg-[var(--danger-dim)] text-[var(--danger)] border-[var(--danger-border)]",
  info: "bg-[var(--info-dim)] text-[var(--info)] border-[var(--info-border)]",
};

const LEGACY_MAP: Record<LegacyTone, Variant> = {
  default: "neutral",
  success: "ok",
  danger: "danger",
  warning: "warn",
};

interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
  /** @deprecated use `variant` */
  tone?: LegacyTone;
  className?: string;
}

export function Badge({ children, variant, tone, className = "" }: BadgeProps) {
  const v = variant ?? (tone ? LEGACY_MAP[tone] : "neutral");
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium border ${VARIANTS[v]} ${className}`}
    >
      {children}
    </span>
  );
}
