import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";

export const dynamic = "force-dynamic";

/** POST /api/pdks/push/unsubscribe  body: { endpoint } */
export async function POST(req: NextRequest) {
  const result = await withPdksSession(async (session) => {
    let body: { endpoint?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (endpoint) {
      // Yalnız oturum sahibinin kendi aboneliği silinebilir (tenantId scoped
      // client tarafından eklenir; personnelId aynı tenant'taki başka personelin
      // endpoint'ini silmeyi engeller).
      await prismaPdks.pdksPushSubscription.deleteMany({
        where: { endpoint, personnelId: session.personnelId },
      });
    }
    return NextResponse.json({ ok: true });
  });

  return result ?? NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
}
