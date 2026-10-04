import { billingConfigured, type CfoConfig } from "./config";
import { D } from "./calculations";
import { Prisma } from "@prisma/client";
import type { ProviderResult } from "./types";

export function costTry(config:CfoConfig,usage:Pick<ProviderResult,"inputTokens"|"outputTokens"|"cacheReadTokens"|"cacheWriteTokens">):number|null {
  if(!billingConfigured(config))return null;
  return D(usage.inputTokens).add(D(usage.cacheReadTokens).mul(.1)).add(D(usage.cacheWriteTokens).mul(1.25)).mul(config.inputPriceUsdPerMillion!)
    .add(D(usage.outputTokens).mul(config.outputPriceUsdPerMillion!)).div(1000000).mul(config.usdTryRate!).toDecimalPlaces(6, Prisma.Decimal.ROUND_CEIL).toNumber();
}
export function reservedCost(config:CfoConfig):number|null {
  return costTry(config,{inputTokens:0,cacheWriteTokens:config.maxInputTokens,cacheReadTokens:0,outputTokens:config.maxOutputTokens});
}
export function budgetBlock(config:CfoConfig,totals:{callsToday:number;spentThisMonth:number},reserve:number|null):string|null {
  if(reserve==null)return "billing_unconfigured";
  if(totals.callsToday>=config.maxCallsPerDay)return "blocked_by_daily_limit";
  if(D(totals.spentThisMonth).add(reserve).gt(config.monthlyBudgetTry))return "blocked_by_budget";
  return null;
}
export function istanbulPeriod(now:Date):{date:string;hour:string;minutes:number;dayStart:Date;monthStart:Date} {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).map(p=>[p.type,p.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  return {date,hour:`${date}T${parts.hour}`,minutes:Number(parts.hour)*60+Number(parts.minute),dayStart:new Date(`${date}T00:00:00+03:00`),monthStart:new Date(`${parts.year}-${parts.month}-01T00:00:00+03:00`)};
}
