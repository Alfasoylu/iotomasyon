import { NextResponse } from 'next/server';
import { getCurrentSession,checkPermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { safeCfoCycle,decideCfoWork } from '@/lib/cfo-agent/workflow';
import { WORK_SOURCE,HEARTBEAT_ID,readWork } from '@/lib/cfo-agent/workflow-store';
import { z } from 'zod';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=300;
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
async function guard(write=false){const user=await getCurrentSession();if(!user)return null;
  if(user.role!=='ADMIN'||!await checkPermission(user,PERMISSIONS.CFO_READ)||!await checkPermission(user,PERMISSIONS.EXECUTIVE_READ)||write&&!await checkPermission(user,PERMISSIONS.CFO_WRITE))return null;return user;}
export async function GET(){if(!await guard())return NextResponse.json({error:'unauthorized'},{status:401,headers});
  try{const notes=await prisma.cfoNote.findMany({where:{source:WORK_SOURCE,archivedAt:null},orderBy:{updatedAt:'desc'}});
    const heartbeat=notes.find(n=>n.id===HEARTBEAT_ID);
    const failures=await prisma.cfoChangeLog.findFirst({where:{source:WORK_SOURCE,note:'cycle_unavailable'},orderBy:{changedAt:'desc'},select:{changedAt:true}});
    return NextResponse.json({schedule:'daily_plus_data_events',heartbeat:heartbeat?JSON.parse(heartbeat.body):null,lastFailureAt:failures?.changedAt??null,
      items:notes.flatMap(n=>{const work=readWork(n.body);return work?[{id:n.id,...work}]:[];})},{headers});
  }catch{return NextResponse.json({error:'workflow_unavailable'},{status:503,headers});}}
const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('run')}),
  z.object({action:z.enum(['approve','reject','complete']),id:z.string().regex(/^cfo-work-[a-f0-9]{32}$/),revision:z.string().regex(/^[a-f0-9]{64}$/),result:z.string().max(2000).default('')})]);
export async function POST(req:Request){const user=await guard(true);if(!user)return NextResponse.json({error:'unauthorized'},{status:401,headers});
  if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'origin_invalid'},{status:403,headers});
  if(Number(req.headers.get('content-length')??0)>8192)return NextResponse.json({error:'body_too_large'},{status:413,headers});
  let data;try{data=input.parse(await req.json());}catch{return NextResponse.json({error:'invalid_request'},{status:400,headers});}
  try{if(data.action==='run'){const result=await safeCfoCycle('manual');return NextResponse.json(result,{status:result.completed?200:result.reason==='already_running'?202:503,headers});}
    const value=await decideCfoWork(data.id,data.revision,data.action,user.id,data.result);return NextResponse.json({completed:true,status:value.status},{headers});
  }catch{return NextResponse.json({error:'decision_unavailable_or_changed',message:'Karar değişmiş, eski veya bu geçiş için hazır değil. Döngüyü çalıştırıp kararı yeniden inceleyin.'},{status:409,headers});}}
