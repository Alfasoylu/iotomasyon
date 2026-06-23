import { NextResponse } from "next/server";

import { logoutPdks } from "@/lib/pdks/auth";

export const dynamic = "force-dynamic";

/** POST /api/pdks/auth/logout */
export async function POST() {
  await logoutPdks();
  return NextResponse.json({ ok: true });
}
