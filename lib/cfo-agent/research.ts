import type { ReadSource,Row } from './sources';
const quoteColumn=(value:string)=>{if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value))throw new Error('invalid_source_column');return '"'+value+'"';};
import type { WorkItem } from './workflow-plan';
import { productPolicy } from './product-policy';
import { skuKey } from './sku';

// Fixed application sources only. Credentials, customer details and raw uploads
// are excluded at the SELECT, rather than stripped after loading them.
const OPERATIONAL=[
  {key:'catalog',table:'Product',paths:['/products?view=importer'],name:'İthalatçı ürün kataloğu',fields:['sku','name','isActive','productKind','stockQuantity','unitCostTry','sourceCostRmb','weightKg','onlineSalesPotential']},
  {key:'stock',table:'cfo_stok_sicrama_durum',paths:['/admin/stok-sicrama'],name:'Stok sıçramaları',fields:['sku','urun','hareket_gunu','delta','durum','aciklanamayan_adet','aciklanamayan_maliyet_try','otomatik_teshis','aciklama']},
  {key:'new-products',table:'urun_aday_skor',paths:['/admin/yeni-urunler'],name:'Yeni ürün hazırlığı',fields:['sku','ad_tr','durum','puan','eksikler','katalogda_var','birim_usd','agirlik_kg','adet']},
  {key:'mappings',table:'MarketplaceProductMapping',paths:['/admin/marketplace-mappings'],name:'Pazaryeri ürün eşleşmeleri',fields:['platform','productId','platformSku','platformBarcode','platformProductId','platformListingId','confidence']},
  {key:'xml',table:'XmlSyncSource',paths:['/admin/xml-sync'],name:'XML kaynak durumu',fields:['name','isEnabled','lastSyncAt','lastStatus']},
  {key:'uploads',table:'EntegraImportLog',paths:['/admin/entegra-yukleme'],name:'Entegra yükleme tarihçesi',fields:['rowCount','createdCount','updatedCount','skippedCount','dateFrom','dateTo','createdAt']},
] as const;
const HISTORICAL=[
  {key:'entegra-history',table:'MarketplaceSalesRecord',paths:['/admin/entegra-yukleme'],name:'Entegra tüm kanal arşivi',date:'orderDate',amount:'totalAmountTry',units:'quantity',sku:'modelNumber',channel:'channel'},
  {key:'trendyol-history',table:'TrendyolSalesRecord',paths:['/admin/trendyol-report','/orders'],name:'Trendyol satış arşivi',date:'orderDate',amount:'totalPriceTry',units:'quantity',sku:'merchantSku',channel:null},
  {key:'returns-history',table:'TrendyolReturnRecord',paths:['/admin/trendyol-report','/orders'],name:'Trendyol iade talebi arşivi',date:'claimDate',amount:'unitPriceTry',units:null,sku:'merchantSku',channel:null},
] as const;
export const RESEARCH_SOURCES=[...OPERATIONAL,...HISTORICAL];
export const RESEARCH_PAGE_PATHS:readonly string[]=[...new Set(RESEARCH_SOURCES.flatMap(s=>s.paths))];
type Totals={rows:number;units:number;amount:number;missingAmounts:number;unmatched:number;cancelled:number;top:{sku:string;units:number;amount:number}[];channels:Record<string,number>};
type Cursor={after?:string;month?:string;monthAfter?:string;through?:string;scanned:number;total:number;pass:number;complete:boolean;available:boolean;asOf:string;first?:string;last?:string;totals?:Totals};
export type ResearchState={version:1;nextOperational:number;nextHistorical:number;sources:Record<string,Cursor>};
export type ResearchProgress={source:string;name:string;paths:readonly string[];available:boolean;scanned:number;total:number|null;complete:boolean;period:string|null;pass:number};
export type ResearchResult={state:ResearchState;progress:ResearchProgress[];items:WorkItem[];summaries:string[];missing:string[];rowsReviewed:number;periodsCompleted:number;completedKeys:string[];checkedPrefixes:string[]};
const num=(v:unknown)=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const text=(v:unknown)=>v==null?'':typeof v==='string'?v:JSON.stringify(v);
const blankTotals=():Totals=>({rows:0,units:0,amount:0,missingAmounts:0,unmatched:0,cancelled:0,top:[],channels:{}});
const nextMonth=(month:string)=>{const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m,1)).toISOString().slice(0,7);};
export function initialResearch():ResearchState{return {version:1,nextOperational:0,nextHistorical:0,sources:{}};}
export function readResearch(value:unknown):ResearchState{
  if(!value||typeof value!=='object')return initialResearch();
  const v=value as ResearchState;
  if(v.version!==1||!Number.isSafeInteger(v.nextOperational)||v.nextOperational<0||!Number.isSafeInteger(v.nextHistorical)||v.nextHistorical<0||!v.sources||typeof v.sources!=='object')return initialResearch();
  const sources:Record<string,Cursor>={};
  for(const spec of RESEARCH_SOURCES){const c=v.sources[spec.key];
    if(!c||!Number.isSafeInteger(c.scanned)||c.scanned<0||!Number.isSafeInteger(c.total)||c.total<0||typeof c.asOf!=='string'||!Number.isFinite(Date.parse(c.asOf)))continue;
    if(c.month&&!/^\d{4}-\d{2}$/.test(c.month)||c.through&&!/^\d{4}-\d{2}$/.test(c.through))continue;
    sources[spec.key]=c;
  }
  return {version:1,nextOperational:v.nextOperational,nextHistorical:v.nextHistorical,sources};
}
function finding(key:string,title:string,proposal:string,evidence:string[],blockers:string[],path:string,sku?:string,priority=2):WorkItem{
  return {key:'research:'+key,title,proposal,evidence,blockers,plannerPath:path,kind:'research',priority,sku,cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false};
}
function operationalFindings(spec:typeof OPERATIONAL[number],r:Row,id:string,asOf:string,policies:Map<string,{virtual:boolean;noReorder:boolean}>):WorkItem[]{
  const key=spec.key+':'+id,path=spec.paths[0],sku=text(r.sku)||undefined,base=[`${spec.name} · kayıt ${id}`,path];
  const out:WorkItem[]=[];
  const add=(suffix:string,title:string,proposal:string,evidence:string[],blockers:string[],priority=2)=>out.push(finding(key+':'+suffix,title,proposal,[...base,...evidence],blockers,path,sku,priority));
  if(spec.key==='catalog'&&r.isActive===true&&num(r.stockQuantity)!==null){
    const policy=policies.get(skuKey(sku??''))??productPolicy({kind:r.productKind,stock:r.stockQuantity});
    if(!policy?.virtual&&num(r.stockQuantity)!>0){
      if(num(r.unitCostTry)==null)add('cost',`${sku}: raf stokunun maliyetini araştır`,'İthalatçı görünümündeki mevcut stok maliyetini eski fatura, not ve partiyle eşleştir; yenileme maliyetini mevcut stok değerine yazma.',[`Stok: ${r.stockQuantity}; kayıtlı TL maliyeti eksik`],['Partiye ait doğrulanmış maliyet']);
      if(num(r.sourceCostRmb)==null||num(r.weightKg)==null)add('import',`${sku}: ithalat girdileri eksik`,policy?.noReorder?'Yeniden sipariş vermeme kararını koru; yalnız mevcut stok değerini ve çıkışını araştır.':'Alış fiyatını ve ağırlığı mevcut tedarik kaydıyla doğrula; borç kapısı açılana kadar yalnız gelecek planında tut.',[`Alış RMB: ${r.sourceCostRmb??'eksik'}; ağırlık kg: ${r.weightKg??'eksik'}`],['Tarihli alış fiyatı, ağırlık ve tüm ithalat giderleri'],3);
    }
  }
  if(spec.key==='stock'&&r.durum==='ACIK'&&(num(r.aciklanamayan_adet)??0)>0)add('unexplained',`${sku}: stok düşüşünü kaynaklarıyla karşılaştır`,'İlgili gündeki tüm kanal satışlarını, FBA transferini ve Entegra düzeltmesini araştır. Kontrolün kanal kapsamını doğrulamadan kayıp veya satış sayma.',[`Hareket: ${text(r.hareket_gunu)}; açıklanamayan adet: ${r.aciklanamayan_adet}; ölçülen tutar: ${r.aciklanamayan_maliyet_try??'bilinmiyor'} TL`,text(r.otomatik_teshis)],['Tüm kanallar, transfer/sayım izi ve güncel satış kapsamı']);
  if(spec.key==='new-products'&&!/RED|IPTAL|İPTAL/.test(text(r.durum))&&r.katalogda_var===false&&text(r.eksikler)&&text(r.eksikler)!=='[]')add('readiness',`${sku}: gelen ürünün satışa hazırlığını tamamla`,'Yeni ürün ekranındaki eksikleri mevcut malın listelenmesi için sırala. İlan ve maliyet doğrulanmadan kârlı yeni ürün sayma.',[`Durum: ${r.durum}; hazırlık puanı: ${r.puan??'bilinmiyor'}`,`Eksikler: ${text(r.eksikler).slice(0,800)}`],['Ürün hazırlığı ve doğrulanmış satış maliyeti']);
  if(spec.key==='mappings'&&!['platformSku','platformBarcode','platformProductId','platformListingId'].some(k=>text(r[k])))add('identity','Pazaryeri eşleşmesinin anahtarı eksik','Bu kaydın platform ürün anahtarını doğrula; yalnız ürün kimliği satış eşleşmesini kanıtlamaz.',[`Platform: ${text(r.platform)}; ürün: ${text(r.productId)}`],['Platform kimliği / barkod / SKU']);
  if(spec.key==='xml'&&r.isEnabled===true){const date=Date.parse(text(r.lastSyncAt));
    if(!Number.isFinite(date)||Date.parse(asOf)-date>2*86400000||/FAIL|ERROR/.test(text(r.lastStatus).toUpperCase()))add('freshness',`${text(r.name)}: XML senkronunu kontrol et`,'Son başarılı XML çalışmasını ve kapsamını doğrula. Güncel stok hareketi olmadan tükenme/sipariş kararı verme.',[`Son senkron: ${r.lastSyncAt??'yok'}; durum: ${r.lastStatus??'bilinmiyor'}`],['Başarılı ve tarihli XML senkronu'],1);
  }
  if(spec.key==='uploads'&&(num(r.skippedCount)??0)>0)add('skipped','Entegra yüklemesindeki atlanan kayıtları araştır','Bu yüklemenin atlama gerekçelerini ve ürün eşleşmesini kontrol et; atlanan kayıtların tamamını veri kaybı sayma.',[`Yükleme: ${r.createdAt}; toplam: ${r.rowCount}; atlanan: ${r.skippedCount}; dönem: ${r.dateFrom} – ${r.dateTo}`],['Atlama gerekçesi ve eşleşme izi'],3);
  return out;
}

