import Link from "next/link";
import {
  Activity,
  StickyNote,
  Phone,
  Users as UsersIcon,
  Mail,
  MessageCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { formatNoteType } from "@/lib/customer-utils";
import { formatDateTime } from "@/lib/utils";
import { listActivities, listUsersWithActivity } from "@/services/activity-service";
import type { NoteType } from "@/types/customers";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const NOTE_TYPE_TR: Record<string, string> = {
  NOTE: "Not",
  CALL: "Arama",
  MEETING: "Toplantı",
  EMAIL: "E-posta",
  WHATSAPP: "WhatsApp",
  QUOTE: "Teklif",
};

// Phase: type-specific Lucide icon + token color for activity feed
const NOTE_TYPE_ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  NOTE: { icon: StickyNote, cls: "text-[var(--text-secondary)]" },
  CALL: { icon: Phone, cls: "text-[var(--info)]" },
  MEETING: { icon: UsersIcon, cls: "text-[var(--info)]" },
  EMAIL: { icon: Mail, cls: "text-[var(--text-secondary)]" },
  WHATSAPP: { icon: MessageCircle, cls: "text-[var(--ok)]" },
  QUOTE: { icon: FileText, cls: "text-[var(--accent)]" },
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; type?: string; page?: string }>;
}) {
  await requirePermission(PERMISSIONS.ACTIVITY_READ);
  const sp = await searchParams;
  const userId = sp.userId ?? "all";
  const type = sp.type ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1));

  const [{ entries, total, pageSize }, users] = await Promise.all([
    listActivities({ userId, type, page }),
    listUsersWithActivity(),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (userId !== "all") params.set("userId", userId);
    if (type !== "all") params.set("type", type);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/activity${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={Activity}
        breadcrumb={[{ label: "Satış" }, { label: "Aktiviteler" }]}
        title="Aktiviteler"
        subtitle="Tüm kullanıcıların müşteri/teklif notları — zaman akışı."
        meta={
          <span className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium tabular-nums font-mono text-[var(--text-secondary)]">
            {total.toLocaleString("tr-TR")} kayıt
          </span>
        }
      />

      {/* Filters */}
      <Card className="p-4">
        <form method="GET" action="/activity" className="flex flex-wrap gap-2">
          <select
            name="userId"
            defaultValue={userId}
            className="h-9 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]"
          >
            <option value="all">Tüm kullanıcılar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <select
            name="type"
            defaultValue={type}
            className="h-9 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]"
          >
            <option value="all">Tüm türler</option>
            {Object.entries(NOTE_TYPE_TR).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="h-9 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)] transition hover:brightness-110"
          >
            Filtrele
          </button>

          {(userId !== "all" || type !== "all") && (
            <Link
              href="/activity"
              className="inline-flex h-9 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            >
              Temizle
            </Link>
          )}
        </form>
      </Card>

      {/* Section header */}
      <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
        Zaman Akışı
      </h2>

      {/* Entries */}
      <div className="space-y-3">
        {entries.length === 0 ? (
          <Card className="p-8 text-center text-sm text-[var(--text-muted)]">
            Kayıt bulunamadı.
          </Card>
        ) : (
          entries.map((entry) => {
            const typeKey = entry.type as string;
            const iconCfg = NOTE_TYPE_ICON[typeKey] ?? NOTE_TYPE_ICON.NOTE;
            const Icon = iconCfg.icon;
            return (
              <Card key={entry.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex h-5 w-5 items-center justify-center ${iconCfg.cls}`}>
                      <Icon size={14} strokeWidth={1.5} />
                    </span>
                    <Badge>{formatNoteType(entry.type as NoteType)}</Badge>
                    {entry.customer ? (
                      <Link
                        href={`/customers/${entry.customer.id}`}
                        className="text-sm font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
                      >
                        {entry.customer.name}
                        {entry.customer.company
                          ? ` · ${entry.customer.company}`
                          : ""}
                      </Link>
                    ) : (
                      <span className="text-sm text-[var(--text-muted)]">Genel kayıt</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-medium text-[var(--text-secondary)]">
                      {entry.createdBy?.name ?? "Sistem"}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--text-muted)]">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {entry.content}
                </p>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
              Önceki
            </Link>
          )}
          <span className="text-sm font-mono tabular-nums text-[var(--text-muted)]">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            >
              Sonraki
              <ChevronRight size={14} strokeWidth={1.5} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
