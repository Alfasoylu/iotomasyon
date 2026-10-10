import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { CfoTable,Th,Td } from '@/components/cfo/data-table';
import { QaRow,type PanelKarari,type PanelSorusu } from '@/components/cfo/row-qa-panel';
import { anahtar,birlestir,ithalatSorulari,loadRowQa } from '@/lib/cfo/row-qa';
import { importPolicy,readImportPlanner } from '@/lib/cfo-agent/import-planner';
import { readOrderDebtGate } from '@/lib/cfo-agent/debt-policy';
import { readWork,WORK_SOURCE,HEARTBEAT_ID } from '@/lib/cfo-agent/workflow-store';
import { fmtTry } from '@/lib/cfo/format';
import { ImportOrderSection,type OneriOzeti,type OneriSatiri,type CiroHedefi,type YoldakiKapsam } from './import-order';
import { lastFullMonth, revenueTargetCard } from '@/lib/cfo/revenue';
import { pickStrategicFx, STRATEGIC_FX_SQL_NOW } from '@/lib/fx/strategic';

/** One destination: existing batch rows and incomplete future candidates share owner decisions and notes. */
export default async function ImportPlannerSection(){
  const db={query:<T extends Record<string,unknown>>(sql:string,...params:unknown[])=>prisma.$queryRawUnsafe<T[]>(sql,...params)};
  const [ozet,satirlar,hedef,yoldaki,notes,planner,gate]=await Promise.all([
    prisma.$queryRaw<OneriOzeti[]>`select * from cfo_ithalat_oneri_ozet order by mod`,
    prisma.$queryRaw<OneriSatiri[]>`select * from cfo_ithalat_oneri order by mod,sira`,
    // CFO-008: hedef kartı TEK ciro kaynağından (Goal Engine satırları, geçen tam ay, KDV dahil) ÷ stratejik kur (TCMB) — cfo_ciro_hedef
    // (maliyetsiz SKU'lar hariç, ayar kuru / 48,5 yedeği) okunmaz.
    Promise.all([lastFullMonth(<T,>(sql:string)=>prisma.$queryRawUnsafe<T[]>(sql)),
      prisma.$queryRawUnsafe<{usd:unknown}[]>(`select "monthlyRevenueTargetUsd" as usd from cfo_settings limit 1`),
      prisma.$queryRawUnsafe<{month:unknown;rate:unknown}[]>(STRATEGIC_FX_SQL_NOW)])
      .then(([m,t,f])=>{const c=revenueTargetCard(m,t[0]?.usd==null?null:Number(t[0].usd),pickStrategicFx(f[0],new Date())?.usdTry??null);return c?[c as CiroHedefi]:[];})
      .catch(()=>[] as CiroHedefi[]),
    prisma.$queryRaw<YoldakiKapsam[]>`select * from cfo_yoldaki_kapsam order by eta nulls last,kod`,
    prisma.cfoNote.findMany({where:{source:WORK_SOURCE,archivedAt:null},select:{id:true,body:true}}),
    readImportPlanner(db),readOrderDebtGate(db,new Date()),
  ]);
  const now=new Date().toISOString();
  const candidates=notes.flatMap(n=>{const work=readWork(n.body);return work&&work.item.sku&&(work.item.futureOrder||['rejected','waiting'].includes(work.item.plannerState??''))&&
    !importPolicy(planner,work.item.sku,now).existing.length?[{...work,id:n.id}]:[];}).sort((a,b)=>a.item.priority-b.item.priority||a.item.key.localeCompare(b.item.key));
  const qa=await loadRowQa('ITHALAT_SATIRI',[...satirlar.map(s=>anahtar(s.mod,s.sku)),...candidates.map(w=>anahtar('GELECEK',w.item.sku!))]);
  const decisions=new Map<string,PanelKarari>();
  for(const [sku,k] of qa.kararlar)decisions.set(sku,{sku,karar:k.karar,sebep:k.sebep,gecerli_bitis:k.gecerli_bitis,karar_veren:k.karar_veren});
  for(const row of satirlar){const matching=importPolicy(planner,row.sku,now).decisions;const k=matching.find(d=>d.decision==='ALMA')??matching.find(d=>d.decision==='BEKLE')??matching[0];if(k)decisions.set(row.sku,{sku:k.sku,karar:k.decision,sebep:k.reason,gecerli_bitis:k.expiresAt,karar_veren:null});}
  const questions=new Map<string,PanelSorusu[]>();
  const noteQuestion=(sku:string)=>({code:'PLAN_NOTU' as const,area:'siparis',soru:`${sku} için plan notunuz veya tedarik beklentiniz nedir?`,neden:'Bu satırın notu her CFO çalışmasında okunur. Serbest metin, sipariş veya maliyet değişikliği olarak otomatik uygulanmaz.'});
  for(const s of satirlar){const key=anahtar(s.mod,s.sku);questions.set(key,birlestir([...ithalatSorulari(s),noteQuestion(s.sku)],qa.kayitli.get(key)));}
  let estimate:string|null=null;
  try{estimate=JSON.parse(notes.find(n=>n.id===HEARTBEAT_ID)?.body??'{}').debtForecast?.estimatedOrderDate??null;}catch{}
  const active=candidates.filter(w=>{const policy=importPolicy(planner,w.item.sku!,now);return policy.complete&&!policy.rejected&&!policy.waiting&&!['rejected','completed','resolved','withdrawn'].includes(w.status);});
  const closed=candidates.filter(w=>!active.includes(w));
  const renderCandidate=(w:typeof candidates[number])=>{
    const sku=w.item.sku!,key=anahtar('GELECEK',sku),policy=importPolicy(planner,sku,now);
    const decision=policy.decisions.find(d=>d.decision==='ALMA')??policy.decisions.find(d=>d.decision==='BEKLE')??policy.decisions[0];
    const karar:PanelKarari=decision?{sku:decision.sku,karar:decision.decision,sebep:decision.reason,gecerli_bitis:decision.expiresAt,karar_veren:null}:null;
    return <QaRow key={w.id} colSpan={4} scope="ITHALAT_SATIRI" entityKey={key} sku={decision?.sku??sku} urunAdi={sku}
      sorular={birlestir([noteQuestion(sku)],qa.kayitli.get(key))} karar={karar}>
      <Td strong>{sku}<p className="mt-1 text-xs font-normal">{policy.rejected?'Ret/iptal kararı korunuyor; yeni aday oluşturulmaz.':policy.waiting?'Bekletme kararı korunuyor.':w.item.proposal}</p><details className="mt-2 text-xs"><summary>Kaynaklar ve eksikler</summary><ul>{[...w.item.evidence,...w.item.blockers].map((s,i)=><li key={i}>{s}</li>)}</ul></details>{w.result&&<p className="text-xs">Bildirilen sonuç: {w.result}</p>}</Td>
      <Td right>{w.item.suggestedUnits??'Veri bekleniyor'}<p className="text-xs">60 günlük örnek miktar</p></Td>
      <Td>{policy.rejected||w.status==='rejected'?'Reddedildi':policy.waiting?'Bekletiliyor':w.status==='completed'?'Sonuç bildirildi':'Araştırılıyor'}<p className="text-xs">{gate.open?'Borç eşiği geçildi; diğer koşullar bekleniyor':'Borç eşiği bekleniyor'}</p></Td>
      <Td>{w.item.estimatedOrderDate??'Veri bekleniyor'}<p className="text-xs">Şartlı tahmin</p></Td>
    </QaRow>;
  };
  return <div id="ithalat" className="scroll-mt-20">
    <Card className="mb-4 p-5 space-y-3"><h2 className="font-semibold">Gelecek sipariş planı · CFO adayları</h2>
      <p>Yeni sipariş: {gate.open?'Borç eşiği geçildi; kâr, öz nakit ve parti koşulları ayrıca doğrulanacak':gate.reason}</p>
      <p>Güncel kaynaklardan kayıtlı toplam borç: {gate.totalDebtTry==null?'Ölçülemedi':fmtTry(gate.totalDebtTry)}. Tahmini sipariş tarihi: {estimate??'Veri bekleniyor'}.</p>
      <p className="text-xs">CFO adayları burada kalıcı olarak izlenir. Miktar bir araştırma senaryosudur; maliyet, termin ve taşıma şekli doğrulanmadan kesin parti tutarına katılmaz. Mevcut parti satırları korunur.</p>
      {!planner.available||planner.truncated?<p>Planlayıcı kaynakları eksik; yeni aday ekleme durduruldu. {planner.missing.join(' · ')}</p>:null}
      <CfoTable empty={active.length===0?'Yeni araştırma adayı yok. Mevcut parti satırları ve kararlar aşağıda.':undefined} head={<tr><Th>Ürün / gerekçe</Th><Th right>Örnek adet</Th><Th>Durum</Th><Th>Tahmini tarih</Th><Th>Not / karar</Th></tr>}>{active.map(renderCandidate)}</CfoTable>
      {closed.length>0&&<details><summary>Bekletilen / reddedilen adaylar ve önceki sonuçlar ({closed.length})</summary><CfoTable head={<tr><Th>Ürün</Th><Th right>Örnek adet</Th><Th>Durum</Th><Th>Tarih</Th><Th>Not / karar</Th></tr>}>{closed.map(renderCandidate)}</CfoTable></details>}
      <details><summary>Planlayıcıdaki kalıcı ürün kararları</summary><ul>{planner.decisions.filter(d=>!d.expiresAt||d.expiresAt.slice(0,10)>=now.slice(0,10)).map(d=><li key={d.sku}>{d.sku} · {d.decision} · {d.reason}{d.expiresAt?' · '+d.expiresAt.slice(0,10):' · süresiz'}</li>)}</ul></details>
    </Card>
    <ImportOrderSection ozet={ozet} satirlar={satirlar} hedef={hedef[0]??null} yoldaki={yoldaki} sorular={questions} kararlar={decisions} orderGate={gate}/>
  </div>;
}
