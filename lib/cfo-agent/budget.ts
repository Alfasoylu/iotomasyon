import { billingConfigured, type CfoConfig } from "./config";
import { D } from "./calculations";
import { Prisma } from "@prisma/client";
import type { ProviderResult } from "./types";

export function costTry(config:CfoConfig,usage:Pick<ProviderResult,"inputTokens"|"outputTokens"|"cacheReadTokens"|"cacheWriteTokens">):number|null {
  if(!billingConfigured(config))return null;
  return D(usage.inputTokens).add(D(usage.cacheReadTokens).mul(.1)).add(D(usage.cacheWriteTokens).mul(1.25)).mul(config.inputPriceUsdPerMillion!)
    .add(D(usage.outputTokens).mul(config.outputPriceUsdPerMillion!)).div(1000000).mul(config.usdTryRate!).toDecimalPlaces(6, Prisma.Decimal.ROUND_CEIL).toNumber();
}
/** SCHEDULED_CFO (cron + elle monitor) ↔ MANUAL_DEEP_REVIEW (yalnız elle, ayrı bütçe). */
export type RunMode="scheduled"|"deep_review";
export type BudgetTotals={callsToday:number;scheduledCallsToday:number;deepCallsToday:number;spentToday:number;spentThisMonth:number;deepSpentThisMonth:number};
export function modeLimits(config:CfoConfig,mode:RunMode){
  return mode==="deep_review"?{maxInputTokens:config.maxInputTokens,maxOutputTokens:config.maxOutputTokens,maxCostTryPerRun:config.deepMaxCostTryPerRun}
    :{maxInputTokens:config.scheduledMaxInputTokens,maxOutputTokens:config.scheduledMaxOutputTokens,maxCostTryPerRun:config.maxCostTryPerRun};
}
/** En kötü durum rezervasyonu: (tahmini) girdi önbelleksiz + çıktı tavanı. */
export function reservedCost(config:CfoConfig,inputTokens:number,mode:RunMode):number|null {
  return costTry(config,{inputTokens,cacheWriteTokens:0,cacheReadTokens:0,outputTokens:modeLimits(config,mode).maxOutputTokens});
}
/** Sıra: çağrı sayısı → koşu başı TL → gün TL → ay TL. Herhangi biri aşılırsa çağrı YAPILMAZ. manual: elle başlatılan monitor. */
export function budgetBlock(config:CfoConfig,totals:BudgetTotals,reserve:number|null,mode:RunMode="scheduled",manual=false):string|null {
  if(reserve==null)return "billing_unconfigured";
  const over=(spent:number,limit:number)=>D(spent).add(reserve).gt(limit);
  if(mode==="deep_review"){
    if(totals.deepCallsToday>=config.deepMaxCallsPerDay)return "blocked_by_daily_limit";
    if(D(reserve).gt(config.deepMaxCostTryPerRun))return "blocked_by_run_cost";
    if(over(totals.deepSpentThisMonth,config.deepMonthlyBudgetTry)||over(totals.spentThisMonth,config.monthlyBudgetTry))return "blocked_by_budget";
    return null;
  }
  if(!manual&&totals.scheduledCallsToday>=config.maxScheduledCallsPerDay)return "blocked_by_scheduled_limit";
  if(totals.callsToday>=config.maxCallsPerDay)return "blocked_by_daily_limit";
  if(D(reserve).gt(config.maxCostTryPerRun))return "blocked_by_run_cost";
  if(over(totals.spentToday,config.maxCostTryPerDay))return "blocked_by_daily_budget";
  if(over(totals.spentThisMonth,config.monthlyBudgetTry))return "blocked_by_budget";
  return null;
}
export function istanbulPeriod(now:Date):{date:string;hour:string;minutes:number;dayStart:Date;monthStart:Date} {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).map(p=>[p.type,p.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  return {date,hour:`${date}T${parts.hour}`,minutes:Number(parts.hour)*60+Number(parts.minute),dayStart:new Date(`${date}T00:00:00+03:00`),monthStart:new Date(`${parts.year}-${parts.month}-01T00:00:00+03:00`)};
}
