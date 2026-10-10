/**
 * CFO / Kararlar — Decision Memory (2026-10-07). cfo_hamle defterindeki her stratejik karar veriyle ölçülür: başlangıç → bugün →
 * hedef, hedefe giden doğrusal yola göre ilerleme, kapanmış kararlarda tahmin isabeti. Deterministik (lib/cfo/decision-memory.ts).
 * CFO-012: yeni karar yalnız beklenen SAYI ile kaydedilir (form), kontrol noktası ölçümleri otomatik (xml-sync), kalibrasyon skoru.
 */
import { History } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { loadDecisionMemory, loadMetric } from "@/lib/cfo/decision-memory-data";
import { loadGoalAttribution } from "@/lib/cfo/goal-attribution-data";
import { EXPECTATION_REQUIRED_FROM, METRIC_LABEL, PROPOSAL_MEASURE_DAYS, proposalDrafts, type HamleStatus, type MetricKey } from "@/lib/cfo/decision-memory";
import { loadCapitalEfficiency } from "@/lib/cfo/capital-efficiency-data";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import { NewHamleForm } from "./new-hamle-form";

export const dynamic = "force-dynamic";

const STATUS: Record<HamleStatus, { label: string; variant: "danger" | "warn" | "ok" | "info" | "neutral" }> = {
  WRONG_DIRECTION: { label: "Ters yönde", variant: "danger" }, WORSENING: { label: "Kötüleşiyor", variant: "danger" },
  BEHIND: { label: "Geride", variant: "warn" }, NO_BASELINE: { label: "Başlangıç yok", variant: "warn" },
  ON_TRACK: { label: "Yolunda", variant: "ok" }, IMPROVING: { label: "İyileşiyor", variant: "ok" }, ACHIEVED: { label: "Hedefe ulaştı", variant: "ok" },
  UNMEASURED: { label: "Veriyle ölçülemiyor", variant: "neutral" }, CLOSED: { label: "Kapandı", variant: "info" },
  MISSING_EXPECTATION: { label: "Beklenen değer eksik", variant: "danger" },
};
const pct = (v: number | null) => (v == null ? "—" : `%${Math.round(v * 100)}`);

