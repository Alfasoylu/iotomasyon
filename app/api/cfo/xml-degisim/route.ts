import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cfo/xml-degisim
 *
 * cfo_xml_urun_degisim tablosundan son 500 değişim kaydını döner.
 * id bigint olduğu için text'e çevrilir (bkz. stok-sicrama route'u).
 */
export async function GET() {
  const user = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await checkPermission(user, PERMISSIONS.CFO_READ))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        id::text AS id,
        product_id, sku, alan, eski, yeni, entegra_degisim_zamani, yakalandi
      FROM cfo_xml_urun_degisim
      ORDER BY yakalandi DESC
      LIMIT 500
    `);

    return NextResponse.json(rows ?? []);
  } catch (error) {
    console.error("[xml-degisim] Hata:", error);
    return NextResponse.json({ error: "Veri yükleme başarısız" }, { status: 500 });
  }
}
