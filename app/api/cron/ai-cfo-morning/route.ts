import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { runCfoMorningBrief } from "@/lib/cfo-agent/runner";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=120;
export async function GET(req:NextRequest) {
  const denied=authorizeCron(req);if(denied)return denied;
  try {const result=await runCfoMorningBrief();return NextResponse.json(result,{status:result.status==="failed"?503:200});}
  catch {return NextResponse.json({status:"failed",error:"monitor_unavailable"},{status:503});}
}
