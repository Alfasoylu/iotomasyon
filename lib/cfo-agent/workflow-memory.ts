import { createHash } from 'node:crypto';
import type { Knowledge, WorkItem } from './workflow-plan';

import { TOPICS,TOPIC_NAMES,type Topic } from './workflow-topics';
export { TOPIC_NAMES } from './workflow-topics';
export type CycleMemory = {nextTopic?:Topic;fingerprint?:string;unchangedCycles?:number;runCount?:number;closedKeys?:string[]};
export type CycleAgenda = {version:1;topic:Topic;nextTopic:Topic;fingerprint:string;unchangedCycles:number;runCount:number;
  priorRead:boolean;answersReviewed:string[];focusKeys:string[];waiting:string[];nextSteps:string[];questionRanks:{id:string;priority:number}[]};
export function readMemory(body:string|null):CycleMemory {
  try { const value=JSON.parse(body??'');const memory=value.agenda??{};
    return {nextTopic:TOPICS.includes(memory.nextTopic)?memory.nextTopic:undefined,
      fingerprint:typeof memory.fingerprint==='string'?memory.fingerprint:undefined,
      unchangedCycles:Number.isSafeInteger(memory.unchangedCycles)?memory.unchangedCycles:0,
      runCount:Number.isSafeInteger(memory.runCount)?memory.runCount:0};
  } catch {return {};}
}
export function itemTopic(item:WorkItem):Topic {
  if(item.key.startsWith('sales:'))return 'sales';
  if(item.kind==='cash'||item.key.startsWith('debt:'))return 'cash';
  if(item.key.startsWith('cost:')||item.key.startsWith('reconcile:')||item.kind==='pricing'||item.key.startsWith('answer:'))return 'costs';
  if(item.key.startsWith('imports:')||item.key.startsWith('stock:')||item.kind==='procurement'||item.kind==='liquidation')return 'stock';
  return 'growth';
}
export function buildAgenda(items:WorkItem[],knowledge:Knowledge[],memory:CycleMemory,observation:unknown,priorRead:boolean):CycleAgenda {
  const topic=memory.nextTopic??'cash';
  const nextTopic=TOPICS[(TOPICS.indexOf(topic)+1)%TOPICS.length];
  const answersReviewed=knowledge.filter(q=>q.status==='CEVAPLANDI'&&q.answerChanged).map(q=>q.id);
  const fingerprint=createHash('sha256').update(JSON.stringify({observation,items,answers:knowledge.filter(q=>q.status==='CEVAPLANDI').sort((a,b)=>a.id.localeCompare(b.id)).map(q=>[q.id,q.answer])})).digest('hex');
  const unchangedCycles=memory.fingerprint===fingerprint?(memory.unchangedCycles??0)+1:0;
  const open=items.filter(item=>!memory.closedKeys?.includes(item.key));
  const focused=open.filter(item=>itemTopic(item)===topic||item.priority===1||item.key.startsWith('answer:'));
  const focusKeys=[...new Set([
    ...open.filter(item=>item.priority===1&&!item.key.startsWith('answer:')).slice(0,3),
    ...open.filter(item=>item.key.startsWith('answer:')).slice(0,2),
    ...open.filter(item=>itemTopic(item)===topic).slice(0,3),
  ].map(item=>item.key))];
  return {version:1,topic,nextTopic,fingerprint,unchangedCycles,runCount:(memory.runCount??0)+1,priorRead,answersReviewed,focusKeys,
    waiting:[...new Set(focused.flatMap(item=>item.blockers))].slice(0,8),
    nextSteps:[`${TOPIC_NAMES[nextTopic]} konusunu incele; açık acil riskleri ve yeni cevapları önce kontrol et.`,
      ...(unchangedCycles>=2?['Kaynak veya cevap değişmedi. Aynı soruları çoğaltma; bekleyen veriyi kaydet ve diğer hedef işlerine ilerle.']:[])],questionRanks:[]};
}
