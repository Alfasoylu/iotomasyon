/**
 * Phase 16 — Trendyol Customer Questions
 *
 * Lists customer questions fetched live from Trendyol Q&A API.
 * Allows filtering by status and answering WAITING_FOR_ANSWER questions inline.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

const STATUS_COLOR: Record<string, string> = {
  WAITING_FOR_ANSWER: "bg-amber-100 text-amber-700",
  ANSWERED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  REPORTED: "bg-slate-100 text-slate-600",
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Pazar Yerleri / Trendyol / Sorular
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Müşteri Soruları
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Trendyol&apos;dan gelen müşteri sorularını görüntüleyin ve yanıtlayın.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketplace/trendyol">
            <Button variant="secondary">← Trendyol Paneli</Button>
          </Link>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {VALID_STATUSES.map((s) => (
          <Link key={s} href={`?status=${s}`}>
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                status === s
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {STATUS_TR[s]}
            </span>
          </Link>
        ))}
      </div>

      {/* Not-configured state */}
      {notConfigured && (
        <Card className="p-10 text-center space-y-4">
          <p className="text-slate-600 text-sm font-medium">Trendyol API yapılandırılmamış veya pasif.</p>
          <Link href="/admin/trendyol">
            <Button className="mt-2">⚙ API Ayarlarına git</Button>
          </Link>
        </Card>
      )}

      {/* API error state */}
      {!notConfigured && apiError && (
        <Card className="p-6 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">API bağlantısı başarısız</p>
          <p className="mt-1 text-xs text-red-600">{apiError}</p>
        </Card>
      )}

      {/* Question list */}
      {!notConfigured && !apiError && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {totalElements} soru bulundu, {questions.length} gösteriliyor.
            </p>
          </div>

          {questions.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-slate-400 text-sm">Bu durumda soru bulunamadı.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <Card key={q.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[q.status] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {STATUS_TR[q.status] ?? q.status}
                        </span>
                        <span className="text-xs text-slate-400">{fmtDate(q.createdDate)}</span>
                        {q.categoryName && (
                          <span className="text-xs text-slate-400">· {q.categoryName}</span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-500 truncate">
                        {q.productName || "—"}
                        {q.barcode && <span className="text-slate-400 ml-2">({q.barcode})</span>}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">#{String(q.id).slice(-8)}</span>
                  </div>

                  {/* Question text */}
                  <p className="text-sm text-slate-800 leading-relaxed">{q.text}</p>

                  {/* Existing answers */}
                  {q.answers && q.answers.length > 0 && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-md p-3 space-y-1">
                      <p className="text-xs font-semibold text-emerald-700">Verilen Cevap:</p>
                      {q.answers.map((a) => (
                        <div key={String(a.id)}>
                          <p className="text-xs text-emerald-800 leading-relaxed">{a.text}</p>
                          <p className="text-[10px] text-emerald-400 mt-0.5">{fmtDate(a.createdDate)}</p>
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
