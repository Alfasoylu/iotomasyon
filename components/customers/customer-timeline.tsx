import Link from "next/link";
import {
  Phone, MessageCircle, Mail, Users as MeetingIcon, NotebookPen, ListPlus, CheckCircle2,
  FileText, FileCheck, Heart, Package, UserPlus, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

type KindTone = "ok" | "info" | "accent" | "warn" | "danger" | "neutral";

const KIND_TONE: Record<TimelineEventKind, KindTone> = {
  CALL: "ok",
  WHATSAPP: "ok",
  EMAIL: "info",
  MEETING: "accent",
  NOTE: "neutral",
  TASK_CREATED: "warn",
  TASK_DONE: "ok",
  QUOTE_CREATED: "info",
  QUOTE_SENT: "info",
  INTEREST_NEW: "danger",
  MARKETPLACE_SALE: "warn",
  CREATED: "neutral",
};

const TONE_BG: Record<KindTone, string> = {
  ok: "bg-[var(--ok-dim)] text-[var(--ok)] border-[var(--ok-border)]",
  info: "bg-[var(--info-dim)] text-[var(--info)] border-[var(--info-border)]",
  accent: "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent-border)]",
  warn: "bg-[var(--warn-dim)] text-[var(--warn)] border-[var(--warn-border)]",
  danger: "bg-[var(--danger-dim)] text-[var(--danger)] border-[var(--danger-border)]",
  neutral: "bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-default)]",
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
      <div className="rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] p-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">Henüz olay yok.</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Çağrı, mesaj, teklif eklendikçe burada görünecek.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const Icon = KIND_ICONS[e.kind];
        const tone = KIND_TONE[e.kind];
        const inner = (
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4 transition-colors group-hover:border-[var(--border-strong)]">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border ${TONE_BG[tone]}`}
              >
                <Icon size={14} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{e.title}</p>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                    {relativeDay(e.happenedAt)} · {fmtDate(e.happenedAt).split(" ").slice(-1)}
                  </span>
                  {e.actorName && (
                    <span className="text-[11px] text-[var(--text-secondary)]">— {e.actorName}</span>
                  )}
                </div>
                {e.body && (
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                    {e.body}
                  </p>
                )}
                {/* Meta info */}
                {(e.kind === "QUOTE_CREATED" || e.kind === "QUOTE_SENT") && e.meta.total != null && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {e.meta.itemCount && (
                      <span className="font-mono tabular-nums">{`${e.meta.itemCount} kalem · `}</span>
                    )}
                    <span className="font-mono font-semibold tabular-nums text-[var(--text-secondary)]">
                      {fmtTry(Number(e.meta.total))}
                    </span>
                    {e.meta.status && (
                      <span className="ml-2 inline-block">
                        <Badge variant="neutral">{String(e.meta.status)}</Badge>
                      </span>
                    )}
                  </p>
                )}
                {e.kind === "MARKETPLACE_SALE" && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    <span className="font-mono tabular-nums">#{String(e.meta.orderNumber)}</span>
                    {" · "}
                    <span className="font-mono tabular-nums">{String(e.meta.quantity)}×</span>{" "}
                    {Number(e.meta.totalTry) > 0 && (
                      <span className="font-mono font-semibold tabular-nums text-[var(--text-secondary)]">
                        {fmtTry(Number(e.meta.totalTry))}
                      </span>
                    )}
                    {e.meta.status && (
                      <span className="ml-2 text-[var(--text-muted)]">({String(e.meta.status)})</span>
                    )}
                  </p>
                )}
                {e.kind === "TASK_CREATED" && e.meta.dueDate && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Vade: <span className="font-mono tabular-nums">{fmtDate(new Date(String(e.meta.dueDate)))}</span>
                    {e.meta.priority && (
                      <span className="ml-2 inline-block">
                        <Badge variant="neutral">{String(e.meta.priority)}</Badge>
                      </span>
                    )}
                    {e.meta.assignedTo && (
                      <span className="ml-2 text-[var(--text-muted)]">→ {String(e.meta.assignedTo)}</span>
                    )}
                  </p>
                )}
                {e.kind === "INTEREST_NEW" && Number(e.meta.quantity) > 1 && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    <span className="font-mono tabular-nums">{String(e.meta.quantity)}</span> adet · Aşama: {String(e.meta.stage)}
                  </p>
                )}
              </div>
              {e.href && (
                <ArrowRight
                  size={14}
                  strokeWidth={1.5}
                  className="mt-1.5 flex-shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
                />
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
