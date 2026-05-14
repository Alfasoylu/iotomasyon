import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatNoteType } from "@/lib/customer-utils";
import { formatDateTime } from "@/lib/utils";
import { listActivities, listUsersWithActivity } from "@/services/activity-service";
import type { NoteType } from "@/types/customers";

export const dynamic = "force-dynamic";

const NOTE_TYPE_TR: Record<string, string> = {
  NOTE: "Not",
  CALL: "Arama",
  MEETING: "Toplantı",
  EMAIL: "E-posta",
  WHATSAPP: "WhatsApp",
  QUOTE: "Teklif",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; type?: string; page?: string }>;
}) {
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
      <div className="overflow-hidden rounded-3xl bg-slate-950">
        <div className="h-1 bg-orange-500" />
        <div className="px-6 py-8 xl:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Aktivite Günlüğü
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Tüm Kayıtlar
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {total.toLocaleString("tr-TR")} kayıt — tüm kullanıcıların notları
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <form method="GET" action="/activity" className="flex flex-wrap gap-3">
          <select
            name="userId"
            defaultValue={userId}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
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
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
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
            className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Filtrele
          </button>

          {(userId !== "all" || type !== "all") && (
            <Link
              href="/activity"
              className="flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              Temizle
            </Link>
          )}
        </form>
      </Card>

      {/* Entries */}
      <div className="space-y-3">
        {entries.length === 0 ? (
          <Card className="p-8 text-center text-sm text-slate-500">
            Kayıt bulunamadı.
          </Card>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{formatNoteType(entry.type as NoteType)}</Badge>
                  {entry.customer ? (
                    <Link
                      href={`/customers/${entry.customer.id}`}
                      className="text-sm font-medium text-slate-900 hover:underline"
                    >
                      {entry.customer.name}
                      {entry.customer.company
                        ? ` · ${entry.customer.company}`
                        : ""}
                    </Link>
                  ) : (
                    <span className="text-sm text-slate-500">Genel kayıt</span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="font-medium text-slate-600">
                    {entry.createdBy?.name ?? "Sistem"}
                  </span>
                  <span>{formatDateTime(entry.createdAt)}</span>
                </div>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-700">
                {entry.content}
              </p>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              ← Önceki
            </Link>
          )}
          <span className="text-sm text-slate-500">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Sonraki →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
