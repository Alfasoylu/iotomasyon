import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { loadCfoControlCenter } from "@/lib/cfo-agent/control-center";
import { loadCfoAlarms, type CfoAlarm } from "@/lib/cfo-agent/health";
import { getCfoConfig } from "@/lib/cfo-agent/config";
import { URGENCY_LABEL } from "@/lib/cfo-agent/findings";
import { goalItem, GOAL_STATE_LABEL, type GoalRow } from "@/lib/fm/goals";
import type { Metric } from "@/lib/cfo-agent/types";
import { fmtTry } from "@/lib/cfo/format";
import { RunButtons } from "./run-buttons";

// Deterministik CFO motoru (2026-10-08: sitede LLM yok). Motor saatte bir ölçer, tespit eder, TL'ye göre sıralar ve bulguyu
// ŞABLONLA yazar; yargı ve karar Cowork CFO'nundur (08:00 + 16:49 TR, cfo_gun_ozeti'ni okur). Salt okunur + elle çalıştırma.
export const dynamic = "force-dynamic";
const time = (date: Date | string | null | undefined) => date ? new Date(date).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "Bilinmiyor";
const money = (metric: Metric | undefined) => metric?.value == null ? "Bilinmiyor" : `${fmtTry(metric.value)}${metric.estimated ? " · TAHMİNİ" : ""}`;
const URGENCY_VARIANT = { ACIL: "danger", BUGUN: "warn", BU_HAFTA: "info", BILGI: "neutral" } as const;
const SINCE = { yeni: "yeni", degisti: "değişti", ayni: "aynı" } as const;
function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></Card>;
}

async function readGoals(): Promise<GoalRow[]> {
  try {
    return await prisma.$queryRaw<GoalRow[]>`SELECT goal_key, goal_version, kind, title, target_value, target_currency, deadline, as_of, period_start, period_end,
      state, observed_value_try, observed_on, target_value_try, fx_usd_try, fx_month, progress_pct, gap_try, current_rate_try_per_day, required_rate_try_per_day,
      projected_value_try, projected_on, grade, flags FROM public.fm_memory_goal ORDER BY goal_key`;
  } catch { return []; }
}

