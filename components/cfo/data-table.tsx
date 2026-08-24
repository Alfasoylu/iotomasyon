import type { ReactNode } from "react";

/**
 * CFO tabloları için ortak kabuk. Repoda ayrı bir tablo componenti yok;
 * mevcut düz HTML tablo kalıbı burada tek yerde toplanır.
 */
export function CfoTable({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          {head}
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">{children}</tbody>
      </table>
      {empty ? <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">{empty}</p> : null}
    </div>
  );
}

export function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 ${right ? "text-right" : "text-left"} whitespace-nowrap`}>{children}</th>;
}

export function Td({ children, right, strong, muted, danger }: {
  children: ReactNode; right?: boolean; strong?: boolean; muted?: boolean; danger?: boolean;
}) {
  const cls = [
    "px-3 py-2 align-top",
    right ? "text-right tabular-nums whitespace-nowrap" : "",
    strong ? "font-medium text-[var(--text-primary)]" : "",
    muted ? "text-[var(--text-muted)]" : "",
    danger ? "text-[var(--danger)]" : "",
  ].filter(Boolean).join(" ");
  return <td className={cls}>{children}</td>;
}
