/**
 * CFO / Not Defteri — cevaplardan çıkan KALICI bilgiler.
 *
 * Soru defteri işlemsel, bu kalıcı. Amaç: bir kez öğrenilen şeyi bir daha
 * sormamak. Sabitlenmiş notlar en üstte; her notun yanında güvenilirlik etiketi
 * (Kesin / Tahmini / Eski / Teyit edilmeli) ve kaynağı durur.
 */
import Link from "next/link";
import { BookOpen, Link2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/cfo/format";
import { NOTE_TAG_TR, CATEGORY_TR } from "@/lib/cfo/questions";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewNoteForm, EditNoteForm, PinButton, ArchiveButton } from "./note-form";

export const dynamic = "force-dynamic";

const TAG_VARIANT: Record<string, "ok" | "info" | "warn" | "danger" | "neutral"> = {
  KESIN: "ok",
  TAHMINI: "info",
  ESKI: "neutral",
  TEYIT_EDILMELI: "warn",
};

export default async function CfoNotebookPage() {
  await requirePermission(PERMISSIONS.CFO_READ);

  const notes = await prisma.cfoNote.findMany({
    include: { sourceQuestion: { select: { id: true, question: true } } },
    orderBy: [{ pinned: "desc" }, { category: "asc" }, { updatedAt: "desc" }],
    take: 500,
  });

  const active = notes.filter((n) => !n.archivedAt);
  const archived = notes.filter((n) => n.archivedAt);
  const stale = active.filter((n) => n.reviewBy && n.reviewBy < new Date());
  const needsCheck = active.filter((n) => n.dataTag === "TEYIT_EDILMELI");

  const byCategory = new Map<string, typeof active>();
  for (const n of active) {
    if (n.pinned) continue;
    const list = byCategory.get(n.category) ?? [];
    list.push(n);
    byCategory.set(n.category, list);
  }
  const pinned = active.filter((n) => n.pinned);

  const row = (n: (typeof active)[number]) => (
    <li key={n.id} className="rounded-lg border border-[var(--border)] p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge variant={TAG_VARIANT[n.dataTag] ?? "neutral"}>{NOTE_TAG_TR[n.dataTag] ?? n.dataTag}</Badge>
        <Badge variant="neutral">{CATEGORY_TR[n.category] ?? n.category}</Badge>
        {n.reviewBy && (
          <Badge variant={n.reviewBy < new Date() ? "danger" : "neutral"}>
            gözden geçir {fmtDate(n.reviewBy)}
          </Badge>
        )}
        <span className="text-[11px] text-[var(--text-muted)]">{fmtDate(n.updatedAt)}</span>
        <span className="ml-auto flex items-center gap-2">
          <PinButton id={n.id} pinned={n.pinned} />
          <ArchiveButton id={n.id} archived={!!n.archivedAt} />
        </span>
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{n.title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{n.body}</p>
      {n.source && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]"><strong>Kaynak:</strong> {n.source}</p>
      )}
      {n.sourceQuestion && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
          <Link2 size={11} /> Soru: {n.sourceQuestion.question}
        </p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-[var(--text-muted)]">Düzenle</summary>
        <EditNoteForm
          id={n.id}
          initial={{
            title: n.title,
            body: n.body,
            category: n.category,
            dataTag: n.dataTag,
            source: n.source ?? "",
            pinned: n.pinned,
          }}
        />
      </details>
    </li>
  );

  return (
    <>
      <PageHeader
        icon={BookOpen}
        title="CFO Not Defteri"
        subtitle="Bir kez öğrenilen bilgi burada kalır. CFO aynı şeyi ikinci kez sormaz."
      />

      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Badge variant="info">{active.length} aktif not</Badge>
          {needsCheck.length > 0 && <Badge variant="warn">{needsCheck.length} teyit bekliyor</Badge>}
          {stale.length > 0 && <Badge variant="danger">{stale.length} bayat</Badge>}
          {archived.length > 0 && <Badge variant="neutral">{archived.length} arşivli</Badge>}
          <Link href="/cfo/sorular" className="ml-auto text-xs text-[var(--accent)] hover:underline">
            Sorulara git →
          </Link>
        </div>
        <NewNoteForm />
      </Card>

      {pinned.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
            Sabitlenmiş — her rapor öncesi okunur
          </h2>
          <ul className="space-y-4">{pinned.map(row)}</ul>
        </Card>
      )}

      {active.length === 0 && (
        <Card className="p-5">
          <p className="text-xs text-[var(--text-muted)]">
            Defter boş. Cevaplanan sorulardan çıkan kalıcı bilgiler buraya yazılır.
          </p>
        </Card>
      )}

      {[...byCategory.entries()].map(([cat, list]) => (
        <Card key={cat} className="mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
            {CATEGORY_TR[cat] ?? cat} <span className="text-[var(--text-muted)]">({list.length})</span>
          </h2>
          <ul className="space-y-4">{list.map(row)}</ul>
        </Card>
      ))}

      {archived.length > 0 && (
        <Card className="p-5">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
              Arşiv ({archived.length}) — silinmedi, sadece listeden kaldırıldı
            </summary>
            <ul className="mt-4 space-y-4">{archived.map(row)}</ul>
          </details>
        </Card>
      )}
    </>
  );
}
