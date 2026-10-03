import "server-only";
import { getCfoConfig, type CfoConfig } from "./config";
import { buildCfoAgentSnapshot } from "./snapshot";
import { detectCfoAnomalies, shouldReopen } from "./anomalies";
import { evidence, hashSnapshot } from "./evidence";
import { existingQueueRecords, retrieveRelevantMemory } from "./memory";
import { createCfoProvider, ProviderError, reasoningPayload, type CfoReasoningProvider } from "./provider";
import { createMonitorLock, type MonitorLock } from "./lock";
import { cfoStore, type CfoStore, type UsageWrite } from "./store";
import { budgetBlock, costTry, istanbulPeriod, reservedCost } from "./budget";
import { validateAiOutput } from "./validate-ai-output";
import type { Anomaly, CfoAgentSnapshot, MemoryItem, RunType } from "./types";

export type RunnerDependencies={now?:Date;config?:CfoConfig;lock?:MonitorLock;store?:CfoStore;provider?:CfoReasoningProvider|null;
  snapshot?:()=>Promise<CfoAgentSnapshot>;queues?:(anomalies:Anomaly[])=>Promise<Map<string,string[]>>;memory?:(anomalies:Anomaly[])=>Promise<MemoryItem[]>};
export async function runCfoMonitor(deps:RunnerDependencies={}) {return run("monitor",deps);}
export async function runCfoMorningBrief(deps:RunnerDependencies={}) {return run("morning",deps);}