export default async function CfoDecisionsPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const q = <T,>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);
  const keys = Object.keys(METRIC_LABEL) as MetricKey[];
  const [dm, ga, current, cap] = await Promise.all([loadDecisionMemory(q), loadGoalAttribution(q), Promise.all(keys.map(k => loadMetric(q, k))),
    loadCapitalEfficiency(q).catch(() => null)]);
  const c = dm.calibration;
  const metrics = keys.map((k, i) => ({ key: k, label: METRIC_LABEL[k], current: current[i] }));
  // CFO-012: sermaye motorunun ölçülebilir önerileri (borç kapama) karar taslağı olarak; aynı başlıkla açık karar varsa gösterilmez
  const openTitles = new Set(dm.evals.filter(e => e.status !== "CLOSED").map(e => e.baslik));
  const drafts = cap ? proposalDrafts(cap.plan, Object.fromEntries(keys.map((k, i) => [k, current[i]])), dm.today).filter(d => !openTitles.has(d.baslik)) : [];
  const tl = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);
  const VERDICT = { ON_PACE: "hedef hızında", BEHIND: "hedef hızının altında", SHRINKING: "operasyonel olarak eriyor", UNKNOWN: "hedef hızı bilinmiyor" } as const;
  const bad = (dm.byStatus.WRONG_DIRECTION ?? 0) + (dm.byStatus.WORSENING ?? 0) + (dm.byStatus.BEHIND ?? 0);
  return (
    <>
      <PageHeader icon={History} title="Kararlar ve Sonuçları"
        subtitle="Verilen her stratejik karar veriyle ölçülür: beklenen ne idi, bugün neredeyiz, hedefe yetişiyor muyuz?" />
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={bad ? "danger" : "ok"}>{bad} karar ters yönde / geride</Badge>
          {Object.entries(dm.byStatus).map(([k, n]) => <Badge key={k} variant="neutral">{STATUS[k as HamleStatus].label}: {n}</Badge>)}
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Kalibrasyon (CFO-012): isabeti ölçülen {c.measured} karar · hedefe ulaşma {pct(c.hitRate)} · ortalama tahmin hatası {pct(c.meanError)}
          {" "}· eğilim {c.bias == null ? "—" : c.bias > 0.05 ? `iyimser (+${Math.round(c.bias * 100)} puan)` : c.bias < -0.05 ? `temkinli (${Math.round(c.bias * 100)} puan)` : "dengeli"}
          {" "}· beklenen SAYI kapsamı {pct(c.coverage)}.
          {c.unmeasurableClosed > 0 && ` Kapanmış ${c.unmeasurableClosed} karar beklenen SAYI olmadan kaydedildiği için ölçülemez.`}
          {" "}{EXPECTATION_REQUIRED_FROM} sonrası kaydedilen açık karar beklenen değer, başlangıç, ölçülebilir metrik ve tarih olmadan &quot;Beklenen değer eksik&quot; görünür.
          {" "}Kontrol noktası (ölçüm / hedef tarihi) gelen kararın değeri her gece cfo_hamle_olcum&apos;a yazılır; tablo değerleri bugünkü veridir ({dm.today}).
        </p>
      </Card>
      {ga.available && (
        <Card className="mb-6 p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Net sermaye neden değişti? — hedef açığı atfı</h2>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Stok değeri satış fiyatından yeniden hesaplandığı için adet değişmeden oynar. Değişim; nakit, alacak, borç, stok MİKTARI
            (Δadet × bugünkü birim değer) ve stok DEĞERLEMESİ olarak bölünür. Hedefe ilerleme yalnız operasyonel kısımla ölçülür.
            {" "}Tanım: {ga.definitionVersion === 3 ? "v3 sözleşme (nakit + alacak + LCNRV stok + yoldaki − borç = net sermaye)" : "v2 eski snapshot alanları (yoldaki mal stoğun içinde, net sermayede yok → açıklanamayan fark)"}.
          </p>
          <CfoTable head={<tr><Th>Pencere</Th><Th right>Bildirilen değişim</Th><Th right>Nakit</Th><Th right>Alacak</Th><Th right>Borç azalışı</Th>
            <Th right>Stok miktarı</Th><Th right>Stok değerleme</Th><Th right>Operasyonel/gün</Th><Th>Hedefe göre</Th></tr>}>
            {ga.windows.map(w => (
              <tr key={w.window}>
                <Td strong>{w.attribution.from} → {w.attribution.to} ({w.attribution.days} gün)</Td>
                <Td right>{tl(w.attribution.netChange)}{!w.attribution.identityOk && <span className="block text-[11px] text-[var(--danger)]">açıklanamayan {tl(w.attribution.unexplained)}</span>}</Td><Td right>{tl(w.attribution.cash)}</Td><Td right>{tl(w.attribution.receivables)}</Td>
                <Td right>{tl(w.attribution.debt)}</Td><Td right>{tl(w.attribution.inventoryQuantity)}</Td>
                <Td right>{tl(w.attribution.inventoryValuation)}<span className="block text-[11px] text-[var(--text-muted)]">değişimin %{Math.round(w.attribution.valuationShare * 100)}&apos;i</span></Td>
                <Td right strong>{tl(w.pace.operationalPerDay)}</Td>
                <Td muted>{VERDICT[w.pace.verdict]}{w.pace.requiredPerDay != null ? ` (gereken ${tl(w.pace.requiredPerDay)}/gün)` : ""}{w.pace.daysToGoalAtOperational != null ? ` · bu hızla ${w.pace.daysToGoalAtOperational} gün` : ""}</Td>
              </tr>
            ))}
          </CfoTable>
        </Card>
      )}
      <Card className="mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Motor önerileri → karar (onay)</h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Sermaye tahsis planının veriyle ölçülebilen adımları (kredi / kart devreden bakiyesi kapama) beklenen değerli karar taslağıdır:
          başlangıç = bugünkü değer, beklenen = başlangıç − plan tutarı, ölçüm {PROPOSAL_MEASURE_DAYS} gün sonra. Onaylayıp kaydedince karar
          deftere girer ve kontrol noktasında otomatik ölçülür; kaydedilmeyen öneri karar sayılmaz.
          {cap == null ? " Sermaye motoru okunamadı." : drafts.length === 0 ? " Şu an ölçülebilir öneri yok (plan bütçesi 0 ya da öneriler stok/likidite)." : ""}
        </p>
        <div className="space-y-3">
          {drafts.map(d => (
            <div key={d.kod} className="rounded-lg border border-[var(--border)] p-3">
              <p className="mb-2 text-xs"><span className="font-semibold">{d.baslik}</span> · {METRIC_LABEL[d.metric]}: {Number(d.baslangicDeger).toLocaleString("tr-TR")} → {Number(d.beklenenDeger).toLocaleString("tr-TR")} ({d.ilkOlcumTarihi}) · {d.neden}</p>
              <NewHamleForm today={dm.today} metrics={metrics} initial={d} buttonLabel="İncele ve karar olarak kaydet" />
            </div>
          ))}
          <NewHamleForm today={dm.today} metrics={metrics} />
        </div>
      </Card>
      <Card className="p-5">
        <CfoTable head={<tr><Th>Durum</Th><Th>Karar</Th><Th>Metrik</Th><Th right>Başlangıç</Th><Th right>Bugün</Th><Th right>Hedef</Th><Th>Değerlendirme</Th></tr>}>
          {dm.evals.map(e => (
            <tr key={e.kod}>
              <Td><Badge variant={STATUS[e.status].variant}>{STATUS[e.status].label}</Badge></Td>
              <Td strong>{e.kod}<span className="block text-[11px] font-normal text-[var(--text-muted)]">{e.baslik} · {e.kararTarihi} · {e.durum}</span></Td>
              <Td muted>{e.metric ? METRIC_LABEL[e.metric] : e.olcumMetrigi ?? "—"}</Td>
              <Td right>{e.baslangicDeger == null ? "—" : Math.round(e.baslangicDeger).toLocaleString("tr-TR")}</Td>
              <Td right strong>{e.current == null ? (e.gerceklesenDeger == null ? "—" : Math.round(e.gerceklesenDeger).toLocaleString("tr-TR")) : Math.round(e.current).toLocaleString("tr-TR")}</Td>
              <Td right>{e.beklenenDeger == null ? "—" : Math.round(e.beklenenDeger).toLocaleString("tr-TR")}{e.deadline ? <span className="block text-[11px] text-[var(--text-muted)]">{e.deadline}</span> : null}</Td>
              <Td muted>{e.note}{(() => { const ms = dm.measurements.get(e.kod); const last = ms?.[ms.length - 1];
                return last ? <span className="block text-[11px]">ölçüm {ms!.length}: son {last.date} = {Math.round(last.value).toLocaleString("tr-TR")}</span> : null; })()}</Td>
            </tr>
          ))}
        </CfoTable>
      </Card>
    </>
  );
}
