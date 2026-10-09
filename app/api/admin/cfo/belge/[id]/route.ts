import { NextResponse } from 'next/server';
import { getCurrentSession,checkPermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { getStorageConfig } from '@/lib/storage/supabase-storage';
import { downloadPrivateCfoFile } from '@/lib/cfo-agent/private-files';
// CFO belge indirme (CFO-027): private bucket'tan sunucu üzerinden, önbelleksiz, ek olarak. Soru dosyası rotasıyla aynı yetki modeli.
export const dynamic='force-dynamic';export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){const user=await getCurrentSession();
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401,headers});
  if(user.role!=='ADMIN'||!await checkPermission(user,PERMISSIONS.CFO_READ)||!await checkPermission(user,PERMISSIONS.EXECUTIVE_READ))return NextResponse.json({error:'forbidden'},{status:403,headers});
  const {id}=await params;if(!/^[0-9a-f-]{36}$/.test(id))return NextResponse.json({error:'not_found'},{status:404,headers});
  try{const [doc]=await prisma.$queryRaw<{dosya_ref:string;dosya_adi:string}[]>`select dosya_ref,dosya_adi from cfo_belge where id=${id}`;const storage=getStorageConfig();
    if(!doc)return NextResponse.json({error:'not_found'},{status:404,headers});
    if(!storage.ok)return NextResponse.json({error:'private_storage_unavailable'},{status:503,headers});
    const body=await downloadPrivateCfoFile(storage.config,doc.dosya_ref);if(!body)return NextResponse.json({error:'private_file_unavailable'},{status:503,headers});
    return new Response(body,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="cfo-belge"; filename*=UTF-8''${encodeURIComponent(doc.dosya_adi)}`}});
  }catch{return NextResponse.json({error:'private_file_unavailable'},{status:503,headers});}}
