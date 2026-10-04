export const CYCLE_STAGES = ['lock','notebook','context','settings','questions','answers','planning','persist','commit'] as const;
export type CycleStage = typeof CYCLE_STAGES[number];
export type CycleDiagnostic = {version:1;stage:CycleStage;code:string;databaseCode:string|null};
export class CycleFailure extends Error {
  constructor(readonly stage:CycleStage,cause:unknown){super('cycle_unavailable',{cause});}
}
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
// Only structural codes cross the server boundary. Never copy error messages,
// query text, parameter values, constraint details or connection strings.
export function cycleDiagnostic(error:unknown):CycleDiagnostic {
  const stage=error instanceof CycleFailure?error.stage:'commit';
  const root=record(error instanceof CycleFailure?error.cause:error),meta=record(root.meta);
  const driver=record(meta.driverAdapterError),cause=record(driver.cause);
  const code=typeof root.code==='string'&&/^P\d{4}$/.test(root.code)?root.code:'UNCLASSIFIED';
  const raw=meta.code??cause.originalCode??record(root.cause).code;
  const databaseCode=typeof raw==='string'&&/^[0-9A-Z]{5}$/.test(raw)?raw:null;
  return {version:1,stage,code,databaseCode};
}
export function readCycleDiagnostic(value:string|null):CycleDiagnostic|null{
  try{const v=JSON.parse(value??'');if(v.version!==1||!CYCLE_STAGES.includes(v.stage))return null;
    return {version:1,stage:v.stage,code:typeof v.code==='string'&&/^P\d{4}$/.test(v.code)?v.code:'UNCLASSIFIED',databaseCode:typeof v.databaseCode==='string'&&/^[0-9A-Z]{5}$/.test(v.databaseCode)?v.databaseCode:null};
  }catch{return null;}
}
