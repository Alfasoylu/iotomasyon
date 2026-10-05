import { createHash } from 'node:crypto';
import { skuKey } from '../cfo-agent/sku';
import type { WriteSource } from '../cfo-agent/workflow-store';
export type RowQuestionInput={scope:string;entityKey:string;code:string;question:string;why:string;area:string;priority?:number};
export function validateRowQuestion(input:RowQuestionInput){
  return ['ITHALAT_SATIRI','KAZANAN_SATIRI'].includes(input.scope)&&
    ['PLAN_NOTU','MALIYET_YOK','KAPSAM_UZUN','ORAN_GUVENI_DUSUK','MALIYET_SUPHELI','TEDARIK'].includes(input.code)&&
    input.entityKey.length>2&&input.entityKey.length<=300&&input.entityKey.includes('|')&&
    input.question.trim().length>=5&&input.question.length<=4000&&input.why.length<=4000&&input.area.length<=40;
}
const hash=(key:string)=>createHash('sha256').update(key).digest('hex').slice(0,32);
/** `scope|...|sku`'den SKU'yu çıkarır (öneki atar, skuKey ile normalize eder). */
export const skuFromEntityKey=(entity:string)=>skuKey(entity.split('|').slice(1).join('|'));
const sku=skuFromEntityKey;
/** Same table and identity on the planner, question page and cycle. Caller owns the transaction. */
export async function ensureRowQuestion(db:WriteSource,input:RowQuestionInput){
  if(!validateRowQuestion(input))throw new Error('invalid_row_question');
  const key=input.scope+'|'+(input.code==='MALIYET_YOK'?sku(input.entityKey):skuKey(input.entityKey))+'|'+input.code;
  await db.query('select pg_advisory_xact_lock(hashtext($1))::text as locked',key);
  const legacyId='cfo-work-'+hash('question:cost:'+sku(input.entityKey));
  const rows=await db.query<{id:string;answer:string|null;status:string;scope:string|null;entity_key:string|null;code:string|null}>(
    `select id,answer,status,to_jsonb(q)->>'scope' as scope,to_jsonb(q)->>'entity_key' as entity_key,to_jsonb(q)->>'code' as code
      from cfo_question q where (to_jsonb(q)->>'scope'=$1 and to_jsonb(q)->>'code'=$2) or ($2='MALIYET_YOK' and id=$3)
      order by "askedAt" desc,id limit 10001`,input.scope,input.code,legacyId);
  if(rows.length>10000)throw new Error('question_identity_incomplete');
  const existing=rows.find(q=>skuKey(q.entity_key??'')===skuKey(input.entityKey))??rows.find(q=>input.code==='MALIYET_YOK'&&(sku(q.entity_key??'')===sku(input.entityKey)||q.id===legacyId));
  if(existing){
    // Attach legacy generated questions without changing answers, cancellation or wording.
    if(!existing.scope)await db.execute('update cfo_question set scope=$2,entity_key=$3,code=$4 where id=$1 and scope is null',existing.id,input.scope,input.entityKey,input.code);
    return {...existing,created:false};
  }
  const id='cfo-row-'+hash(key);
  const inserted=await db.query<{id:string;answer:string|null;status:string}>(`insert into cfo_question(id,question,why,area,priority,status,scope,entity_key,code)
    values($1,$2,$3,$4,$5,'ACIK',$6,$7,$8) on conflict do nothing returning id,answer,status`,id,input.question,input.why,input.area,input.priority??2,input.scope,input.entityKey,input.code);
  const row=inserted[0]??(await db.query<{id:string;answer:string|null;status:string}>('select id,answer,status from cfo_question where id=$1',id))[0];
  if(!row)throw new Error('question_identity_changed');
  return {...row,created:inserted.length===1};
}
