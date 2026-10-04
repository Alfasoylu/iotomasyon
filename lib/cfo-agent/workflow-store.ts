import { createHash,randomUUID } from 'node:crypto';
import type { planCfoWork, WorkItem } from './workflow-plan';
import { workflowId } from './workflow-plan';
import type { ReadSource, Row } from './sources';
import { TOPIC_NAMES } from './workflow-memory';
export const WORK_SOURCE='cfo-workflow-v1';
export const HEARTBEAT_ID='cfo-workflow-heartbeat-v1';
export type WorkState='research'|'pending_approval'|'approved'|'rejected'|'completed'|'needs_review'|'resolved'|'withdrawn';
export type StoredWork={version:1;revision:string;status:WorkState;item:WorkItem;observedAt:string;decisionAt?:string;decisionBy?:string;result?:string};
export function readWork(body:string):StoredWork|null{
  try{const v=JSON.parse(body);return v.version===1&&typeof v.revision==='string'&&['research','pending_approval','approved','rejected','completed','needs_review','resolved','withdrawn'].includes(v.status)&&typeof v.item?.key==='string'&&typeof v.item?.proposal==='string'&&Array.isArray(v.item?.blockers)?v:null;}catch{return null;}
}
export const revision=(item:WorkItem)=>createHash('sha256').update(JSON.stringify(item)).digest('hex');
export interface WriteSource extends ReadSource {execute(sql:string,...params:unknown[]):Promise<unknown>}
type AuditRow={id:string;area:string;item:string;oldValue:string|null;newValue:string;source:string;kind:string;note:string|null};
async function saveAudits(db:WriteSource,rows:AuditRow[]){
  if(!rows.length)return;
  await db.execute(`insert into cfo_change_log(id,area,item,"oldValue","newValue",source,kind,note)
    select id,area,item,"oldValue","newValue",source,kind,note from jsonb_to_recordset($1::jsonb)
    as r(id text,area text,item text,"oldValue" text,"newValue" text,source text,kind text,note text)`,JSON.stringify(rows));
}
type AnswerContext={id:string;question:string;answer:string|null;area:string;answeredAt:Date|null;processNote:string|null};
export async function saveAnswerContext(db:WriteSource,answers:AnswerContext[]){
  const pending=answers.filter(answer=>!answer.processNote?.startsWith(`workflow_read:${answer.answeredAt?.toISOString()}`));
  if(!pending.length)return 0;
  // Update only answers that still match the observation. Returned rows are the
  // authoritative statements; changed/deleted answers never leave stale notes.
  const rows=await db.query<Row>(`update cfo_question q set "processNote"=r.marker
    from jsonb_to_recordset($1::jsonb) as r(id text,"answeredAt" timestamp,marker text)
    where q.id=r.id and q."answeredAt" is not distinct from r."answeredAt"
      and q.status='CEVAPLANDI' and q."processedAt" is null
    returning q.id,q.question,q.answer,q.area`,JSON.stringify(pending.map(answer=>({id:answer.id,answeredAt:answer.answeredAt?.toISOString()??null,
      marker:`workflow_read:${answer.answeredAt?.toISOString()} · Cevap bağlama alındı; finansal doğrulama/uygulama bekleniyor.`}))));
  if(!rows.length)return 0;
  const notes=rows.map(row=>({id:'cfo-answer-'+row.id,title:String(row.question).slice(0,250),body:row.answer==null||row.answer===''?'Dosya cevabı; içeriği henüz doğrulanmadı.':String(row.answer),category:String(row.area),sourceQuestionId:String(row.id)}));
  await db.execute(`insert into cfo_note(id,title,body,category,"dataTag",source,"sourceQuestionId",pinned,"createdAt","updatedAt")
    select id,title,body,category,'TEYIT_EDILMELI','cfo-workflow-answer',"sourceQuestionId",false,now(),now()
    from jsonb_to_recordset($1::jsonb) as r(id text,title text,body text,category text,"sourceQuestionId" text)
    on conflict(id) do update set body=excluded.body,"dataTag"=excluded."dataTag","updatedAt"=now()`,JSON.stringify(notes));
  await saveAudits(db,rows.map(row=>({id:randomUUID(),area:'soru',item:String(row.question).slice(0,120),oldValue:null,newValue:'cfo-answer-'+row.id,
    source:WORK_SOURCE,kind:'arastirma',note:'Cevap bağlama alındı; maliyet ve finansal tablolar değiştirilmedi.'})));
  return rows.length;
}
export type CyclePlan=Omit<ReturnType<typeof planCfoWork>,'agenda'|'orderGate'|'debtForecast'>&Partial<Pick<ReturnType<typeof planCfoWork>,'agenda'|'orderGate'|'debtForecast'>>;
export async function saveWorkPlan(db:WriteSource,plan:CyclePlan,trigger:string){
  const existing=await db.query<Row>('select id, body from cfo_note where source=$1 and "archivedAt" is null',WORK_SOURCE);
  const map=new Map(existing.map(r=>[String(r.id),r]));let changed=0;
  const writes:{id:string;title:string;body:string}[]=[];const audits:AuditRow[]=[];
  if(plan.agenda?.questionRanks.length)await db.execute(`update cfo_question q set priority=r.priority from jsonb_to_recordset($1::jsonb) as r(id text,priority integer)
    where q.id=r.id and q.status='ACIK' and q.id like 'cfo-work-%'`,JSON.stringify(plan.agenda.questionRanks));
  const audit=(title:string,old:unknown,value:unknown)=>audits.push({id:randomUUID(),area:'strateji',item:title,oldValue:old?JSON.stringify(old):null,newValue:JSON.stringify(value),source:WORK_SOURCE,kind:'analiz',note:trigger});
  // A SKU can occur on several channels. Write each stable key once.
  const items=[...new Map(plan.items.map(item=>[workflowId(item.key),item])).values()];
  for(const item of items){
    const id=workflowId(item.key),prior=map.get(id),old=prior?readWork(String(prior.body)):null,nextRevision=revision(item);
    if(old?.status==='rejected'&&item.priority>=old.item.priority)continue;
    if(old?.revision===nextRevision&&old.status!=='resolved'&&old.status!=='withdrawn'){
      if(!['completed','rejected'].includes(old.status))writes.push({id,title:item.title,body:JSON.stringify({...old,observedAt:plan.asOf})});
      continue;
    }
    const status:WorkState=old?.status==='approved'?'needs_review':item.requiresApproval?'pending_approval':'research';
    const value:StoredWork={version:1,revision:nextRevision,status,item,observedAt:plan.asOf};
    writes.push({id,title:item.title,body:JSON.stringify(value)});changed++;
    audit(item.title,old,value);
  }
  const active=new Set(plan.items.map(i=>workflowId(i.key)));
  for(const [id,row] of map){if(id===HEARTBEAT_ID||active.has(id))continue;const old=readWork(String(row.body));
    // Disappearing signals do not prove that an approved action was completed.
    if(!old||['completed','rejected','resolved','withdrawn'].includes(old.status))continue;
    const value={...old,status:old.status==='approved'||old.status==='needs_review'?'withdrawn':'resolved',observedAt:plan.asOf,item:{...old.item,requiresApproval:false,blockers:[...old.item.blockers,'Bu bulgu son döngüde bulunmadı; önce kaynak ve koşulları doğrula']}};
    writes.push({id,title:old.item.title,body:JSON.stringify(value)});
    audit(old.item.title,old,value);changed++;
  }
  if(writes.length)await db.execute(`insert into cfo_note(id,title,body,category,"dataTag",source,pinned,"createdAt","updatedAt")
    select id,title,body,'strateji','TEYIT_EDILMELI',$2,false,now(),now()
    from jsonb_to_recordset($1::jsonb) as r(id text,title text,body text)
    on conflict(id) do update set title=excluded.title,body=excluded.body,"updatedAt"=now()`,JSON.stringify(writes),WORK_SOURCE);
  const questions=[...new Map(plan.questions.map(q=>[workflowId('question:'+q.key),{id:workflowId('question:'+q.key),...q}])).values()];
  const inserted=questions.length?await db.query<Row>(`insert into cfo_question(id,question,why,area,priority,status)
    select id,question,why,area,priority,'ACIK' from jsonb_to_recordset($1::jsonb)
    as r(id text,question text,why text,area text,priority integer)
    on conflict(id) do nothing returning id`,JSON.stringify(questions)):[];
  const newQuestionIds=new Set(inserted.map(row=>String(row.id)));
  for(const q of questions)if(newQuestionIds.has(q.id)){
    audits.push({id:randomUUID(),area:'soru',item:q.question,oldValue:null,newValue:q.why,source:WORK_SOURCE,kind:'arastirma',note:null});
  }
  const oldHeartbeat=map.get(HEARTBEAT_ID);
  let oldGoals:unknown=null;try{oldGoals=oldHeartbeat?JSON.parse(String(oldHeartbeat.body)).goals:null;}catch{}
  if(JSON.stringify(oldGoals)!==JSON.stringify(plan.goals))audits.push({id:randomUUID(),area:'strateji',item:'CFO hedef gözlemleri',oldValue:oldGoals?JSON.stringify(oldGoals):null,newValue:JSON.stringify(plan.goals),source:WORK_SOURCE,kind:'analiz',note:'Defter gözlemi; gerçekleşmiş kazanç veya tam dönem başarısı değildir.'});
  await saveAudits(db,audits);
  const asked=inserted.length;
  if(plan.agenda){
    const agenda=plan.agenda;
    const focus=items.filter(item=>agenda.focusKeys.includes(item.key));
    const lines=[`Çalışma özeti: ${TOPIC_NAMES[agenda.topic]} · ${trigger}`,
      `Yapılanlar: önceki çalışma kaydı ve defter okundu; ${agenda.answersReviewed.length} yeni/değişmiş cevap incelendi; ${changed} çalışma kaydı güncellendi; ${asked} yeni soru yazıldı.`,
      'Tespitler:',...focus.map(item=>`• ${item.title}: ${item.proposal}`),
      'Aksiyonlar:',...focus.map(item=>`• ${item.requiresApproval?'Onaya sunuldu':'Araştırma/gelecek sipariş listesine kaydedildi'}: ${item.title}`),
      'Eksikler / beklenenler:',...agenda.waiting.map(text=>`• ${text}`),
      `Yeni sipariş: ${plan.orderGate?.open?'borç eşiği geçildi; diğer şartlar doğrulanacak':'kapalı; adaylar yalnız gelecek sipariş listesinde'}`,
      `Tahmini sipariş tarihi: ${plan.debtForecast?.estimatedOrderDate??'hesaplanamıyor; veri eksik veya ufukta eşiğe ulaşılamıyor'}`,
      `Aynı girdilerle ilerlemeyen döngü sayısı: ${agenda.unchangedCycles}`,
      `Sonraki çalışma: ${TOPIC_NAMES[agenda.nextTopic]}`,...agenda.nextSteps];
    await db.execute(`insert into cfo_note(id,title,body,category,"dataTag",source,pinned,"createdAt","updatedAt")
      values($1,$2,$3,'strateji','TAHMINI','cfo-workflow-journal',false,now(),now())`,
      'cfo-run-'+randomUUID(),`CFO çalışma ${agenda.runCount} · ${TOPIC_NAMES[agenda.topic]}`,lines.join('\n'));
  }
  const heartbeat={version:1,lastSuccessAt:new Date().toISOString(),snapshotAsOf:plan.asOf,trigger,goals:plan.goals,items:items.length,newQuestions:asked,changedItems:changed,
    agenda:plan.agenda,orderGate:plan.orderGate,debtForecast:plan.debtForecast,schedule:'daily_plus_data_events',automaticFinancialExecution:false};
  await db.execute(`insert into cfo_note(id,title,body,category,"dataTag",source,pinned,"createdAt","updatedAt") values($1,'CFO çalışma döngüsü', $2,'strateji','TAHMINI',$3,false,now(),now())
    on conflict(id) do update set body=excluded.body,"updatedAt"=now()`,HEARTBEAT_ID,JSON.stringify(heartbeat),WORK_SOURCE);
  return {completed:true as const,changedItems:changed,newQuestions:asked,items:items.length};
}
export async function transitionWork(db:WriteSource,id:string,expectedRevision:string,action:'approve'|'reject'|'complete',actor:string,result:string,now:Date){
  const [row]=await db.query<Row>('select body from cfo_note where id=$1 and source=$2 for update',id,WORK_SOURCE);const old=row?readWork(String(row.body)):null;
  if(!old||old.revision!==expectedRevision)throw new Error('decision_changed');
  if(action==='approve'&&(!['pending_approval','needs_review'].includes(old.status)||!old.item.requiresApproval))throw new Error('approval_unavailable');
  if(action==='approve'&&(now.getTime()-Date.parse(old.observedAt)>24*3600000))throw new Error('decision_expired');
  if(action==='complete'&&old.status!=='approved'&&!(old.status==='research'&&!old.item.requiresApproval))throw new Error('approval_required');
  if(action==='reject'&&!['research','pending_approval','needs_review'].includes(old.status))throw new Error('decision_state');
  if((action==='complete'||action==='reject')&&result.trim().length<5)throw new Error('result_required');
  const value:StoredWork={...old,status:action==='approve'?'approved':action==='reject'?'rejected':'completed',decisionAt:now.toISOString(),decisionBy:actor,result:result.trim().slice(0,2000)};
  await db.execute('update cfo_note set body=$2,"updatedAt"=now() where id=$1',id,JSON.stringify(value));
  await db.execute(`insert into cfo_change_log(id,area,item,"oldValue","newValue",source,kind) values($1,'strateji',$2,$3,$4,$5,$6)`,randomUUID(),old.item.title,JSON.stringify(old),JSON.stringify(value),actor,action==='approve'?'onay':action==='complete'?'aksiyon':'karar');
  return value;
}
