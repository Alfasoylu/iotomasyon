import Link from "next/link";
import { Phone, Moon, Sparkles, FileText, Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { CohortCounts, CohortKey } from "@/services/customer-cohort-service";

type CohortTone = "accent" | "danger" | "warn" | "ok" | "info";

const CARDS: Array<{
  key: CohortKey;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  tone: CohortTone;
}> = [
  {
    key: "queue",
    title: "Sıralı Arama",
    hint: "Akıllı sıralı — telefonu olan + sıcak",
    icon: Zap,
    tone: "accent",
  },
  {
    key: "todayCall",
    title: "Bugün Ara",
    hint: "vadesi gelen görevler",
    icon: Phone,
    tone: "danger",
  },
  {
    key: "dormant",
    title: "Uyuyan Müşteriler",
    hint: "60g+ contact yok, satışı var",
    icon: Moon,
    tone: "warn",
  },
  {
    key: "new",
    title: "Yeni Fırsatlar",
    hint: "son 7g eklenmiş, aranmamış",
    icon: Sparkles,
    tone: "ok",
  },
  {
    key: "openQuotes",
    title: "Açık Teklifler",
    hint: "7g+ bekleyen QUOTED",
    icon: FileText,
    tone: "info",
  },
];

const TONE_STYLES: Record<CohortTone, { card: string; icon: string; value: string }> = {
  accent: {
    card: "border-[var(--accent-border)] bg-[var(--accent-dim)]",
    icon: "text-[var(--accent)]",
    value: "text-[var(--accent)]",
  },
  danger: {
    card: "border-[var(--danger-border)] bg-[var(--danger-dim)]",
    icon: "text-[var(--danger)]",
    value: "text-[var(--danger)]",
  },
  warn: {
    card: "border-[var(--warn-border)] bg-[var(--warn-dim)]",
    icon: "text-[var(--warn)]",
    value: "text-[var(--warn)]",
  },
  ok: {
    card: "border-[var(--ok-border)] bg-[var(--ok-dim)]",
    icon: "text-[var(--ok)]",
    value: "text-[var(--ok)]",
  },
  info: {
    card: "border-[var(--info-border)] bg-[var(--info-dim)]",
    icon: "text-[var(--info)]",
    value: "text-[var(--info)]",
  },
};

export function CustomerCohortCards({
  counts,
  activeCohort,
}: {
  counts: CohortCounts;
  activeCohort: CohortKey | null;
}) {
  const valueByKey: Record<CohortKey, number> = {
    queue: 30, // top 30 smart-sorted (sabit gösterim)
    todayCall: counts.todayCall,
    dormant: counts.dormant,
    new: counts.newOpportunities,
    openQuotes: counts.openQuotes,
  };

  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        <Phone size={14} strokeWidth={1.5} />
        Bugün Senin İçin
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {CARDS.map(({ key, title, hint, icon: Icon, tone }) => {
          const s = TONE_STYLES[tone];
          const value = valueByKey[key];
          const isActive = activeCohort === key;
          return (
            <Link
              key={key}
              href={isActive ? "/customers" : `/customers?cohort=${key}`}
              className={`block transition ${isActive ? "ring-1 ring-[var(--border-strong)]" : ""}`}
            >
              <Card className={`${s.card} p-4 transition-colors`}>
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] ${s.icon}`}
                  >
                    <Icon size={14} strokeWidth={1.5} />
                  </div>
                  <p className={`font-mono text-2xl font-semibold tabular-nums ${s.value}`}>
                    {value.toLocaleString("tr-TR")}
                  </p>
                </div>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{hint}</p>
                {isActive && (
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                    Aktif filtre — tıkla kapat
                  </p>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
