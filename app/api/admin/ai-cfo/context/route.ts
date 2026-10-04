import { NextResponse } from "next/server";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadOperatingContext } from "@/lib/cfo-agent/load-operating-context";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=120;
const headers={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"};
export async function GET() {
  const user=await getCurrentSession();
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401,headers});
  if(user.role!=='ADMIN'||!await checkPermission(user,PERMISSIONS.CFO_READ)||!await checkPermission(user,PERMISSIONS.EXECUTIVE_READ))return NextResponse.json({error:'forbidden'},{status:403,headers});
  try {return NextResponse.json(await loadOperatingContext(),{headers});}
  catch {return NextResponse.json({error:'context_unavailable'},{status:503,headers});}
}
