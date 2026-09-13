/**
 * CFO / Sorular — CFO ↔ Alperen soru-cevap defteri.
 *
 * Neden: CFO'nun her sabah sohbetten soru sorması, cevapların sohbet geçmişinde
 * kalması demekti. Artık sorular burada durur, cevaplar veritabanında kalıcı olur
 * ve sonraki analizlere girdi olarak akar.
 *
 * Adet limiti YOKTUR (27.08.2026, Alperen kararı). Sıralamayı priority belirler:
 * en önemli soru en üstte. Cevaplardan çıkan kalıcı bilgiler /cfo/defter'e yazılır.
 */
import Link from "next/link";
import { MessageCircleQuestion, Paperclip } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnswerForm, ProcessedButton, CancelButton } from "./answer-form";

export const dynamic = "force-dynamic";

const AREA_TR: Record<string, string> = {
  nakit: "Nakit", marj: "Marj", stok: "Stok", siparis: "Sipariş",
  gumruk: "Gümrük", urun: "Ürün", banka: "Banka", seo: "SEO", diger: "Diğer",
};

const PRIO = [
  { n: 1, label: "Acil — bir kararı bloke ediyor", variant: "danger" as const },
  { n: 2, label: "Yüksek", variant: "warn" as const },
  { n: 3, label: "Normal", variant: "info" as const },
  { n: 4, label: "Düşük", variant: "neutral" as const },
  { n: 5, label: "Bilgi", variant: "neutral" as const },
];

function fmtSize(b: number | null) {
  if (b == null) return "";
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

export default async function CfoQuestionsPage() {
  await requirePermission(PERMISSIONS.CFO_READ);

  const all = await prisma.cfoQuestion.findMany({
    where: { status: { not: "IPTAL" } },
    include: { attachments: { orderBy: { uploadedAt: "asc" } } },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { askedAt: "asc" }],
    take: 200,
  });

  const open = all.filter((q) => q.status === "ACIK");
  const answered = all.filter((q) => q.status === "CEVAPLANDI");
  const urgent = open.filter((q) => q.priority <= 2).length;
  const unprocessed = answered.filter((q) => !q.processedAt).length;

  return (
    <>
      <PageHeader
        icon={MessageCircleQuestion}
        title="CFO Soruları"
        subtitle="CFO'nun cevap bekleyen soruları, önem sırasına göre. Yazıyla cevapla, gerekiyorsa dosya ekle."
      />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={urgent > 0 ? "danger" : "info"}>{open.length} açık soru</Badge>
          {urgent > 0 && <Badge variant="warn">{urgent} tanesi acil/yüksek</Badge>}
          <Badge variant="neutral">{answered.length} cevaplanmış</Badge>
          {unprocessed > 0 && <Badge variant="warn">{unprocessed} CFO işlemedi</Badge>}
          <Link href="/cfo/defter" className="ml-auto text-xs text-[var(--accent)] hover:underline">
            Not Defteri →
          </Link>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Adet limiti yok — en önemli soru her zaman en üstte. Cevabın yeterliyse CFO onu
          Not Defteri&apos;ne kalıcı bilgi olarak yazar ve aynı şeyi bir daha sormaz.
        </p>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Cevap bekleyenler</h2>
        {open.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Açık soru yok. CFO şu an bir şey beklemiyor.</p>
        ) : (
          <ul className="space-y-4">
            {open.map((q) => {
              const p = PRIO.find((x) => x.n === q.priority) ?? PRIO[2];
              return (
                <li key={q.id} className="rounded-lg border border-[var(--border)] p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant={p.variant}>{p.label}</Badge>
                    <Badge variant="neutral">{AREA_TR[q.area] ?? q.area}</Badge>
                    <span className="text-[11px] text-[var(--text-muted)]">{fmtDate(q.askedAt)}</span>
                    <span className="ml-auto"><CancelButton questionId={q.id} /></span>
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{q.question}</p>
                  {q.why && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      <strong>Neden gerekiyor:</strong> {q.why}
                    </p>
                  )}
                  <AnswerForm questionId={q.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Cevaplananlar</h2>
        {answered.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Henüz cevaplanmış soru yok.</p>
        ) : (
          <ul className="space-y-4">
            {answered.map((q) => (
              <li key={q.id} className="rounded-lg border border-[var(--border)] p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{AREA_TR[q.area] ?? q.area}</Badge>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    soruldu {fmtDate(q.askedAt)} · cevaplandı {fmtDate(q.answeredAt)}
                    {q.answeredBy ? ` · ${q.answeredBy}` : ""}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    {q.processedAt ? (
                      <Badge variant="ok">CFO işledi · {fmtDate(q.processedAt)}</Badge>
                    ) : (
                      <>
                        <Badge variant="warn">CFO henüz işlemedi</Badge>
                        <ProcessedButton questionId={q.id} />
                      </>
                    )}
                  </span>
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{q.question}</p>
                {q.answer && (
                  <p className="mt-2 whitespace-pre-wrap rounded bg-[var(--surface-1)] p-2 text-sm text-[var(--text-secondary)]">
                    {q.answer}
                  </p>
                )}
                {q.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.attachments.map((f) => (
                      <a
                        key={f.id}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--accent)] hover:border-[var(--accent)]"
                      >
                        <Paperclip size={12} />
                        {f.fileName}
                        <span className="text-[var(--text-muted)]">{fmtSize(f.sizeBytes)}</span>
                      </a>
                    ))}
                  </div>
                )}
                {q.processNote && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]"><strong>CFO notu:</strong> {q.processNote}</p>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-[var(--text-muted)]">Cevabı güncelle</summary>
                  <AnswerForm questionId={q.id} existingAnswer={q.answer} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
