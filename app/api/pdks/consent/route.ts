import { NextResponse } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/pdks/consent — oturum açmış personelin KVKK açık rızasını kaydeder.
 * İdempotent: rıza zaten varsa zaman korunur.
 */
export async function POST() {
  const result = await withPdksSession(async (session) => {
    const me = await prismaPdks.pdksPersonnel.findFirst({
      where: { id: session.personnelId },
      select: { kvkkConsentAt: true },
    });
    if (!me) {
      return NextResponse.json({ error: "Personel bulunamadı" }, { status: 404 });
    }
    if (!me.kvkkConsentAt) {
      await prismaPdks.pdksPersonnel.updateMany({
        where: { id: session.personnelId },
        data: { kvkkConsentAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true });
  });

  return result ?? NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
}
