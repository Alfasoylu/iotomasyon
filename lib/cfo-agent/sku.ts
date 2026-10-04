/** Case/Unicode matching preserves punctuation and digits; ambiguous aliases never match. */
export function skuKey(sku: string) {
  return sku.trim().normalize("NFC").replace(/[İı]/g,"I").toUpperCase();
}
export function skuIndex<T>(rows: T[], key: (row:T)=>string) {
  const exact=new Map(rows.map(row=>[key(row),row]));
  const folded=new Map<string,T|null>();
  for(const row of rows){const k=skuKey(key(row));folded.set(k,folded.has(k)?null:row);}
  return {get(sku:string):T|undefined{return exact.get(sku)??folded.get(skuKey(sku))??undefined;}};
}
export const foldedSkuSql=(expression:string)=>`upper(replace(replace(${expression},'İ','I'),'ı','I'))`;
