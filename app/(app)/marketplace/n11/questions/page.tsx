/**
 * N11 müşteri soruları — N11 SOAP GetProductQuestionList'ten canlı (son 30 gün; N11 sınırı: dakikada 1 liste çağrısı) + yanıt
 * (SaveProductAnswer, soru başına bir kez; marketplaceQuestions.answer izni, her deneme MarketplaceQuestionActionLog'a "N11").
 * Alıcı adı / e-posta gösterilmez ve saklanmaz.
 */
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnswerQuestionForm } from "@/components/trendyol/answer-question-form";
import { listQuestions, n11Config, type N11Question, type N11QuestionStatus } from "@/lib/n11/client";

export const dynamic = "force-dynamic";

const STATUS_TR: Record<N11QuestionStatus, string> = { OPEN: "Yanıt Bekliyor", CLOSED: "Yanıtlandı" };

interface Props { searchParams: Promise<{ status?: string }> }

export default async function N11QuestionsPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.MARKETPLACE_QUESTIONS_READ);
  const params = await searchParams;
  const status: N11QuestionStatus = params.status === "CLOSED" ? "CLOSED" : "OPEN";
  const cfg = n11Config();

  let questions: N11Question[] = [];
  let total: number | null = null;
  let apiError: string | null = null;
  if (cfg) {
    try {
      const to = new Date(), from = new Date(to.getTime() - 30 * 86400000);
      const r = await listQuestions(cfg, { status, from, to, pageSize: 50 });
      questions = r.items; total = r.totalCount;
    } catch (err) {
      apiError = err instanceof Error ? err.message : "Bilinmeyen hata";
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Pazar Yerleri / N11 / Sorular</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">N11 Müşteri Soruları</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Son 30 günün soruları N11&apos;den canlı okunur. Her soruya yalnız bir kez yanıt verilebilir.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["OPEN", "CLOSED"] as const).map((s) => (
          <Link key={s} href={`?status=${s}`}>
            <span className={`inline-block rounded-md px-3 py-1 text-xs font-semibold border ${status === s
              ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent-border)]"
              : "bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--surface-2)]"}`}>{STATUS_TR[s]}</span>
          </Link>
        ))}
      </div>

      {!cfg && (
        <Card className="p-10 text-center rounded-lg">
          <p className="text-sm font-medium text-[var(--text-secondary)]">N11 API anahtarları tanımlı değil (Vercel: N11_APP_KEY, N11_APP_SECRET).</p>
        </Card>
      )}
      {cfg && apiError && (
        <Card className="p-6 rounded-lg border-[var(--danger-border)] bg-[var(--danger-dim)]">
          <p className="text-sm font-semibold text-[var(--danger)]">N11 bağlantısı başarısız</p>
          <p className="mt-1 text-xs text-[var(--danger)]">{apiError}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">N11 soru listesi dakikada bir kez çağrılabilir; bir dakika sonra yeniden deneyin.</p>
        </Card>
      )}
      {cfg && !apiError && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">{total ?? questions.length} soru bulundu, {questions.length} gösteriliyor.</p>
          {questions.length === 0 ? (
            <Card className="p-10 text-center rounded-lg"><p className="text-sm text-[var(--text-muted)]">Bu durumda soru bulunamadı.</p></Card>
          ) : questions.map((q) => (
            <Card key={q.id} className="p-5 space-y-3 rounded-lg">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={status === "OPEN" ? "warn" : "ok"}>{STATUS_TR[status]}</Badge>
                    {q.subject && <span className="text-xs text-[var(--text-muted)]">· {q.subject}</span>}
                  </div>
                  <p className="text-xs font-medium text-[var(--text-muted)] truncate">{q.productTitle || "—"}
                    {q.productId && <span className="ml-2 font-mono">({q.productId})</span>}</p>
                </div>
                <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">#{q.id}</span>
              </div>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{q.question}</p>
              {q.answer && (
                <div className="bg-[var(--ok-dim)] border border-[var(--ok-border)] rounded-md p-3">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--ok)]">Verilen Cevap</p>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">{q.answer}</p>
                </div>
              )}
              {status === "OPEN" && !q.answer && <AnswerQuestionForm questionId={q.id} platform="N11" />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
