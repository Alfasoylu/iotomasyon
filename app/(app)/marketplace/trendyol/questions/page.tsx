/**
 * Phase 16 — Trendyol Customer Questions
 *
 * Lists customer questions fetched live from Trendyol Q&A API.
 * Allows filtering by status and answering WAITING_FOR_ANSWER questions inline.
 */

import Link from "next/link";
import { Settings, ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnswerQuestionForm } from "@/components/trendyol/answer-question-form";
import {
  fetchTrendyolQuestions,
  TrendyolApiError,
  type TrendyolQuestion,
  type TrendyolQuestionStatus,
} from "@/lib/trendyol-api";

export const dynamic = "force-dynamic";

function fmtDate(epochMs: number | null | undefined) {
  if (!epochMs) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(epochMs));
}

const STATUS_TR: Record<string, string> = {
  WAITING_FOR_ANSWER: "Yanıt Bekliyor",
  ANSWERED: "Yanıtlandı",
  REJECTED: "Reddedildi",
  REPORTED: "Raporlandı",
};

const STATUS_VARIANT: Record<string, "warn" | "ok" | "danger" | "neutral"> = {
  WAITING_FOR_ANSWER: "warn",
  ANSWERED: "ok",
  REJECTED: "danger",
  REPORTED: "neutral",
};

const VALID_STATUSES: TrendyolQuestionStatus[] = [
  "WAITING_FOR_ANSWER",
  "ANSWERED",
  "REJECTED",
  "REPORTED",
];

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function TrendyolQuestionsPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.MARKETPLACE_QUESTIONS_READ);

  const params = await searchParams;
  const rawStatus = params.status ?? "WAITING_FOR_ANSWER";
  const status: TrendyolQuestionStatus = (VALID_STATUSES.includes(rawStatus as TrendyolQuestionStatus)
    ? rawStatus
    : "WAITING_FOR_ANSWER") as TrendyolQuestionStatus;

  const config = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
  const notConfigured = !config || !config.isEnabled || !config.supplierId || !config.apiKey || !config.apiSecret;

  let questions: TrendyolQuestion[] = [];
  let totalElements = 0;
  let apiError: string | null = null;

  if (!notConfigured) {
    try {
      const resp = await fetchTrendyolQuestions(
        { supplierId: config.supplierId, apiKey: config.apiKey, apiSecret: config.apiSecret },
        { status, size: 50 },
      );
      questions = Array.isArray(resp?.content) ? resp.content : [];
      totalElements = resp?.totalElements ?? 0;
    } catch (err) {
      apiError = err instanceof TrendyolApiError
        ? `Trendyol API hatası (${err.status}): ${err.body.slice(0, 120)}`
        : `Bağlantı hatası: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`;
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Pazar Yerleri / Trendyol / Sorular
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Müşteri Soruları
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Trendyol&apos;dan gelen müşteri sorularını görüntüleyin ve yanıtlayın.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketplace/trendyol">
            <Button variant="secondary">
              <ArrowLeft size={14} strokeWidth={1.5} className="mr-1" />
              Trendyol Paneli
            </Button>
          </Link>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {VALID_STATUSES.map((s) => (
          <Link key={s} href={`?status=${s}`}>
            <span
              className={`inline-block rounded-md px-3 py-1 text-xs font-semibold cursor-pointer transition-colors border ${
                status === s
                  ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent-border)]"
                  : "bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {STATUS_TR[s]}
            </span>
          </Link>
        ))}
      </div>

      {/* Not-configured state */}
      {notConfigured && (
        <Card className="p-10 text-center space-y-4 rounded-lg">
          <p className="text-[var(--text-secondary)] text-sm font-medium">Trendyol API yapılandırılmamış veya pasif.</p>
          <Link href="/admin/trendyol">
            <Button className="mt-2">
              <Settings size={14} strokeWidth={1.5} className="mr-1" />
              API Ayarlarına git
            </Button>
          </Link>
        </Card>
      )}

      {/* API error state */}
      {!notConfigured && apiError && (
        <Card className="p-6 rounded-lg border-[var(--danger-border)] bg-[var(--danger-dim)]">
          <p className="text-sm font-semibold text-[var(--danger)]">API bağlantısı başarısız</p>
          <p className="mt-1 text-xs text-[var(--danger)]">{apiError}</p>
        </Card>
      )}

      {/* Question list */}
      {!notConfigured && !apiError && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-muted)]">
              {totalElements} soru bulundu, {questions.length} gösteriliyor.
            </p>
          </div>

          {questions.length === 0 ? (
            <Card className="p-10 text-center rounded-lg">
              <p className="text-[var(--text-muted)] text-sm">Bu durumda soru bulunamadı.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <Card key={q.id} className="p-5 space-y-3 rounded-lg">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={STATUS_VARIANT[q.status] ?? "neutral"}>
                          {STATUS_TR[q.status] ?? q.status}
                        </Badge>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums font-mono">{fmtDate(q.createdDate)}</span>
                        {q.categoryName && (
                          <span className="text-xs text-[var(--text-muted)]">· {q.categoryName}</span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-[var(--text-muted)] truncate">
                        {q.productName || "—"}
                        {q.barcode && <span className="text-[var(--text-muted)] ml-2 font-mono">({q.barcode})</span>}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">#{String(q.id).slice(-8)}</span>
                  </div>

                  {/* Question text */}
                  <p className="text-sm text-[var(--text-primary)] leading-relaxed">{q.text}</p>

                  {/* Existing answers */}
                  {q.answers && q.answers.length > 0 && (
                    <div className="bg-[var(--ok-dim)] border border-[var(--ok-border)] rounded-md p-3 space-y-1">
                      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--ok)]">Verilen Cevap</p>
                      {q.answers.map((a) => (
                        <div key={String(a.id)}>
                          <p className="text-xs text-[var(--text-primary)] leading-relaxed">{a.text}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 tabular-nums font-mono">{fmtDate(a.createdDate)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Answer form — only for waiting questions */}
                  {q.status === "WAITING_FOR_ANSWER" && (
                    <AnswerQuestionForm questionId={String(q.id)} />
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
