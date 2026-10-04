import { createHash } from 'node:crypto';
import type { planCfoWork, WorkItem } from './workflow-plan';
import { workflowId } from './workflow-plan';
import type { ReadSource, Row } from './sources';
export const WORK_SOURCE='cfo-workflow-v1';
export const HEARTBEAT_ID='cfo-workflow-heartbeat-v1';
export type WorkState='research'|'pending_approval'|'approved'|'rejected'|'completed'|'needs_review'|'resolved'|'withdrawn';
export type StoredWork={version:1;revision:string;status:WorkState;item:WorkItem;observedAt:string;decisionAt?:string;decisionBy?:string;result?:string};
export function readWork(body:string):StoredWork|null{
  try{const v=JSON.parse(body);return v.version===1&&typeof v.revision==='string'&&['research','pending_approval','approved','rejected','completed','needs_review','resolved','withdrawn'].includes(v.status)&&typeof v.item?.key==='string'&&typeof v.item?.proposal==='string'&&Array.isArray(v.item?.blockers)?v:null;}catch{return null;}
}
export const revision=(item:WorkItem)=>createHash('sha256').update(JSON.stringify(item)).digest('hex');
export interface WriteSource extends ReadSource {execute(sql:string,...params:unknown[]):Promise<unknown>}
export async function saveWorkPlan(db:WriteSource,plan:ReturnType<typeof planCfoWork>,trigger:string){
  const existing=await db.query<Row>('select id, body from cfo_note where source=$1 and "archivedAt" is null',WORK_SOURCE);
  const map=new Map(existing.map(r=>[String(r.id),r]));let changed=0,asked=0;
  for(const item of plan.items){
    const id=workflowId(item.key),prior=map.get(id),old=prior?readWork(String(prior.body)):null,nextRevision=revision(item);
    if(old?.status==='rejected'&&item.priority>=old.item.priority)continue;
    if(old?.revision===nextRevision&&old.status!=='resolved'&&old.status!=='withdrawn'){
      if(!['completed','rejected'].includes(old.status))await db.execute('update cfo_note set body=$2,"updatedAt"=now() where id=$1',id,JSON.stringify({...old,observedAt:plan.asOf}));
      continue;
    }
    const status:WorkState=old?.status==='approved'?'needs_review':item.requiresApproval?'pending_approval':'research';
    const value:StoredWork={version:1,revision:nextRevision,status,item,observedAt:plan.asOf};
    await db.execute(`insert into cfo_note(id,title,body,category,"dataTag",source,pinned,"createdAt","updatedAt")
      values($1,$2,$3,'strateji','TEYIT_EDILMELI',$4,false,now(),now())
      on conflict(id) do update set title=excluded.title,body=excluded.body,"updatedAt"=now()`,id,item.title,JSON.stringify(value),WORK_SOURCE);changed++;
    await db.execute(`insert into cfo_change_log(id,area,item,"oldValue","newValue",source,kind,note)
      values($1,'strateji',$2,$3,$4,$5,'analiz',$6)`,crypto.randomUUID(),item.title,old?JSON.stringify(old):null,JSON.stringify(value),WORK_SOURCE,trigger);
  }
  const active=new Set(plan.items.map(i=>workflowId(i.key)));
  for(const [id,row] of map){if(id===HEARTBEAT_ID||active.has(id))continue;const old=readWork(String(row.body));
    // Disappearing signals do not prove that an approved action was completed.
    if(!old||['completed','rejected','resolved','withdrawn'].includes(old.status))continue;
    const value={...old,status:old.status==='approved'||old.status==='needs_review'?'withdrawn':'resolved',observedAt:plan.asOf,item:{...old.item,requiresApproval:false,blockers:[...old.item.blockers,'Bu bulgu son döngüde bulunmadı; önce kaynak ve koşulları doğrula']}};
    await db.execute('update cfo_note set body=$2,"updatedAt"=now() where id=$1',id,JSON.stringify(value));
    await db.execute(`insert into cfo_change_log(id,area,item,"oldValue","newValue",source,kind) values($1,'strateji',$2,$3,$4,$5,'analiz')`,crypto.randomUUID(),old.item.title,JSON.stringify(old),JSON.stringify(value),WORK_SOURCE);changed++;
  }
  for(const q of plan.questions){
    const rows=await db.query<Row>(`insert into cfo_question(id,question,why,area,priority,status) values($1,$2,$3,$4,$5,'ACIK') on conflict(id) do nothing returning id`,workflowId('question:'+q.key),q.question,q.why,q.area,q.priority);asked+=rows.length;
    if(rows.length)await db.execute(`insert into cfo_change_log(id,area,item,"newValue",source,kind) values($1,'soru',$2,$3,$4,'arastirma')`,crypto.randomUUID(),q.question, q.why,WORK_SOURCE);
  }
  const oldHeartbeat=map.get(HEARTBEAT_ID);
  let oldGoals:unknown=null;try{oldGoals=oldHeartbeat?JSON.parse(String(oldHeartbeat.body)).goals:null;}catch{}
  if(JSON.stringify(oldGoals)!==JSON.stringify(plan.goals))await db.execute(`insert into cfo_change_log(id,area,item,"oldValue","newValue",source,kind,note)
    values($1,'strateji','CFO hedef gözlemleri',$2,$3,$4,'analiz','Defter gözlemi; gerçekleşmiş kazanç veya tam dönem başarısı değildir.')`,crypto.randomUUID(),oldGoals?JSON.stringify(oldGoals):null,JSON.stringify(plan.goals),WORK_SOURCE);
  const heartbeat={version:1,lastSuccessAt:new Date().toISOString(),snapshotAsOf:plan.asOf,trigger,goals:plan.goals,items:plan.items.length,newQuestions:asked,changedItems:changed,schedule:'daily_plus_data_events',automaticFinancialExecution:false};
  await db.execute(`insert into cfo_note(id,title,body,category,"dataTag",source,pinned,"createdAt","updatedAt") values($1,'CFO çalışma döngüsü', $2,'strateji','TAHMINI',$3,false,now(),now())
    on conflict(id) do update set body=excluded.body,"updatedAt"=now()`,HEARTBEAT_ID,JSON.stringify(heartbeat),WORK_SOURCE);
  return {completed:true as const,changedItems:changed,newQuestions:asked,items:plan.items.length};
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
  await db.execute(`insert into cfo_change_log(id,area,item,"oldValue","newValue",source,kind) values($1,'strateji',$2,$3,$4,$5,$6)`,crypto.randomUUID(),old.item.title,JSON.stringify(old),JSON.stringify(value),actor,action==='approve'?'onay':action==='complete'?'aksiyon':'karar');
  return value;
}