/** One historical slice plus two operational slices per run. Errors never advance a cursor. */
export async function researchCfoSources(db:ReadSource,previous:ResearchState,asOf:string,policies:Map<string,{virtual:boolean;noReorder:boolean}>=new Map()):Promise<ResearchResult>{
  const state=structuredClone(readResearch(previous)),items:WorkItem[]=[],summaries:string[]=[],missing:string[]=[],completedKeys:string[]=[],checkedPrefixes:string[]=[];
  let rowsReviewed=0,periodsCompleted=0;
  const columns=await db.query<{table_name:string;column_name:string;data_type:string}>(`select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name=any($1::text[])`,RESEARCH_SOURCES.map(s=>s.table));
  const has=(table:string,col:string)=>columns.some(c=>c.table_name===table&&c.column_name===col);
  const tasks=[OPERATIONAL[state.nextOperational++%OPERATIONAL.length],OPERATIONAL[state.nextOperational++%OPERATIONAL.length],HISTORICAL[state.nextHistorical++%HISTORICAL.length]];
  for(const spec of tasks){const old=state.sources[spec.key];
    try{
      if(!has(spec.table,'id')&&!has(spec.table,'sku'))throw new Error('source_unavailable');
      const table=quoteColumn(spec.table);
      if('fields' in spec&&spec.fields.some(field=>!has(spec.table,field)))throw new Error('source_columns_unavailable');
      if('fields' in spec){
        const id=quoteColumn(has(spec.table,'id')?'id':'sku');
        const [meta]=await db.query<Row>(`select count(*)::int as total,count(distinct ${id}::text)::int as unique_ids,max(${id}::text) as last from ${table}`);
        if(Number(meta.total)!==Number(meta.unique_ids))throw new Error('source_identity_incomplete');
        const cursor:Cursor=old&&!old.complete?{...old,total:Number(meta.total)}:{scanned:0,total:Number(meta.total),pass:(old?.pass??0)+1,complete:false,available:true,asOf,after:'',last:text(meta.last)};
        const rows=await db.query<{id:string;data:Row}>(`select ${id}::text as id,jsonb_build_object(${spec.fields.map(field=>`'${field}',to_jsonb(t)->'${field}'`).join(',')}) as data
          from ${table} t where ${id}::text>$1 and ${id}::text<=$2 order by ${id}::text limit 201`,cursor.after??'',cursor.last??'');
        const slice=rows.slice(0,200);
        for(const r of slice){checkedPrefixes.push('research:'+spec.key+':'+r.id+':');items.push(...operationalFindings(spec,r.data,r.id,asOf,policies));cursor.after=r.id;}
        rowsReviewed+=slice.length;cursor.scanned+=slice.length;cursor.complete=rows.length<=200;cursor.available=true;cursor.asOf=asOf;state.sources[spec.key]=cursor;
        summaries.push(`${spec.name}: bu çalışmada ${slice.length} kayıt incelendi; geçiş ${cursor.pass}, ${cursor.scanned}/${cursor.total}${cursor.complete?' · mevcut kapsam tarandı':''}.`);
      }else{
        for(const required of [spec.date,spec.amount,spec.sku,'status','productId',...(spec.units?[spec.units]:[]),...(spec.channel?[spec.channel]:[])])if(!has(spec.table,required))throw new Error('source_columns_unavailable');
        const dateCol=quoteColumn(spec.date),type=columns.find(c=>c.table_name===spec.table&&c.column_name===spec.date)?.data_type;
        const date=type==='timestamp without time zone'?`((${dateCol} at time zone 'UTC') at time zone 'Europe/Istanbul')`:type==='timestamp with time zone'?`(${dateCol} at time zone 'Europe/Istanbul')`:dateCol;
        const [meta]=await db.query<Row>(`select count(*)::int as total,min(to_char(${date},'YYYY-MM')) as first,max(to_char(${date},'YYYY-MM')) as last from ${table} where ${date}<($1::timestamptz at time zone 'Europe/Istanbul')`,asOf);
        const first=text(meta.first),last=text(meta.last);
        const cursor:Cursor=old&&!old.complete?{...old,total:Number(meta.total)}:{scanned:0,total:Number(meta.total),pass:(old?.pass??0)+1,complete:!first,available:true,asOf,month:first,through:last,monthAfter:'',totals:blankTotals(),first,last};
        if(first&&cursor.month){
          const channel=spec.channel?`coalesce(t.${quoteColumn(spec.channel)}::text,'KANAL_BILINMIYOR')`:"'TRENDYOL'";
          const productSku=has('Product','id')&&has('Product','sku');
          const join=productSku?' left join "Product" p on p.id=t."productId"':'';
          const sku=productSku?`coalesce(nullif(p.sku,''),nullif(t.${quoteColumn(spec.sku)},''),'EŞLEŞMEYEN')`:`coalesce(nullif(t.${quoteColumn(spec.sku)},''),'EŞLEŞMEYEN')`;
          const amount=`t.${quoteColumn(spec.amount)}`,units=spec.units?`t.${quoteColumn(spec.units)}`:'1';
          const valid=spec.key==='returns-history'?'true':`coalesce(lower(replace(t.status,'İ','I')),'') !~ '(iptal|iade|cancel)'`;
          const rows=await db.query<Row>(`select ${channel}::text||'|'||${sku} as key,${channel}::text as channel,${sku} as sku,
            count(*)::int as rows,coalesce(sum(${units}) filter(where ${valid}),0)::float8 as units,
            sum(${amount}) filter(where ${valid})::float8 as amount,
            count(*) filter(where ${amount} is null and ${valid})::int as missing_amounts,
            count(*) filter(where t."productId" is null)::int as unmatched,count(*) filter(where not (${valid}))::int as cancelled
            from ${table} t${join} where ${date.replaceAll(dateCol,'t.'+dateCol)}>=$1::date and ${date.replaceAll(dateCol,'t.'+dateCol)}<($1::date+interval '1 month')
            and ${date.replaceAll(dateCol,'t.'+dateCol)}<($3::timestamptz at time zone 'Europe/Istanbul')
            group by ${channel},${sku} having ${channel}::text||'|'||${sku}>$2 order by key limit 301`,cursor.month+'-01',cursor.monthAfter??'',asOf);
          const totals=cursor.totals??blankTotals(),slice=rows.slice(0,300);
          for(const r of slice){totals.rows+=Number(r.rows);totals.units+=Number(r.units);totals.amount+=num(r.amount)??0;totals.missingAmounts+=Number(r.missing_amounts);totals.unmatched+=Number(r.unmatched);totals.cancelled+=Number(r.cancelled);
            totals.channels[text(r.channel)]=(totals.channels[text(r.channel)]??0)+(num(r.amount)??0);
            totals.top.push({sku:text(r.sku),units:Number(r.units),amount:num(r.amount)??0});cursor.monthAfter=text(r.key);}
          totals.top=totals.top.sort((a,b)=>b.amount-a.amount).slice(0,5);cursor.totals=totals;cursor.scanned+=slice.reduce((sum,r)=>sum+Number(r.rows),0);rowsReviewed+=slice.reduce((sum,r)=>sum+Number(r.rows),0);
          if(rows.length<=300){
            const period=cursor.month,key=spec.key+':'+period,periodComplete=period<asOf.slice(0,7);
            const evidence=[`${spec.table} · ${period} · ${totals.rows} ham kayıt; ${totals.units} iptal/iade dışı adet${spec.units===null?' yerine iade talebi satırı':''}`,`${totals.amount.toFixed(2)} TL gözlenen ${spec.units===null?'iade talebi bedeli':'KDV dahil tutar'}; tutarı eksik ${totals.missingAmounts} satır`,...totals.top.map(r=>`${r.sku}: ${r.units} adet/satır · ${r.amount.toFixed(2)} TL`),`Eşleşmeyen satır: ${totals.unmatched}; iptal/iade statülü satır: ${totals.cancelled}`];
            const blockers=['Ham kaynaklar birbirine eklenmez; Entegra/Trendyol çakışması kanonik kayıtla giderilmeli',...(!periodComplete?['Dönem henüz kapanmadı']:[]),...(totals.missingAmounts?['Eksik tutarlar nedeniyle toplam kısmi']:[])];
            items.push(finding(key,spec.name+' · '+period,'Geçmiş dönemin satılan ürünlerini ve kanal kapsamını mevcut stokla karşılaştır. Ciroyu kâr veya tahsilat sayma; tekrar siparişi güncel borç ve maliyet kapısına bağla.',evidence,blockers,spec.paths[0]));
            if(totals.unmatched)items.push(finding(key+':matching',`${period}: ${totals.unmatched} arşiv satırının ürünü eşleşmiyor`,'Ürün eşleştirme ekranında önce yüksek tutarlı satışların SKU/barkodlarını araştır; manuel eşleşme için kanıt ve onay hazırla. Eski kayıtları araştırmadan maliyet sorusu açma.',evidence,['Ürün kimliği ve eşleşme kanıtı'],'/admin/marketplace-mappings'));
            const site=totals.channels.IDEASOFT;
            if(site!=null)items.push(finding(key+':site',`${period}: kendi sitemizde ${site.toFixed(2)} TL kayıtlı satış`,'IDEASOFT kanalını ürün talep ve stok analizine dahil et; pazaryeri görünümünde dışlanıp dışlanmadığını kontrol et.',evidence,['Site komisyonu, KDV, kargo ve iade giderleri ayrı doğrulanmalı'],spec.paths[0]));
            summaries.push(`${spec.name}: ${period} tamamlandı; ${totals.rows} arşiv kaydı, ${totals.unmatched} eşleşmeyen satır${!periodComplete?' · açık ay':''}.`);periodsCompleted++;completedKeys.push(key);checkedPrefixes.push('research:'+key);
            const [next]=await db.query<Row>(`select min(to_char(${date},'YYYY-MM')) as month from ${table} where ${date}>=$1::date and ${date}<($2::timestamptz at time zone 'Europe/Istanbul')`,nextMonth(period)+'-01',asOf);
            cursor.month=text(next.month)||nextMonth(cursor.through??last);cursor.monthAfter='';cursor.totals=blankTotals();cursor.complete=cursor.month>(cursor.through??last);
          }else summaries.push(`${spec.name}: ${cursor.month} devam ediyor; bu çalışmada ${slice.length} ürün/kanal grubu incelendi.`);
        }else summaries.push(`${spec.name}: tarihli arşiv kaydı yok.`);
        cursor.available=true;cursor.asOf=asOf;state.sources[spec.key]=cursor;
      }
    }catch{missing.push(`${spec.name}: kaynak veya gerekli kolonlar okunamadı; tarama ilerletilmedi.`);state.sources[spec.key]={...(old??{scanned:0,total:0,pass:0,complete:false,asOf}),available:false};}
  }
  const progress=RESEARCH_SOURCES.map(spec=>{const c=state.sources[spec.key];return {source:spec.key,name:spec.name,paths:spec.paths,available:c?.available??false,scanned:c?.scanned??0,total:c?.total??null,complete:c?.complete??false,period:c?.month??null,pass:c?.pass??0};});
  return {state,progress,items,summaries,missing,rowsReviewed,periodsCompleted,completedKeys,checkedPrefixes};
}
