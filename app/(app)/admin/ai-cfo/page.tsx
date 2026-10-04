import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { loadCfoControlCenter } from "@/lib/cfo-agent/control-center";
import { getCfoConfig } from "@/lib/cfo-agent/config";
import type { Evidence, Metric } from "@/lib/cfo-agent/types";
import { fmtTry } from "@/lib/cfo/format";

export const dynamic="force-dynamic";
const time=(date:Date|string|null|undefined)=>date?new Date(date).toLocaleString("tr-TR",{timeZone:"Europe/Istanbul"}):"Bilinmiyor";
const money=(metric:Metric|undefined)=>metric?.value==null?"Bilinmiyor":`${fmtTry(metric.value)}${metric.estimated?" · TAHMİNİ":""}`;
const pct=(metric:Metric|undefined)=>metric?.value==null?"Bilinmiyor":`%${metric.value.toFixed(1)}${metric.estimated?" · TAHMİNİ":""}`;
function Stat({label,value}:{label:string;value:string|number}) {return <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></Card>;}

export default async function AiCfoPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  let data:Awaited<ReturnType<typeof loadCfoControlCenter>>|null=null;
  try {data=await loadCfoControlCenter();}catch { /* additive migration may not yet be deployed */ }
  const config=getCfoConfig(),s=data?.snapshot;
  const snapshotIsToday=!!s&&new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date(s.generatedAt))===new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date());
  const today=snapshotIsToday?s?.profitabilityByPeriod?.today:undefined;
  return <div className="space-y-6">
    <PageHeader title="AI CFO" subtitle="Nakit, katkı kârı ve stok riskleri için analiz ve öneri merkezi."
      breadcrumb={[{label:"Yönetim"},{label:"AI CFO"}]}
      meta={<><Badge variant={config.enabled&&config.releaseApproved?"ok":"neutral"}>{config.enabled&&config.releaseApproved?"AI açık":"AI kapalı"}</Badge><Badge>{config.monitorEnabled?"Monitor açık":"Monitor kapalı"}</Badge><span className="text-xs">Son çalışma: {time(data?.run?.generatedAt)} · {data?.run?.status??"Henüz çalışmadı"}</span></>} />
    {process.env.VERCEL_ENV==="preview"&&<Card className="p-4"><a href="/api/admin/ai-cfo/acceptance" className="underline">Güncel kabul karşılaştırmasını JSON olarak çalıştır</a><p className="mt-1 text-xs">Admin oturumu gerekir. Salt okunur; canlıya geçiş onayı değildir.</p></Card>}
    {!data&&<Card className="p-4"><p>AI CFO verisi yüklenemedi. Migration ve database bağlantısını kontrol edin.</p></Card>}
    {data&&!s&&<Card className="p-4">Henüz snapshot yok. Deterministic monitor yapılandırıldıktan sonra ilk sonuç burada görünecek.</Card>}
    {s&&<><h2 className="text-lg font-semibold">Company Pulse</h2><p className="text-xs text-[var(--text-muted)]">Snapshot: {time(s.generatedAt)}. Bilinmeyen maliyetler sıfır sayılmaz. Katkı marjı KDV dahil brüt tutar üzerinden hesaplanır.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Bugün ciro" value={money(snapshotIsToday?s.sales.today.grossRevenue:undefined)} />
        <Stat label="Bugün contribution profit" value={money(today?.contributionProfit)} />
        <Stat label="Bugün contribution margin" value={pct(today?.contributionMargin)} />
        <Stat label="Ticari nakit" value={money(s.cash.cash)} />
        <Stat label="Boş genel KMH · nakit değildir" value={money(s.cash.generalUnusedOverdraft)} />
        <Stat label="Amaca bağlı KMH · ayrı" value={money(s.cash.purposeLimit)} />
        <Stat label="Toplam kart borcu" value={money(s.cash.totalCardDebt)} />
        <Stat label="Stok maliyet değeri" value={money(s.inventory.costValue)} />
        <Stat label="Stockout riski · stok maliyeti" value={money(s.inventory.stockoutRiskValue)} />
        <Stat label="Ölü stok · bilinen maliyet" value={money(s.inventory.deadStockValue)} />
        <Stat label="Kritik uyarı" value={data?.anomalies.filter(a=>a.severity==="critical").length??0} />
        <Stat label="En düşük projeksiyon nakit pozisyonu" value={money(s.cash.minimumProjectedPosition)} />
      </div>
      <h2 className="text-lg font-semibold">Deterministic uyarılar</h2>
      <div className="space-y-2">{data?.anomalies.length?data.anomalies.slice(0,12).map(a=><Card key={a.id} className="p-3"><Badge variant={a.severity==="critical"?"danger":"warn"}>{a.severity}</Badge><span className="ml-2">{a.rule} · {a.entityId}</span>{a.existingRecordIds.length>0&&<p className="mt-1 text-xs">Mevcut kayıt takip ediliyor: {a.existingRecordIds.join(", ")}</p>}</Card>):<p className="text-sm">Önemli anomali tespit edilmedi.</p>}</div>
    </>}
    <h2 className="text-lg font-semibold">CFO Insights</h2>
    <div className="space-y-3">{data?.insights.length?data.insights.map(i=>{
      const proof=i.evidence as unknown as Evidence[];
      return <Card key={i.id} className="space-y-3 p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant={i.severity==="critical"?"danger":i.severity==="warning"?"warn":"info"}>{i.severity}</Badge><Badge>{i.category}</Badge><span className="text-xs">Güven: {i.confidence} · {time(i.createdAt)}</span></div>
        <h3 className="font-semibold">{i.title}</h3><p className="text-sm">{i.observation}</p><p className="text-sm"><strong>Öneri:</strong> {i.recommendation}</p><p className="text-sm"><strong>Aksiyon alınmazsa:</strong> {i.riskIfIgnored}</p>
        {i.financialImpact!=null&&<p className="text-sm">Etki: {fmtTry(Number(i.financialImpact))} · {i.financialImpactType==="estimated"?"TAHMİNİ":"ölçülmüş"}</p>}
        <details className="text-xs"><summary className="cursor-pointer">Evidence ({proof.length})</summary><ul className="mt-2 space-y-2">{proof.map(e=><li key={e.id}>{e.source} · {e.query}: {e.value??"Bilinmiyor"} {e.unit} {!e.measured&&"· TAHMİNİ"} · {time(e.asOf)}</li>)}</ul></details>
      </Card>;
    }):<p className="text-sm text-[var(--text-muted)]">Henüz AI önerisi yok. Deterministic uyarılar AI kapalıyken de gösterilir.</p>}</div>
    {s&&<><h2 className="text-lg font-semibold">Data Quality</h2><Card className="space-y-3 p-4">
      <p>Maliyet kapsamı: {s.dataQuality.costCoveragePct==null?"Bilinmiyor":`%${s.dataQuality.costCoveragePct.toFixed(1)}`} · Eşleşme: {s.dataQuality.matchingCoveragePct==null?"Bilinmiyor":`%${s.dataQuality.matchingCoveragePct.toFixed(1)}`}</p>
      <p>Kukla stok hariç: {s.dataQuality.excludedDummyStock} · FBA envanteri bilinmiyor · Mükerrer canonical satır: {s.dataQuality.duplicateCanonicalRows}</p>
      <p>Bayat kaynaklar: {s.dataQuality.staleSources.join(", ")||"Yok"}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Kaynak</th><th>Son satış</th><th>Son aktarım</th><th>Batch gün / satış kapsam günü</th></tr></thead><tbody>{s.dataQuality.sourceWatermarks.map(w=><tr key={w.source}><td className="py-2">{w.source}</td><td>{time(w.orderDate)}</td><td>{time(w.syncedAt)}</td><td>{w.batchDays} / {w.coverageDays}</td></tr>)}</tbody></table></div>
      <details><summary className="cursor-pointer text-sm">Eksik veri ({s.dataQuality.missingFields.length})</summary><ul className="mt-2 list-inside list-disc text-xs">{s.dataQuality.missingFields.map(f=><li key={f}>{f}</li>)}</ul></details>
    </Card></>}
    {s&&<><h2 className="text-lg font-semibold">Komisyon ve tahsilat kapsamı</h2><Card className="p-4 space-y-2">
      <p className="text-xs">%90 kanal kapsamı ve en az 10 geçerli SKU kaydı olmadan komisyon kullanılmaz. Net banka oranı komisyon değildir; TAHMİNİ tahsilat katkı kârı olarak sunulmaz.</p>
      {(s.dataQuality.commissionCoverage??[]).map(c=><p key={c.channel} className="text-sm">{c.channel}: kapsam %{c.coveragePct?.toFixed(1)??"—"} · ayıklanan {c.outliers} kayıt</p>)}
      {s.channels.filter(c=>c.netSettlementRatio?.value!=null).map(c=><p key={c.channel} className="text-sm">{c.channel}: TAHMİNİ net banka oranı %{(c.netSettlementRatio.value!*100).toFixed(1)} · TAHMİNİ net tahsilat {money(c.estimatedNetReceipts)}</p>)}
    </Card></>}
    <h2 className="text-lg font-semibold">AI Usage</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Bugün çağrı" value={data?.usage.callsToday??0}/><Stat label="Bu ay çağrı" value={data?.usage.callsMonth??0}/>
      <Stat label="Bu ay input token · cache dahil" value={data?.usage.inputTokens??0}/><Stat label="Bu ay output token" value={data?.usage.outputTokens??0}/>
      <Stat label="Bu ay tahmini API maliyeti" value={fmtTry(data?.usage.cost??0)}/><Stat label="Önlenen çağrı · bu ay" value={data?.usage.avoidedCalls??0}/>
      <Stat label="Tahmini tasarruf · bu ay" value={data?.usage.avoidedCost==null?"Fiyat yapılandırılmadı":fmtTry(data.usage.avoidedCost)}/>
    </div>{!!data?.usage.uncertainCosts&&<p className="text-xs">Yanıtı doğrulanamayan çağrılar için bütçede üst sınır rezervi tutuluyor.</p>}
    <p className="text-sm"><Link href="/cfo/odemeler" className="underline">Ödeme takvimi</Link> · <Link href="/cfo/kazananlar" className="underline">Mevcut ithalat kararları</Link></p>
  </div>;
}
