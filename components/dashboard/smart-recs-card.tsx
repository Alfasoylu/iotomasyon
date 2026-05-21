import Link from "next/link";
import {
  Sparkles,
  Star,
  AlertCircle,
  Package,
  TrendingDown,
  UserX,
  HelpCircle,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import type { RecKind, RecSeverity, SmartRec } from "@/lib/smart-recommendations";

const KIND_ICONS: Record<RecKind, LucideIcon> = {
  star: Star,
  urgent: AlertCircle,
  dead: Package,
  liquidation: TrendingDown,
  dormant: UserX,
  "missing-data": HelpCircle,
};

const SEVERITY_STYLES: Record<RecSeverity, { row: string; iconWrap: string }> = {
  success: {
    row: "hover:bg-[var(--ok-dim)]",
    iconWrap:
      "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]",
  },
  info: {
    row: "hover:bg-[var(--info-dim)]",
    iconWrap:
      "border-[var(--info-border)] bg-[var(--info-dim)] text-[var(--info)]",
  },
  warning: {
    row: "hover:bg-[var(--warn-dim)]",
    iconWrap:
      "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]",
  },
  danger: {
    row: "hover:bg-[var(--danger-dim)]",
    iconWrap:
      "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]",
  },
};

/**
 * Dashboard'da "Bugün Senin İçin Akıllı Öneriler" kartı.
 *
 * Her öneri tıklanır (ilgili sayfaya gider). Kategori ikonu ile severity'ye göre
 * renk kodlu.
 */
export function SmartRecsCard({ recs }: { recs: SmartRec[] }) {
  if (recs.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-muted)]">
            <Sparkles size={18} strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Bugün için öneri yok</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Tüm metrikler iyi durumda. Sermaye Sağlığı panosuna detay için bakabilirsin.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border-default)] bg-[var(--surface-1)] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles size={14} strokeWidth={1.5} className="text-[var(--accent)]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Bugün Senin İçin Akıllı Öneriler
          </h3>
          <span className="rounded border border-[var(--border-subtle)] bg-[var(--surface-3)] px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-[var(--text-secondary)]">
            {recs.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Sistem önerileri — tıkla, ilgili sayfaya git, kararı sen ver.
        </p>
      </div>

      <ul className="divide-y divide-[var(--border-subtle)]">
        {recs.map((rec) => {
          const Icon = KIND_ICONS[rec.kind];
          const styles = SEVERITY_STYLES[rec.severity];
          return (
            <li key={rec.id}>
              <Link
                href={rec.href}
                className={`group flex items-start gap-3 px-5 py-3 transition-colors ${styles.row}`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border ${styles.iconWrap}`}
                >
                  <Icon size={14} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{rec.title}</p>
                  {rec.detail && (
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{rec.detail}</p>
                  )}
                </div>
                <ArrowRight
                  size={14}
                  strokeWidth={1.5}
                  className="mt-1 flex-shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)]"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
