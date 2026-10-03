import "server-only";
import { prisma } from "@/lib/prisma";
import { istanbulPeriod } from "./budget";
import { D } from "./calculations";
import type { Anomaly, CfoAgentSnapshot } from "./types";

export async function loadCfoControlCenter(now=new Date()) {
  const periods=istanbulPeriod(now);
  const [run,lastSnapshot,insights,usage,avoided]=await Promise.all([
    prisma.cfoRun.findFirst({orderBy:{generatedAt:"desc"},select:{generatedAt:true,status:true,type:true,error:true}}),
    prisma.cfoRun.findFirst({where:{snapshotHash:{not:null}},orderBy:{generatedAt:"desc"},select:{snapshot:true,triggerReasons:true,generatedAt:true}}),
    prisma.cfoInsight.findMany({orderBy:{createdAt:"desc"},take:20}),
    prisma.cfoUsage.findMany({where:{createdAt:{gte:periods.monthStart}},select:{status:true,createdAt:true,inputTokens:true,outputTokens:true,cacheReadTokens:true,cacheWriteTokens:true,estimatedCost:true,reservedCostTry:true}}),
    prisma.cfoRun.aggregate({where:{generatedAt:{gte:periods.monthStart}},_sum:{avoidedCalls:true,avoidedCostTry:true}}),
  ]);
  const snapshot=lastSnapshot?.snapshot as unknown as CfoAgentSnapshot|null;
  const anomalies=((lastSnapshot?.triggerReasons as {anomalies?:Anomaly[]}|undefined)?.anomalies??[]);
  const calls=usage.filter(u=>["reserved","completed","failed"].includes(u.status));
  return {run,snapshot,anomalies,insights,usage:{callsToday:calls.filter(u=>u.createdAt>=periods.dayStart).length,callsMonth:calls.length,
    inputTokens:calls.reduce((s,r)=>s+r.inputTokens+r.cacheReadTokens+r.cacheWriteTokens,0),outputTokens:calls.reduce((s,r)=>s+r.outputTokens,0),
    cost:calls.reduce((s,r)=>s.add(Number(r.estimatedCost??r.reservedCostTry??0)),D(0)).toNumber(),uncertainCosts:calls.filter(r=>r.estimatedCost==null).length,
    avoidedCalls:avoided._sum.avoidedCalls??0,avoidedCost:avoided._sum.avoidedCostTry==null?null:Number(avoided._sum.avoidedCostTry)}};
}
