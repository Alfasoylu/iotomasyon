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

const SEVERITY_STYLES: Record<RecSeverity, { row: string; iconBg: string; iconColor: string }> = {
  success: {
    row: "hover:bg-emerald-50/60",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
  },
  info: {
    row: "hover:bg-blue-50/60",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
  },
  warning: {
    row: "hover:bg-amber-50/60",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
  },
  danger: {
    row: "hover:bg-rose-50/60",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-700",
  },
};

/**
 * Dashboard'da "🎯 Bugün Senin İçin Akıllı Öneriler" kartı.
 *
 * Her öneri tıklanır (ilgili sayfaya gider). Kategori ikonu ile severity'ye göre
 * renk kodlu.
 */
export function SmartRecsCard({ recs }: { recs: SmartRec[] }) {
  if (recs.length === 0) {
    return (
      <Card className="border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <Sparkles className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Bugün için öneri yok</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Tüm metrikler iyi durumda. Sermaye Sağlığı panosuna detay için bakabilirsin.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-white p-0">
      <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50 to-blue-50 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-900">
            🎯 Bugün Senin İçin Akıllı Öneriler
          </h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {recs.length} öneri
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-600">
          Sistem önerileri — tıkla, ilgili sayfaya git, kararı sen ver.
        </p>
      </div>

      <ul className="divide-y divide-slate-100">
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
                  className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg ${styles.iconBg}`}
                >
                  <Icon className={`h-4 w-4 ${styles.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{rec.title}</p>
                  {rec.detail && (
                    <p className="mt-0.5 text-xs text-slate-500">{rec.detail}</p>
                  )}
                </div>
                <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
