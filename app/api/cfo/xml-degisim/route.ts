import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * GET /api/cfo/xml-degisim
 *
 * cfo_xml_urun_degisim tablosundan son 500 değişim kaydını döner.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.EXECUTIVE_READ);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        id, product_id, sku, alan, eski, yeni, entegra_degisim_zamani, yakalandi
      FROM cfo_xml_urun_degisim
      ORDER BY yakalandi DESC
      LIMIT 500
    `);

    return NextResponse.json(rows || []);
  } catch (error) {
    console.error("[xml-degisim] Hata:", error);
    return NextResponse.json(
      { error: "Veri yükleme başarısız" },
      { status: 500 }
    );
  }
}
