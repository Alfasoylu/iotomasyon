import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { gecerliKapatmaDurumu } from "@/lib/cfo/sicrama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cfo/sicrama-kapat
 *
 * Stok sıçramasını kapatır ve açıklamasını cfo_change_log'a yazar.
 * Body: { id: string|number, durum: SicramaKapatmaDurumu, aciklama?: string }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await checkPermission(user, PERMISSIONS.CFO_WRITE))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
    }
    const { id, durum, aciklama } = body as {
      id?: unknown;
      durum?: unknown;
      aciklama?: unknown;
    };

    // id bigint: JS number'ın güvenli aralığına güvenmek yerine metin olarak
    // doğrulanıp SQL'de ::bigint'e çevrilir.
    const idStr = typeof id === "string" || typeof id === "number" ? String(id) : "";
    if (!/^\d+$/.test(idStr)) {
      return NextResponse.json({ error: "Geçersiz id" }, { status: 400 });
    }

    // Geçersiz durum DB'deki CHECK constraint'ine takılıp 500 dönerdi.
    if (!gecerliKapatmaDurumu(durum)) {
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }

    const not = typeof aciklama === "string" ? aciklama.slice(0, 2000) : "";

    const rows = await prisma.$queryRawUnsafe<{ result: string }[]>(
      `SELECT cfo_sicrama_kapat($1::bigint, $2::text, $3::text) AS result`,
      idStr,
      durum,
      not
    );

    return NextResponse.json({ ok: true, result: rows?.[0]?.result ?? null });
  } catch (error) {
    console.error("[sicrama-kapat] Hata:", error);
    return NextResponse.json({ error: "İşlem başarısız oldu" }, { status: 500 });
  }
}
