import Link from "next/link";
import { Phone, Moon, Sparkles, FileText, Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { CohortCounts, CohortKey } from "@/services/customer-cohort-service";

const CARDS: Array<{
  key: CohortKey;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "danger" | "warning" | "success" | "info" | "violet";
}> = [
  {
    key: "queue",
    title: "Sıralı Arama",
    hint: "Akıllı sıralı — telefonu olan + sıcak",
    icon: Zap,
    tone: "violet",
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
    tone: "warning",
  },
  {
    key: "new",
    title: "Yeni Fırsatlar",
    hint: "son 7g eklenmiş, aranmamış",
    icon: Sparkles,
    tone: "success",
  },
  {
    key: "openQuotes",
    title: "Açık Teklifler",
    hint: "7g+ bekleyen QUOTED",
    icon: FileText,
    tone: "info",
  },
];

const TONE_STYLES = {
  violet: {
    card: "border-violet-200 bg-violet-50",
    icon: "text-violet-600",
    iconBg: "bg-violet-100",
    value: "text-violet-700",
  },
  danger: {
    card: "border-rose-200 bg-rose-50",
    icon: "text-rose-600",
    iconBg: "bg-rose-100",
    value: "text-rose-700",
  },
  warning: {
    card: "border-amber-200 bg-amber-50",
    icon: "text-amber-600",
    iconBg: "bg-amber-100",
    value: "text-amber-700",
  },
  success: {
    card: "border-emerald-200 bg-emerald-50",
    icon: "text-emerald-600",
    iconBg: "bg-emerald-100",
    value: "text-emerald-700",
  },
  info: {
    card: "border-blue-200 bg-blue-50",
    icon: "text-blue-600",
    iconBg: "bg-blue-100",
    value: "text-blue-700",
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
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
        <Phone className="h-3.5 w-3.5" />
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
              className={`block transition ${isActive ? "ring-2 ring-slate-900" : ""}`}
            >
              <Card className={`${s.card} p-4 hover:shadow-md transition-shadow`}>
                <div className="flex items-start justify-between gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.iconBg}`}>
                    <Icon className={`h-4 w-4 ${s.icon}`} />
                  </div>
                  <p className={`text-2xl font-bold tabular-nums ${s.value}`}>
                    {value.toLocaleString("tr-TR")}
                  </p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
                {isActive && (
                  <p className="mt-1 text-[10px] font-semibold text-slate-900">
                    ✓ Aktif filtre — tıkla kapat
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
