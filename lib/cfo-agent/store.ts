import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { istanbulPeriod } from "./budget";
import type { AiInsight, Anomaly, CfoAgentSnapshot, Evidence, RunType } from "./types";
import { CALCULATION_VERSION, SCHEMA_VERSION } from "./types";
/** Valid model answers that skipped an anomaly before it cools down without an insight. */
export const DECLINED_RUNS_FOR_COOLDOWN=2;

const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export interface UsageWrite {
  provider:string;model:string;status:string;triggerReason:string;inputTokens?:number;outputTokens?:number;
  cacheReadTokens?:number;cacheWriteTokens?:number;estimatedCost?:number|null;reservedCostTry?:number|null;providerRequestId?:string|null;priceContext?:unknown;
}
export interface CfoStore {
  begin(type:RunType,period:string,now:Date):Promise<string|null>;
  snapshot(id:string,snapshot:CfoAgentSnapshot,hash:string,anomalies:Anomaly[],sent:Anomaly[]):Promise<void>;
  recent(key:string,now:Date,cooldownHours?:number):Promise<{createdAt:Date;impact:number|null}|null>;
  totals(now:Date):Promise<{callsToday:number;spentThisMonth:number}>;
  usage(runId:string,data:UsageWrite):Promise<string>;
  updateUsage(id:string,data:UsageWrite):Promise<void>;
  insights(runId:string,insights:AiInsight[],anomalies:Anomaly[],evidence:Evidence[]):Promise<void>;
  finish(id:string,status:string,now:Date,avoided:number,savedCost:number|null,error?:string):Promise<void>;
}
export const cfoStore:CfoStore={
  async begin(type,period,now){try{const run=await prisma.cfoRun.create({data:{type,status:"running",periodKey:period,idempotencyKey:`${type}:${period}`,generatedAt:now,startedAt:now,triggerReasons:[],schemaVersion:SCHEMA_VERSION,calculationVersion:CALCULATION_VERSION}});return run.id;}
    catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2002")return null;throw e;}},
  async snapshot(id,snapshot,hash,anomalies,sent){await prisma.cfoRun.update({where:{id},data:{snapshot:json(snapshot),snapshotHash:hash,triggerReasons:json({anomalies,sentAnomalies:sent})}});},
  async recent(key,now,cooldownHours=72){
    // Cooldown starts only on delivery (2026-10-07): an insight was written for this anomaly, or the model gave a valid
    // answer (status completed) without advice for it twice — no endless re-billing of an anomaly the model declines.
    // A failed, truncated, fully rejected (invalid_output) or skipped call leaves the anomaly open for the next run.
    const since=new Date(now.getTime()-cooldownHours*3600000);
    const impactOf=(t:unknown)=>(t as {sentAnomalies?:Anomaly[]}|null)?.sentAnomalies?.find(a=>a.cooldownKey===key)?.impact?.value??null;
    const insight=await prisma.cfoInsight.findFirst({where:{cooldownKey:key,createdAt:{gte:since}},orderBy:{createdAt:"desc"},select:{createdAt:true,run:{select:{triggerReasons:true}}}});
    if(insight)return {createdAt:insight.createdAt,impact:impactOf(insight.run.triggerReasons)};
    const rows=await prisma.cfoRun.findMany({where:{generatedAt:{gte:since},status:"completed"},orderBy:{generatedAt:"desc"},take:100,select:{generatedAt:true,triggerReasons:true}});
    const declined=rows.filter(r=>(r.triggerReasons as {sentAnomalies?:Anomaly[]}|null)?.sentAnomalies?.some(a=>a.cooldownKey===key));
    return declined.length>=DECLINED_RUNS_FOR_COOLDOWN?{createdAt:declined[0].generatedAt,impact:impactOf(declined[0].triggerReasons)}:null;
  },
  async totals(now){const p=istanbulPeriod(now);const rows=await prisma.cfoUsage.findMany({where:{createdAt:{gte:p.monthStart},status:{in:["reserved","completed","failed"]}},select:{createdAt:true,estimatedCost:true,reservedCostTry:true}});
    return {callsToday:rows.filter(r=>r.createdAt>=p.dayStart).length,spentThisMonth:rows.reduce((s,r)=>s.add(r.estimatedCost??r.reservedCostTry??0),new Prisma.Decimal(0)).toNumber()};},
  async usage(runId,data){const row=await prisma.cfoUsage.create({data:{...data,runId,priceContext:data.priceContext===undefined?undefined:json(data.priceContext)}});return row.id;},
  async updateUsage(id,data){await prisma.cfoUsage.update({where:{id},data:{...data,priceContext:data.priceContext===undefined?undefined:json(data.priceContext)}});},
  async insights(runId,insights,anomalies,evidence){
    if(!insights.length)return;
    await prisma.cfoInsight.createMany({data:insights.map(i=>{const a=anomalies.find(a=>a.id===i.anomalyId)!;
      return {runId,severity:a.severity,category:a.category,entityType:a.entityType,entityId:a.entityId,fingerprint:a.fingerprint,cooldownKey:a.cooldownKey,
        title:i.title,observation:i.observation,recommendation:i.recommendation,riskIfIgnored:i.riskIfIgnored,confidence:i.confidence,
        financialImpact:a.impact?.value,financialImpactType:a.impact?(a.impact.estimated?"estimated":"measured"):null,
        impactCalculation:a.impact?json(a.impact):undefined,evidence:json(evidence.filter(e=>i.evidenceIds.includes(e.id))),status:"open"};})});
  },
  async finish(id,status,now,avoided,savedCost,error){await prisma.cfoRun.update({where:{id},data:{status,finishedAt:now,avoidedCalls:avoided,avoidedCostTry:savedCost,error:error??null}});},
};
