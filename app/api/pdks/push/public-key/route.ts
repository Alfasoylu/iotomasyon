import { NextResponse } from "next/server";

import { getVapidPublicKey } from "@/lib/pdks/push";

export const dynamic = "force-dynamic";

/** GET /api/pdks/push/public-key → { key } (push abonelik için VAPID public key). */
export async function GET() {
  const key = getVapidPublicKey();
  if (!key) {
    return NextResponse.json({ error: "Push yapılandırılmamış" }, { status: 503 });
  }
  return NextResponse.json({ key });
}
