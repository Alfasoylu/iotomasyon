/**
 * Koçtaş müşteri mesajları — Mirakl M11 (/api/inbox/threads) canlı, son 30 gün; yanıt M12 (marketplaceQuestions.answer izni, her deneme
 * MarketplaceQuestionActionLog'a "KOCTAS"). Mirakl'da ürün sorusu ayrı servis değil: sipariş (MMP_ORDER) ve teklif (MMP_OFFER) konuları.
 * Gönderen adı gösterilmez; yalnız türü (müşteri / mağaza / Koçtaş).
 */
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnswerQuestionForm } from "@/components/trendyol/answer-question-form";
import { koctasConfig, listThreads, type KoctasThread } from "@/lib/koctas/client";

export const dynamic = "force-dynamic";

const FROM_TR: Record<string, string> = { CUSTOMER_USER: "Müşteri", SHOP_USER: "Mağaza", OPERATOR_USER: "Koçtaş" };
const ENTITY_TR: Record<string, string> = { MMP_ORDER: "Sipariş", MMP_OFFER: "Ürün/teklif" };
const fmt = (s: string | null) => (s ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(s)) : "—");

interface Props { searchParams: Promise<{ filtre?: string }> }

export default async function KoctasMessagesPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.MARKETPLACE_QUESTIONS_READ);
  const onlyPending = (await searchParams).filtre !== "tumu";
  let threads: KoctasThread[] = [];
  let apiError: string | null = null;
  let configured = false;
  try {
    const cfg = koctasConfig();
    if (cfg) {
      configured = true;
      threads = (await listThreads(cfg, { updatedSince: new Date(Date.now() - 30 * 86400000), limit: 100 })).items;
    }
  } catch (err) { apiError = err instanceof Error ? err.message : "Bilinmeyen hata"; configured = true; }
  const shown = onlyPending ? threads.filter(t => t.replyNeededSince) : threads;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Pazar Yerleri / Koçtaş / Mesajlar</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Koçtaş Müşteri Mesajları</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Son 30 günde güncellenen sipariş ve ürün konuları Koçtaş&apos;tan (Mirakl) canlı okunur.</p>
      </div>
      <div className="flex gap-2">
        {([["bekleyen", "Yanıt Bekleyen"], ["tumu", "Tümü"]] as const).map(([k, label]) => (
          <Link key={k} href={`?filtre=${k}`}>
            <span className={`inline-block rounded-md px-3 py-1 text-xs font-semibold border ${(k === "tumu") !== onlyPending
              ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent-border)]"
              : "bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--surface-2)]"}`}>{label}</span>
          </Link>
        ))}
      </div>
      {!configured && <Card className="p-10 text-center rounded-lg"><p className="text-sm font-medium text-[var(--text-secondary)]">Koçtaş API anahtarı tanımlı değil (Vercel: KOCTAS_API_KEY).</p></Card>}
      {apiError && (
        <Card className="p-6 rounded-lg border-[var(--danger-border)] bg-[var(--danger-dim)]">
          <p className="text-sm font-semibold text-[var(--danger)]">Koçtaş bağlantısı başarısız</p>
          <p className="mt-1 text-xs text-[var(--danger)]">{apiError}</p>
        </Card>
      )}
      {configured && !apiError && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">{threads.length} konu, {threads.filter(t => t.replyNeededSince).length} yanıt bekliyor.</p>
          {shown.length === 0 ? <Card className="p-10 text-center rounded-lg"><p className="text-sm text-[var(--text-muted)]">Gösterilecek konu yok.</p></Card>
            : shown.map(t => (
            <Card key={t.id} className="p-5 space-y-3 rounded-lg">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={t.replyNeededSince ? "warn" : "ok"}>{t.replyNeededSince ? `Yanıt bekliyor · ${fmt(t.replyNeededSince)}` : "Yanıtlandı"}</Badge>
                <span className="text-xs text-[var(--text-muted)]">{ENTITY_TR[t.entityType ?? ""] ?? t.entityType ?? "—"} {t.entityLabel ?? t.entityId ?? ""}</span>
                {t.topic && <span className="text-xs text-[var(--text-muted)]">· {t.topic}</span>}
              </div>
              <div className="space-y-2">
                {t.messages.slice(-6).map((m, i) => (
                  <div key={i} className={`rounded-md border p-2 text-sm ${m.fromType === "SHOP_USER" ? "border-[var(--ok-border)] bg-[var(--ok-dim)]" : "border-[var(--border-subtle)]"}`}>
                    <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{FROM_TR[m.fromType ?? ""] ?? m.fromType ?? "—"} · {fmt(m.date)}</p>
                    <p className="text-[var(--text-primary)] whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
              {t.replyNeededSince && <AnswerQuestionForm questionId={t.id} platform="KOCTAS" />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
