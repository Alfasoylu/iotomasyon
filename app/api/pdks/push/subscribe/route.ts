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

    // ÖNCE SİL SONRA OLUŞTUR YAPMIYORUZ (güvenlik bulgusu D2).
    //
    // Eski kod `deleteMany({ where: { endpoint } })` çağırıyordu — tenantId
    // YOK. `endpoint` global unique olduğu için bu, kaydı BAŞKA bir tenant'a
    // aitse onu da siliyordu; araya giren herhangi bir hata da (create'in
    // catch'i sessizdi) aboneliği tamamen yok edip cihazı bildirimsiz
    // bırakıyordu. İkisi de sessiz: kullanıcı push almadığını günler sonra
    // fark eder ve sebebini bulamaz.
    //
    // upsert atomik: tek satır kalır, silme penceresi oluşmaz, anahtar
    // döndüğünde (p256dh/auth değişir) tazelenir. Aynı endpoint'i gönderen
    // taraf o cihazın kendisidir (endpoint'i tarayıcı üretir ve tahmin
    // edilemez), bu yüzden sahipliği oturumun tenant'ına taşımak doğru
    // davranıştır — eski kodun delete+create ile yapmaya çalıştığı da buydu.
    await prismaPdks.pdksPushSubscription.upsert({
      where: { endpoint },
      create: {
        tenantId: session.tenantId,
        personnelId: session.personnelId,
        endpoint,
        p256dh,
        auth,
      },
      update: {
        tenantId: session.tenantId,
        personnelId: session.personnelId,
        p256dh,
        auth,
      },
    });

    return NextResponse.json({ ok: true });
  });

  return result ?? NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
}
