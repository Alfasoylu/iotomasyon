import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { loadCfoControlCenter } from "@/lib/cfo-agent/control-center";
import { loadCfoAlarms, type CfoAlarm } from "@/lib/cfo-agent/health";
import { getCfoConfig, billingConfigured } from "@/lib/cfo-agent/config";
import { goalItem, GOAL_STATE_LABEL, type GoalRow } from "@/lib/fm/goals";
import type { Evidence, Metric } from "@/lib/cfo-agent/types";
import { fmtTry } from "@/lib/cfo/format";
import { RunButtons } from "./run-buttons";

// AI CFO kontrol merkezi (adım 5). Salt okunur görünüm + elle çalıştırma. Kimlik bilgisi değeri asla gösterilmez (yalnız var/yok).
export const dynamic = "force-dynamic";
const time = (date: Date | string | null | undefined) => date ? new Date(date).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "Bilinmiyor";
const money = (metric: Metric | undefined) => metric?.value == null ? "Bilinmiyor" : `${fmtTry(metric.value)}${metric.estimated ? " · TAHMİNİ" : ""}`;
function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></Card>;
}
function lockConfigured() {
  const url = process.env.AI_CFO_LOCK_DATABASE_URL;
  try { return !!url && process.env.AI_CFO_LOCK_SESSION_MODE === "true" && new URL(url).port !== "6543"; } catch { return false; }
}
function Gate({ ok, label }: { ok: boolean; label: string }) { return <li>{ok ? "✓" : "✗"} {label}</li>; }

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
  const live = data?.installed ? data : null, s = live?.snapshot;
  const aiOn = config.enabled && config.releaseApproved;
  let alarms: CfoAlarm[] = [];
  if (data?.installed) { try { alarms = await loadCfoAlarms(); } catch { /* sağlık okuması başarısızsa sayfa yine açılır */ } }
  return <div className="space-y-6">
    <PageHeader title="AI CFO" subtitle="Deterministik bulguları ve hedefleri açıklayan, kanıta bağlı öneri katmanı."
      breadcrumb={[{ label: "CFO" }, { label: "AI CFO" }]}
      meta={<><Badge variant={aiOn ? "ok" : "neutral"}>{aiOn ? "AI açık" : "AI kapalı"}</Badge><Badge>{config.monitorEnabled ? "Monitor açık" : "Monitor kapalı"}</Badge>
        <span className="text-xs">Son çalışma: {time(live?.run?.generatedAt)} · {live?.run?.status ?? "Henüz çalışmadı"}</span></>} />

    {alarms.length > 0 && <Card className="space-y-1 border-[var(--danger)] p-4">
      <h2 className="font-semibold text-[var(--danger)]">Alarm</h2>
      <ul className="list-disc pl-5 text-sm">{alarms.map(a => <li key={a.code}>{a.message}</li>)}</ul>
      <p className="text-xs text-[var(--text-muted)]">Saatlik &quot;AI CFO sağlık alarmı&quot; GitHub Actions işi de bu durumda kırmızı yanar ve e-posta gönderir.</p>
    </Card>}

    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">Durum ve kapılar</h2>
      <ul className="text-sm space-y-1">
        <Gate ok={!!data?.installed} label="Kayıt tabloları (cfo_run / cfo_insight / cfo_usage) — adım 8'de üretime uygulanır" />
        <Gate ok={config.monitorEnabled} label="Monitor (AI_CFO_MONITOR_ENABLED) — deterministik kayıt" />
        <Gate ok={config.enabled} label="AI (AI_CFO_ENABLED)" />
        <Gate ok={config.releaseApproved} label="Yayın kapıları: CI build + canlı kabul + shadow week" />
        <Gate ok={config.provider === "anthropic" && !!process.env.ANTHROPIC_API_KEY} label={`Sağlayıcı (${config.provider}) ve API anahtarı (yalnız var/yok)`} />
        <Gate ok={billingConfigured(config)} label="Fiyat ve kur yapılandırması (bütçe hesabı)" />
        <Gate ok={lockConfigured()} label="Oturum kilidi bağlantısı (session pooler, 6543 değil)" />
      </ul>
      <p className="text-xs text-[var(--text-muted)]">Model: {config.model} · Günlük en çok {config.maxCallsPerDay} çağrı · Aylık bütçe {fmtTry(config.monthlyBudgetTry)} · Girdi ≤ {config.maxInputTokens} token, çıktı ≤ {config.maxOutputTokens} token.
        Zamanlama: monitor her gün XML (05:00) ve Trendyol (09:00) senkronlarından sonra CFO döngüsünün ardından; sabah özeti elle veya harici zamanlayıcıyla (≥09:30).</p>
      <RunButtons />
    </Card>

    <h2 className="text-lg font-semibold">Hedefler (Goal Engine)</h2>
    <p className="text-xs text-[var(--text-muted)]">Gerisinde/riskte/sağlanmamış ve kalitesi bilinen (A–D) taze hedefler modele bulgu olarak gider; bilinmeyen hedef gönderilmez.</p>
    <div className="grid gap-3 md:grid-cols-2">{goals.length ? goals.map(g => <Card key={g.key} className="p-4 space-y-1">
      <p className="font-semibold">{g.title}</p>
      <p className="text-sm">{GOAL_STATE_LABEL[g.state]} · kalite {g.grade}{["OFF_TRACK", "AT_RISK", "NOT_MET"].includes(g.state) && g.grade !== "U" ? " · modele gider" : ""}</p>
      <p className="text-xs">Hedef {g.targetTry == null ? "Bilinmiyor" : fmtTry(g.targetTry)} · Gözlenen {g.observedTry == null ? "Bilinmiyor" : fmtTry(g.observedTry)}{g.observedOn ? ` (${g.observedOn})` : ""}</p>
    </Card>) : <p className="text-sm">Hedef gözlemi yok (Goal Engine henüz çalışmadı).</p>}</div>

    {!data && <Card className="p-4"><p>AI CFO verisi yüklenemedi. Veritabanı bağlantısını kontrol edin.</p></Card>}
    {data && !data.installed && <Card className="p-4"><p>Kayıt tabloları henüz üretimde yok (adım 8, ayrı onay). Monitor açılsa bile kayıt tutulamaz; şu an hiçbir AI çalışması yapılmıyor.</p></Card>}
    {live && !s && <Card className="p-4">Henüz snapshot yok. Monitor açıldıktan sonra ilk sonuç burada görünecek.</Card>}
    {s && <><h2 className="text-lg font-semibold">Son snapshot</h2><p className="text-xs text-[var(--text-muted)]">{time(s.generatedAt)}. Bilinmeyen maliyetler sıfır sayılmaz.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Dün ciro" value={money(s.sales.yesterday.grossRevenue)} />
        <Stat label="Ticari nakit" value={money(s.cash.cash)} />
        <Stat label="En düşük projeksiyon nakit pozisyonu" value={money(s.cash.minimumProjectedPosition)} />
        <Stat label="Kritik uyarı" value={live?.anomalies.filter(a => a.severity === "critical").length ?? 0} />
      </div>
      <h2 className="text-lg font-semibold">Deterministik uyarılar</h2>
      <div className="space-y-2">{live?.anomalies.length ? live.anomalies.slice(0, 12).map(a => <Card key={a.id} className="p-3"><Badge variant={a.severity === "critical" ? "danger" : "warn"}>{a.severity}</Badge>
        <span className="ml-2">{a.rule} · {a.entityId}</span>{a.existingRecordIds.length > 0 && <p className="mt-1 text-xs">Mevcut kayıt takip ediliyor: {a.existingRecordIds.join(", ")}</p>}</Card>)
        : <p className="text-sm">Önemli anomali tespit edilmedi.</p>}</div></>}

    {live && <><h2 className="text-lg font-semibold">AI içgörüleri</h2>
      <div className="space-y-3">{live.insights.length ? live.insights.map(i => {
        const proof = i.evidence as unknown as Evidence[];
        return <Card key={i.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2"><Badge variant={i.severity === "critical" ? "danger" : i.severity === "warning" ? "warn" : "info"}>{i.severity}</Badge><Badge>{i.category}</Badge>
            <span className="text-xs">Güven: {i.confidence} · {time(i.createdAt)}</span></div>
          <h3 className="font-semibold">{i.title}</h3><p className="text-sm">{i.observation}</p>
          <p className="text-sm"><strong>Öneri:</strong> {i.recommendation}</p><p className="text-sm"><strong>Aksiyon alınmazsa:</strong> {i.riskIfIgnored}</p>
          {i.financialImpact != null && <p className="text-sm">Etki: {fmtTry(Number(i.financialImpact))} · {i.financialImpactType === "estimated" ? "TAHMİNİ" : "ölçülmüş"} (kodla hesaplandı)</p>}
          <details className="text-xs"><summary className="cursor-pointer">Kanıt ({proof.length})</summary><ul className="mt-2 space-y-2">{proof.map(e => <li key={e.id}>{e.source} · {e.query}: {e.value ?? "Bilinmiyor"} {e.unit} {!e.measured && "· TAHMİNİ"} · {time(e.asOf)}</li>)}</ul></details>
        </Card>;
      }) : <p className="text-sm text-[var(--text-muted)]">Henüz AI önerisi yok.</p>}</div>
      <h2 className="text-lg font-semibold">Kullanım (bu ay)</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Bugün çağrı" value={live.usage.callsToday} /><Stat label="Bu ay çağrı" value={live.usage.callsMonth} />
        <Stat label="Girdi token · cache dahil" value={live.usage.inputTokens} /><Stat label="Çıktı token" value={live.usage.outputTokens} />
        <Stat label="Tahmini API maliyeti" value={fmtTry(live.usage.cost)} /><Stat label="Önlenen çağrı" value={live.usage.avoidedCalls} />
        <Stat label="Tahmini tasarruf" value={live.usage.avoidedCost == null ? "Fiyat yapılandırılmadı" : fmtTry(live.usage.avoidedCost)} />
      </div>{!!live.usage.uncertainCosts && <p className="text-xs">Yanıtı doğrulanamayan çağrılar için bütçede üst sınır rezervi tutuluyor.</p>}</>}
    <p className="text-sm"><Link href="/cfo/calisan" className="underline">CFO çalışma döngüsü ve hedefler</Link> · <Link href="/cfo/kazananlar" className="underline">İthalat kararları</Link></p>
  </div>;
}
