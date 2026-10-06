import type { StorageConfig } from '@/lib/storage/supabase-storage';
const BUCKET='cfo-files';
const headers=(config:StorageConfig)=>({Authorization:`Bearer ${config.key}`,apikey:config.key});
function validPath(path:string){return /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(path)&&!path.includes('..');}
export async function privateBucket(config:StorageConfig,request:typeof fetch=fetch){
  try{const response=await request(`${config.url}/storage/v1/bucket/${BUCKET}`,{headers:headers(config),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return false;const bucket=await response.json();return bucket.id===BUCKET&&bucket.public===false;
  }catch{return false;}
}
export async function uploadPrivateCfoFile(config:StorageConfig,path:string,file:File,request:typeof fetch=fetch){
  if(!validPath(path)||!await privateBucket(config,request))return {ok:false as const,reason:'Soru dosyaları için özel depolama doğrulanamadı. Dosya yüklenmedi.'};
  try{const response=await request(`${config.url}/storage/v1/object/${BUCKET}/${path}`,{method:'POST',headers:{...headers(config),'Content-Type':'application/octet-stream','x-upsert':'false'},body:Buffer.from(await file.arrayBuffer()),redirect:'error',signal:AbortSignal.timeout(30000)});
    return response.ok?{ok:true as const,privateRef:`private:${BUCKET}/${path}`}:{ok:false as const,reason:'Özel dosya yüklemesi tamamlanamadı.'};
  }catch{return {ok:false as const,reason:'Özel dosya yüklemesi tamamlanamadı.'};}
}
export function privateFilePath(ref:string,config:StorageConfig){
  const prefix=`private:${BUCKET}/`;if(ref.startsWith(prefix)){const path=ref.slice(prefix.length);return validPath(path)?path:null;}
  // Legacy stored links are read only from the configured project and bucket, never used as arbitrary URLs.
  try{const url=new URL(ref),base=new URL(config.url),prefix=`/storage/v1/object/public/${BUCKET}/`;
    if(url.origin!==base.origin||!url.pathname.startsWith(prefix)||url.search||url.hash)return null;
    const path=decodeURIComponent(url.pathname.slice(prefix.length));return validPath(path)?path:null;
  }catch{return null;}
}
export async function downloadPrivateCfoFile(config:StorageConfig,ref:string,request:typeof fetch=fetch){
  const path=privateFilePath(ref,config);if(!path||!await privateBucket(config,request))return null;
  try{const response=await request(`${config.url}/storage/v1/object/authenticated/${BUCKET}/${path}`,{headers:headers(config),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok||Number(response.headers.get('content-length')??0)>10*1024*1024)return null;
    const body=await response.arrayBuffer();return body.byteLength<=10*1024*1024?body:null;
  }catch{return null;}
}
/** Kısa ömürlü imzalı URL (yalnız sunucu tarafı; bucket private doğrulanmadan üretilmez). */
export async function signedCfoFileUrl(config:StorageConfig,ref:string,expiresIn=60,request:typeof fetch=fetch){
  const path=privateFilePath(ref,config);if(!path||!await privateBucket(config,request))return null;
  try{const response=await request(`${config.url}/storage/v1/object/sign/${BUCKET}/${path}`,{method:'POST',headers:{...headers(config),'Content-Type':'application/json'},body:JSON.stringify({expiresIn}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return null;const {signedURL}=await response.json() as {signedURL?:string};
    return signedURL&&signedURL.startsWith('/object/sign/')?`${config.url}/storage/v1${signedURL}`:null;
  }catch{return null;}
}
