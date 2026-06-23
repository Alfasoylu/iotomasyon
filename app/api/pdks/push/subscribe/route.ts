import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/pdks/push/subscribe  body: PushSubscription JSON
 * { endpoint, keys: { p256dh, auth } }
 */
export async function POST(req: NextRequest) {
  const result = await withPdksSession(async (session) => {
    let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }

    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!endpoint || typeof p256dh !== "string" || typeof auth !== "string") {
      return NextResponse.json({ error: "Geçersiz abonelik" }, { status: 400 });
    }

    // Aynı endpoint kendi tenant'ımda zaten varsa tazele. (endpoint global unique;
    // başka tenant'a aitse create P2002 atar — sessizce geçeriz, 410'da temizlenir.)
    await prismaPdks.pdksPushSubscription.deleteMany({ where: { endpoint } });
    try {
      await prismaPdks.pdksPushSubscription.create({
        data: {
          tenantId: session.tenantId,
          personnelId: session.personnelId,
          endpoint,
          p256dh,
          auth,
        },
      });
    } catch {
      // başka tenant'a ait endpoint — yok say
    }

    return NextResponse.json({ ok: true });
  });

  return result ?? NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
}