async function run(type:RunType,deps:RunnerDependencies) {
  const now=deps.now??new Date(),config=deps.config??getCfoConfig(),period=istanbulPeriod(now);
  if(!config.monitorEnabled)return {status:"disabled"};
  if(type==="morning"&&period.minutes<9*60+30)return {status:"too_early"};
  const lock=deps.lock??createMonitorLock(),store=deps.store??cfoStore;let id:string|null=null,usageId:string|null=null;
  let usage:UsageWrite|undefined;
  try {
    if(!await lock.acquire())return {status:"locked"};
    id=await store.begin(type,type==="morning"?period.date:period.hour,now);if(!id)return {status:"duplicate"};
    const snapshot=await (deps.snapshot??(()=>buildCfoAgentSnapshot({now,config})))();
    const anomalies=detectCfoAnomalies(snapshot,config);
    const queues=await (deps.queues??existingQueueRecords)(anomalies);
    const sent:Anomaly[]=[];
    for(const a of anomalies) {
      const ids=queues.get(a.id)??a.existingRecordIds;a.existingRecordIds=ids;
      if(ids.length){const e=evidence("existing_queue",a.cooldownKey,ids.join(","),"record_ids",snapshot.generatedAt,true);snapshot.evidence.push(e);a.evidenceIds.push(e.id);continue;}
      if(!a.actionable)continue;
      const previous=await store.recent(a.cooldownKey,now,config.cooldownHours);
      if(previous&&!shouldReopen(a,previous,now,config.cooldownHours))continue;
      sent.push(a);
    }
    if(type==="morning") {
      // Morning can reason about known context, but does not reopen suppressed
      // anomalies or existing business queues. No numbers are invented.
      const e=evidence("snapshot","morning_data_quality",snapshot.dataQuality.missingFields.length,"missing_fields",snapshot.generatedAt,true);
      const ms=[
        ["yesterday",snapshot.sales.yesterday.grossRevenue],["last7Days",snapshot.sales.last7Days.grossRevenue],
        ["monthToDate",snapshot.sales.monthToDate.grossRevenue],["contribution",snapshot.profitability.contributionProfit],
        ["margin",snapshot.profitability.contributionMargin],["stockout",snapshot.inventory.stockoutRiskValue],
        ["deadStock",snapshot.inventory.deadStockValue],["cash",snapshot.cash.cash],
      ] as const;
      const proof=[e,...ms.map(([key,m])=>evidence("snapshot",`morning.${key}`,m.value,key==="margin"?"pct":"TRY",snapshot.generatedAt,!m.estimated))];
      snapshot.evidence.push(...proof);
      sent.push({id:"morning_context",rule:"MORNING_REVIEW",severity:"info",category:"data_quality",entityType:"company",entityId:"company",period:period.date,fingerprint:`morning:${period.date}`,cooldownKey:"morning",evidenceIds:proof.map(e=>e.id),actionable:true,impact:null,weight:0,existingRecordIds:[]});
    }
    const selected=sent.slice(0,8);
    await store.snapshot(id,snapshot,hashSnapshot(snapshot),anomalies,selected);
    const saving=costTry(config,{inputTokens:Math.min(3000,config.maxInputTokens),outputTokens:Math.min(600,config.maxOutputTokens),cacheReadTokens:0,cacheWriteTokens:0});
    const skip=async(status:string)=>{await store.finish(id!,status,new Date(),1,saving);return {status,runId:id};};
    if(!selected.length)return await skip("no_actionable_anomaly");
    if(!config.enabled)return await skip("ai_disabled");
    if(!config.releaseApproved)return await skip("release_gates_pending");
    const provider=deps.provider===undefined?createCfoProvider(config):deps.provider;
    if(!provider)return await skip("provider_unavailable");
    const reserve=reservedCost(config),block=budgetBlock(config,await store.totals(now),reserve);
    const trigger=selected.map(a=>a.rule).join(",");
    usage={provider:config.provider,model:config.model,status:"reserved",triggerReason:trigger,reservedCostTry:reserve,
      priceContext:{inputPriceUsdPerMillion:config.inputPriceUsdPerMillion??null,outputPriceUsdPerMillion:config.outputPriceUsdPerMillion??null,usdTryRate:config.usdTryRate??null,cacheReadMultiplier:.1,cacheWriteMultiplier:1.25}};
    if(block){await store.usage(id,{...usage,status:block,estimatedCost:0,reservedCostTry:null});return await skip(block);}
    const memory=await (deps.memory??retrieveRelevantMemory)(selected);
    const input={snapshot,anomalies:selected,memory};
    // Byte cap before a network request, exact provider token count before the
    // billable call. Includes static prompt/schema allowance, no silent truncation.
    if(Buffer.byteLength(JSON.stringify(reasoningPayload(input)),"utf8")>config.maxInputTokens*3)return await skip("blocked_by_input_size");
    const tokens=await provider.countInput(input);
    if(tokens+512>config.maxInputTokens)return await skip("blocked_by_input_tokens");
    usageId=await store.usage(id,usage); // worst-case reservation survives timeout/process death
    const result=await provider.generate(input);
    const cost=costTry(config,result);
    await store.updateUsage(usageId,{...usage,status:"completed",inputTokens:result.inputTokens,outputTokens:result.outputTokens,cacheReadTokens:result.cacheReadTokens,cacheWriteTokens:result.cacheWriteTokens,estimatedCost:cost,reservedCostTry:null,providerRequestId:result.requestId});
    usageId=null;
    const validated=validateAiOutput(result.text,snapshot,selected);
    await store.insights(id,validated.insights,selected,snapshot.evidence);
    const status=validated.rejected?"invalid_output":"completed";
    await store.finish(id,status,new Date(),0,null,validated.rejected?`rejected_insights:${validated.rejected}`:undefined);
    return {status,runId:id,insights:validated.insights.length};
  } catch(error) {
    // Never persist SDK error bodies, connection URLs, credentials or source rows.
    const code=error instanceof ProviderError?error.code:"monitor_failed";
    if(usageId&&usage)await store.updateUsage(usageId,{...usage,status:"failed"});
    if(id)await store.finish(id,"failed",new Date(),0,null,code);
    return {status:"failed",runId:id,error:code};
  } finally {await lock.release();}
}
