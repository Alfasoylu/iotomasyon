import { z } from "zod";
import type { Anomaly } from "./types";
export type ShadowRun={periodKey:string;status:string;reasons:{anomalies?:Anomaly[]}};
export type ShadowReview={date:string;fingerprint:string;verdict:"real"|"false_alarm"};
const reviewSchema=z.array(z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),fingerprint:z.string().min(1),verdict:z.enum(["real","false_alarm"])}).strict());
export function evaluateShadowWeek(start:string,runs:ShadowRun[],input:ShadowReview[],calls:number,now:Date){
  const reviews=reviewSchema.parse(input),base=new Date(`${start}T00:00:00+03:00`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(base.getTime())||new Date(base.getTime()+3*3600000).toISOString().slice(0,10)!==start)throw new Error("invalid_shadow_start");
  const days=Array.from({length:7},(_,i)=>{
    const date=new Date(base.getTime()+i*86400000+3*3600000).toISOString().slice(0,10),rows=runs.filter(r=>r.periodKey.startsWith(date)),findings=new Map<string,Anomaly>();
    for(const row of rows)for(const a of row.reasons.anomalies??[])findings.set(a.fingerprint,a);
    const entries=[...findings].map(([fingerprint,a])=>{
      const verdicts=reviews.filter(r=>r.date===date&&r.fingerprint===fingerprint).map(r=>r.verdict);
      const verdict=verdicts.length===1?verdicts[0]:null;
      return {fingerprint,rule:a.rule,entity:a.entityId,severity:a.severity,verdict};
    });
    const falseAlarms=entries.filter(e=>e.verdict==="false_alarm").length,unreviewed=entries.filter(e=>e.verdict==null).length;
    const hours=new Set(rows.map(r=>r.periodKey)).size;
    return {date,hours,anomalies:entries.length,falseAlarms,unreviewed,findings:entries,passed:hours>=24&&rows.every(r=>["ai_disabled","no_actionable_anomaly"].includes(r.status))&&falseAlarms<=3&&unreviewed===0};
  });
  return {start,end:new Date(base.getTime()+7*86400000).toISOString(),aiCalls:calls,elapsed:now.getTime()>=base.getTime()+7*86400000,days,
    passed:now.getTime()>=base.getTime()+7*86400000&&calls===0&&days.every(d=>d.passed)};
}
