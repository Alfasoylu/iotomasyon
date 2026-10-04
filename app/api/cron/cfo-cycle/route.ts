import { NextRequest,NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { safeCfoCycle } from '@/lib/cfo-agent/workflow';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(req:NextRequest){const denied=authorizeCron(req);if(denied)return denied;
  const result=await safeCfoCycle('daily_cron');
  return NextResponse.json(result,{status:result.completed?200:result.reason==='already_running'?202:503,headers:{'Cache-Control':'private, no-store'}});
}
