import { createHash } from "node:crypto";
import type { Evidence } from "./types";

export function evidence(source:string, query:string, value:Evidence["value"], unit:string, asOf:string, measured:boolean): Evidence {
  return {id:`e_${createHash("sha256").update(`${source}|${query}|${unit}`).digest("hex").slice(0,16)}`,source,query,value,unit,asOf,measured};
}
export const hashSnapshot = (snapshot: unknown) => createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
