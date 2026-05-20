import Link from "next/link";
import {
  Phone, MessageCircle, Mail, Users as MeetingIcon, NotebookPen, ListPlus, CheckCircle2,
  FileText, FileCheck, Heart, Package, UserPlus, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import type { TimelineEvent, TimelineEventKind } from "@/services/customer-timeline-service";

const KIND_ICONS: Record<TimelineEventKind, LucideIcon> = {
  CALL: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  MEETING: MeetingIcon,
  NOTE: NotebookPen,
  TASK_CREATED: ListPlus,
  TASK_DONE: CheckCircle2,
  QUOTE_CREATED: FileText,
  QUOTE_SENT: FileCheck,
  INTEREST_NEW: Heart,
  MARKETPLACE_SALE: Package,
  CREATED: UserPlus,
};

const KIND_COLORS: Record<TimelineEventKind, { bg: string; text: string; ring: string }> = {
  CALL: { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
  WHATSAPP: { bg: "bg-green-100", text: "text-green-700", ring: "ring-green-200" },
  EMAIL: { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200" },
  MEETING: { bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-200" },
  NOTE: { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200" },
  TASK_CREATED: { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" },
  TASK_DONE: { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
  QUOTE_CREATED: { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200" },
  QUOTE_SENT: { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200" },
  INTEREST_NEW: { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200" },
  MARKETPLACE_SALE: { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" },
  CREATED: { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200" },
};

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

function relativeDay(d: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((today.getTime() - eventDay.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Dün";
  if (diff < 7) return `${diff} gün önce`;
  return fmtDate(d).split(" ").slice(0, 3).join(" ");
}

export function CustomerTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <p className="text-sm text-slate-500">Henüz olay yok.</p>
        <p className="mt-1 text-xs text-slate-400">
          Çağrı, mesaj, teklif eklendikçe burada görünecek.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const Icon = KIND_ICONS[e.kind];
        const c = KIND_COLORS[e.kind];
        const inner = (
          <div className="rounded-xl border border-slate-200 bg-white p-4 transition group-hover:border-slate-300 group-hover:shadow-sm">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${c.bg} ring-1 ${c.ring}`}
              >
                <Icon className={`h-4 w-4 ${c.text}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-sm font-semibold text-slate-900">{e.title}</p>
                  <span className="text-[11px] text-slate-400">
                    {relativeDay(e.happenedAt)} · {fmtDate(e.happenedAt).split(" ").slice(-1)}
                  </span>
                  {e.actorName && (
                    <span className="text-[11px] text-slate-500">— {e.actorName}</span>
                  )}
                </div>
                {e.body && (
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                    {e.body}
                  </p>
                )}
                {/* Meta info */}
                {(e.kind === "QUOTE_CREATED" || e.kind === "QUOTE_SENT") && e.meta.total != null && (
                  <p className="mt-1 text-xs text-slate-500">
                    {e.meta.itemCount && `${e.meta.itemCount} kalem · `}
                    <span className="font-mono font-semibold text-slate-700">
                      {fmtTry(Number(e.meta.total))}
                    </span>
                    {e.meta.status && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">
                        {e.meta.status}
                      </span>
                    )}
                  </p>
                )}
                {e.kind === "MARKETPLACE_SALE" && (
                  <p className="mt-1 text-xs text-slate-500">
                    #{e.meta.orderNumber}
                    {" · "}
                    {e.meta.quantity}×{" "}
                    {Number(e.meta.totalTry) > 0 && (
                      <span className="font-mono font-semibold text-slate-700">
                        {fmtTry(Number(e.meta.totalTry))}
                      </span>
                    )}
                    {e.meta.status && (
                      <span className="ml-2 text-slate-400">({e.meta.status})</span>
                    )}
                  </p>
                )}
                {e.kind === "TASK_CREATED" && e.meta.dueDate && (
                  <p className="mt-1 text-xs text-slate-500">
                    Vade: {fmtDate(new Date(String(e.meta.dueDate)))}
                    {e.meta.priority && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">
                        {e.meta.priority}
                      </span>
                    )}
                    {e.meta.assignedTo && (
                      <span className="ml-2 text-slate-400">→ {e.meta.assignedTo}</span>
                    )}
                  </p>
                )}
                {e.kind === "INTEREST_NEW" && Number(e.meta.quantity) > 1 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {e.meta.quantity} adet · Aşama: {e.meta.stage}
                  </p>
                )}
              </div>
              {e.href && (
                <ArrowRight className="mt-1.5 h-4 w-4 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
              )}
            </div>
          </div>
        );
        return (
          <li key={e.id}>
            {e.href ? (
              <Link href={e.href} className="block group">
                {inner}
              </Link>
            ) : (
              <div className="group">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
