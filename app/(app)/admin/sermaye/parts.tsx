// /admin/sermaye ortak görsel parçaları (eski /admin/sermaye-saglik ve /admin/capital sayfalarından taşındı).

import type { ReactNode } from "react";
import Link from "next/link";
import { Star, CircleDot, CircleAlert, Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CsvDownloadButton } from "@/components/admin/csv-download-button";

export function fmtTry(n: number, decimals = 0): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: decimals }).format(n);
}

export function fmtPct(n: number, decimals = 1): string {
  return `%${n.toFixed(decimals)}`;
}

export function fmtDelta(curr: number, prev: number): { text: string; tone: "up" | "down" | "flat" } {
  if (prev === 0 && curr === 0) return { text: "—", tone: "flat" };
  if (prev === 0) return { text: "yeni", tone: "up" };
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return { text: "≈ aynı", tone: "flat" };
  const sign = pct > 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(1)}% önceki 30 güne göre`, tone: pct > 0 ? "up" : "down" };
}

// ── Metric tile (KPI) ──────────────────────────────────────────────────────

export function MetricTile({
  label,
  value,
  sub,
  subSlot,
  valueColor = "text-[var(--text-primary)]",
}: {
  label: string;
  value: string;
  sub?: string;
  subSlot?: ReactNode;
  valueColor?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </p>
      <p className={`mt-2 text-[28px] leading-tight font-semibold tabular-nums ${valueColor}`}>
        {value}
      </p>
      {subSlot ?? (sub && <p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p>)}
    </Card>
  );
}

// ── Delta rozeti ────────────────────────────────────────────────────────────

export function DeltaBadge({
  delta,
  className,
}: {
  delta: { text: string; tone: "up" | "down" | "flat" };
  className?: string;
}) {
  const toneClass = {
    up: "text-[var(--ok)]",
    down: "text-[var(--danger)]",
    flat: "text-[var(--text-muted)]",
  }[delta.tone];
  const arrow = delta.tone === "up" ? "▲" : delta.tone === "down" ? "▼" : "·";
  return (
    <p className={`text-xs font-medium tabular-nums ${toneClass} ${className ?? ""}`}>
      {arrow} {delta.text}
    </p>
  );
}

// ── Aksiyon listesi bileşeni ────────────────────────────────────────────────

export interface Row {
  id: string;
  /** Ürün kartı yoksa (ör. CFO ölü stok satırı katalogla eşleşmedi) bağlantısız gösterilir. */
  href?: string | null;
  primary: string;
  secondary: string;
  valueLabel: string;
  value: string;
  meta?: string;
}

export interface CsvSpec {
  filename: string;
  columns: Array<{ header: string; key: string }>;
  rows: Array<Record<string, string | number>>;
}

export function ActionList({
  title,
  subtitle,
  color,
  rows,
  csv,
  emptyMsg,
}: {
  title: string;
  subtitle: string;
  color: "emerald" | "amber" | "red" | "orange";
  rows: Row[];
  csv: CsvSpec;
  emptyMsg: string;
}) {
  const headerColors = {
    emerald: "text-[var(--ok)]",
    amber: "text-[var(--warn)]",
    red: "text-[var(--danger)]",
    orange: "text-[var(--warn)]",
  }[color];
  const HeaderIcon = {
    emerald: Star,
    amber: CircleDot,
    red: CircleAlert,
    orange: Circle,
  }[color];

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] bg-[var(--surface-1)] px-5 py-3">
        <div className="min-w-0 flex-1">
          <h3 className={`inline-flex items-center gap-1.5 text-sm font-semibold ${headerColors}`}>
            <HeaderIcon size={14} strokeWidth={1.5} />
            {title}
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">{subtitle}</p>
          {csv.rows.length > rows.length && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              Görüntüde ilk {rows.length} satır · CSV&apos;de {csv.rows.length} satır
            </p>
          )}
        </div>
        <CsvDownloadButton
          filename={csv.filename}
          columns={csv.columns}
          rows={csv.rows}
        />
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">{emptyMsg}</p>
        ) : (
          rows.map((r) => (
            <RowShell key={r.id} href={r.href === undefined ? `/products/${r.id}` : r.href}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={r.primary}>
                    {r.primary}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate font-mono">{r.secondary}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-sm font-semibold tabular-nums font-mono ${headerColors}`}>{r.value}</p>
                  <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{r.valueLabel}</p>
                </div>
              </div>
              {r.meta && (
                <p className="mt-1 text-[10px] text-[var(--text-muted)] tabular-nums">{r.meta}</p>
              )}
            </RowShell>
          ))
        )}
      </div>
    </Card>
  );
}

function RowShell({ href, children }: { href: string | null; children: ReactNode }) {
  const cls = "block px-5 py-2.5 hover:bg-[var(--surface-3)] transition";
  return href ? <Link href={href} className={cls}>{children}</Link> : <div className={cls}>{children}</div>;
}

export function SummaryCard({ label, value, highlight, subtitle }: { label: string; value: string; highlight?: boolean; subtitle?: string }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight
          ? "border-[var(--accent-border)] bg-[var(--accent-dim)]"
          : "border-[var(--border-default)] bg-[var(--surface-2)]"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p
        className={`mt-2 text-[22px] font-semibold tabular-nums tracking-tight ${
          highlight ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </p>
      {subtitle && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
    </div>
  );
}
