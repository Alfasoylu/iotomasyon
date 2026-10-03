import { z } from "zod";
import type { AiInsight, Anomaly, CfoAgentSnapshot } from "./types";

export const aiOutputSchema=z.object({insights:z.array(z.object({
  anomalyId:z.string().max(100),severity:z.enum(["info","warning","critical"]),
  category:z.enum(["margin","inventory","sales","cash","pricing","procurement","marketing","data_quality"]),
  title:z.string().min(1).max(160),observation:z.string().min(1).max(600),recommendation:z.string().min(1).max(600),
  riskIfIgnored:z.string().min(1).max(400),confidence:z.enum(["low","medium","high"]),evidenceIds:z.array(z.string()).min(1).max(12),
}).strict()).max(3)}).strict();

function numberVariants(token:string):number[] {
  const t=token.replace(/\s/g,"");
  return [...new Set([Number(t),Number(t.replace(/\./g,"").replace(",",".")),Number(t.replace(/,/g,""))])].filter(Number.isFinite);
}
export function validateAiOutput(text:string,snapshot:CfoAgentSnapshot,anomalies:Anomaly[]):{insights:AiInsight[];rejected:number} {
  let json:unknown;try{json=JSON.parse(text);}catch{return {insights:[],rejected:1};}
  const parsed=aiOutputSchema.safeParse(json);if(!parsed.success)return {insights:[],rejected:1};
  const accepted:AiInsight[]=[], seen=new Set<string>();let rejected=0;
  for(const item of parsed.data.insights) {
    const a=anomalies.find(a=>a.id===item.anomalyId);
    if(!a||seen.has(a.id)||item.severity!==a.severity||item.category!==a.category||item.evidenceIds.some(id=>!a.evidenceIds.includes(id))){rejected++;continue;}
    const proof=snapshot.evidence.filter(e=>item.evidenceIds.includes(e.id));
    if(proof.length!==new Set(item.evidenceIds).size){rejected++;continue;}
    const textFields=[item.title,item.observation,item.recommendation,item.riskIfIgnored];
    // Financial numbers must occur in cited evidence, with a conservative
    // display rounding allowance. SKU numbers are only allowed as exact IDs.
    const allowed=proof.flatMap(e=>typeof e.value==="number"?[e.value,Number(e.value.toFixed(2)),Number(e.value.toFixed(1)),Math.round(e.value)]:[]);
    const sku=a.entityId.split(":").at(-1)!;
    const prose=textFields.join(" ").split(a.entityId).join("").split(sku.length>2?sku:"__none__").join("");
    const tokens=prose.match(/[-−]?\d+(?:[.,]\d+)*(?:\s?%|\s?₺)?/g)??[];
    const fabricated=tokens.some(token=>!numberVariants(token.replace(/[₺%−]/g,m=>m==="−"?"-":"")).some(v=>allowed.some(n=>Math.abs(n-v)<0.000001)));
    // No derived percentages, multiplications or invented dates are admitted.
    if(fabricated){rejected++;continue;}
    const estimated=proof.some(e=>!e.measured);
    accepted.push({...item,observation:estimated?`TAHMİNİ — ${item.observation}`:item.observation,
      confidence:estimated&&item.confidence==="high"?"medium":item.confidence});seen.add(a.id);
  }
  return {insights:accepted,rejected};
}