export default async function AiCfoPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  const config = getCfoConfig();
  let data: Awaited<ReturnType<typeof loadCfoControlCenter>> | null = null;
  try { data = await loadCfoControlCenter(); } catch { /* bağlantı hatası: aşağıda açıklanır */ }
  const goals = (await readGoals()).map(goalItem);
  const live = data?.installed ? data : null, s = live?.snapshot, r = live?.record;
  let alarms: CfoAlarm[] = [];
  if (data?.installed) { try { alarms = await loadCfoAlarms(); } catch { /* sağlık okuması başarısızsa sayfa yine açılır */ } }
  const findings = r?.findings ?? [];
  return <div className="space-y-6">
    <PageHeader title="CFO motoru" subtitle="Saatte bir ölçer, tespit eder, TL'ye göre sıralar ve şablonla bulgu yazar. Yargı ve karar Cowork CFO'nun (08:00 · 16:49)."
      breadcrumb={[{ label: "CFO" }, { label: "CFO motoru" }]}
      meta={<><Badge variant={config.monitorEnabled ? "ok" : "neutral"}>{config.monitorEnabled ? "Motor açık" : "Motor kapalı"}</Badge><Badge>LLM yok</Badge>
        <span className="text-xs">Son koşu: {time(live?.run?.generatedAt)} · {live?.run?.status ?? "Henüz çalışmadı"} · son tamamlanan: {time(live?.completedAt)}</span></>} />

    {alarms.length > 0 && <Card className="space-y-1 border-[var(--danger)] p-4">
      <h2 className="font-semibold text-[var(--danger)]">Alarm</h2>
      <ul className="list-disc pl-5 text-sm">{alarms.map(a => <li key={a.key}>{a.message}</li>)}</ul>
      <p className="text-xs text-[var(--text-muted)]">Saatlik iş motor arızasında, yeni alarmda ve 09:00 TR hatırlatmasında kırmızı yanar ve e-posta gönderir.</p>
    </Card>}

    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">Durum</h2>
      <p className="text-sm">{r?.material ? (r.material.sinceYesterday ? "Karar girdisi dünden beri DEĞİŞTİ." : "Dünden beri önemli değişiklik yok (no_material_change).") : "Henüz motor kaydı yok."}
        {r?.closedSinceYesterday?.length ? ` Dünden beri kapanan bulgu: ${r.closedSinceYesterday.length}.` : ""}</p>
      {r?.silenced?.length ? <p className="text-xs text-[var(--text-muted)]">Susan kurallar: {r.silenced.join(" | ")}</p> : null}
      <p className="text-xs text-[var(--text-muted)]">Zamanlama: her saat :05 (GitHub Actions) + XML (05:00) ve Trendyol (09:00) senkronlarından sonra. Cowork CFO tek görünümü okur: <code>select * from cfo_gun_ozeti</code>.</p>
      <RunButtons />
    </Card>

    {s && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Dün ciro" value={money(s.sales.yesterday.grossRevenue)} />
      <Stat label="Ticari nakit" value={money(s.cash.cash)} />
      <Stat label="En düşük projeksiyon nakit pozisyonu" value={money(s.cash.minimumProjectedPosition)} />
      <Stat label="Bulgu (ACİL / toplam)" value={`${findings.filter(f => f.urgency === "ACIL").length} / ${findings.length}`} />
    </div>}

    <h2 className="text-lg font-semibold">Bulgular ({findings.length})</h2>
    <div className="space-y-2">{findings.length ? findings.map(f => <Card key={f.fingerprint} className="space-y-1 p-3">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={URGENCY_VARIANT[f.urgency]}>{URGENCY_LABEL[f.urgency]}</Badge><Badge>{f.rule}</Badge>
        <span className="text-xs text-[var(--text-muted)]">dünden beri: {SINCE[f.sinceYesterday]}{f.impactTry != null ? ` · ${fmtTry(f.impactTry)}${f.impactEstimated ? " (tahmini)" : ""}` : ""}</span></div>
      <p className="text-sm">{f.what}</p>
      <p className="text-sm"><strong>Aksiyon:</strong> {f.action}{f.openRecords.length ? ` · Açık iş: ${f.openRecords.join(", ")}` : ""}</p>
      <p className="text-xs text-[var(--text-muted)]">Kanıt: {f.evidenceIds.join(", ") || "yok"}</p>
    </Card>) : <p className="text-sm">Bulgu yok.</p>}</div>

    <h2 className="text-lg font-semibold">Hedefler (Goal Engine)</h2>
    <div className="grid gap-3 md:grid-cols-2">{goals.length ? goals.map(g => <Card key={g.key} className="p-4 space-y-1">
      <p className="font-semibold">{g.title}</p>
      <p className="text-sm">{GOAL_STATE_LABEL[g.state]} · kalite {g.grade}</p>
      <p className="text-xs">Hedef {g.targetTry == null ? "Bilinmiyor" : fmtTry(g.targetTry)} · Gözlenen {g.observedTry == null ? "Bilinmiyor" : fmtTry(g.observedTry)}{g.observedOn ? ` (${g.observedOn})` : ""}</p>
    </Card>) : <p className="text-sm">Hedef gözlemi yok (Goal Engine henüz çalışmadı).</p>}</div>

    {!data && <Card className="p-4"><p>Motor verisi yüklenemedi. Veritabanı bağlantısını kontrol edin.</p></Card>}
    {data && !data.installed && <Card className="p-4"><p>Kayıt tablosu (cfo_run) üretimde yok.</p></Card>}
    <p className="text-sm"><Link href="/cfo/calisan" className="underline">CFO çalışma döngüsü ve hedefler</Link> · <Link href="/cfo/kazananlar" className="underline">İthalat kararları</Link></p>
  </div>;
}
