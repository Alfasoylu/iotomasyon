import Link from "next/link";
import { AlertCircle, Calendar, CalendarDays, CheckCircle2 } from "lucide-react";
import type { TaskCohortCounts } from "@/services/task-service";

interface Props {
  counts: TaskCohortCounts;
  activeCohort: string | null;
}

export function TaskCohortCards({ counts, activeCohort }: Props) {
  const cards: Array<{
    key: string;
    title: string;
    hint: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
    activeBg: string;
    inactiveBg: string;
    textColor: string;
  }> = [
    {
      key: "overdue",
      title: "Gecikmiş",
      hint: "vadesi geçmiş",
      count: counts.overdue,
      icon: AlertCircle,
      activeBg: "bg-rose-600 text-white",
      inactiveBg: "bg-rose-50 text-rose-900 hover:bg-rose-100",
      textColor: "text-rose-700",
    },
    {
      key: "today",
      title: "Bugün",
      hint: "bugün vade",
      count: counts.today,
      icon: Calendar,
      activeBg: "bg-amber-600 text-white",
      inactiveBg: "bg-amber-50 text-amber-900 hover:bg-amber-100",
      textColor: "text-amber-700",
    },
    {
      key: "week",
      title: "Bu Hafta",
      hint: "gelecek 7 gün",
      count: counts.week,
      icon: CalendarDays,
      activeBg: "bg-blue-600 text-white",
      inactiveBg: "bg-blue-50 text-blue-900 hover:bg-blue-100",
      textColor: "text-blue-700",
    },
    {
      key: "done",
      title: "Tamamlandı",
      hint: "son 30 gün",
      count: counts.done,
      icon: CheckCircle2,
      activeBg: "bg-emerald-600 text-white",
      inactiveBg: "bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
      textColor: "text-emerald-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((c) => {
        const active = activeCohort === c.key;
        const href = active ? "/tasks" : `/tasks?cohort=${c.key}`;
        const Icon = c.icon;
        return (
          <Link
            key={c.key}
            href={href}
            className={`flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition ${active ? c.activeBg : c.inactiveBg}`}
          >
            <Icon className={`h-5 w-5 ${active ? "text-white" : c.textColor}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-medium ${active ? "text-white/80" : "text-slate-600"}`}>
                {c.title}
              </p>
              <p className="text-2xl font-bold tabular-nums leading-none">{c.count}</p>
              <p className={`mt-0.5 text-[10px] ${active ? "text-white/70" : "text-slate-500"}`}>
                {c.hint}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
