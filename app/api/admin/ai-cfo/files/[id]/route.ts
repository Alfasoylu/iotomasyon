import { NextResponse } from 'next/server';
import { getCurrentSession,checkPermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { getStorageConfig } from '@/lib/storage/supabase-storage';
import { downloadPrivateCfoFile } from '@/lib/cfo-agent/private-files';
export const dynamic='force-dynamic';export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){const user=await getCurrentSession();
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401,headers});
  if(user.role!=='ADMIN'||!await checkPermission(user,PERMISSIONS.CFO_READ)||!await checkPermission(user,PERMISSIONS.EXECUTIVE_READ))return NextResponse.json({error:'forbidden'},{status:403,headers});
  const {id}=await params;if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return NextResponse.json({error:'not_found'},{status:404,headers});
  try{const file=await prisma.cfoQuestionFile.findUnique({where:{id}}),storage=getStorageConfig();
    if(!file)return NextResponse.json({error:'not_found'},{status:404,headers});
    if(!storage.ok)return NextResponse.json({error:'private_storage_unavailable'},{status:503,headers});
    const body=await downloadPrivateCfoFile(storage.config,file.url);if(!body)return NextResponse.json({error:'private_file_unavailable'},{status:503,headers});
    return new Response(body,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="cfo-file"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`}});
  }catch{return NextResponse.json({error:'private_file_unavailable'},{status:503,headers});}}
