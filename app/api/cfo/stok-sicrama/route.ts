import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * GET /api/cfo/stok-sicrama
 *
 * cfo_stok_sicrama_durum view'inden son 30 günlük açık sıçramaları döner.
 * Query params:
 *   - durum: Filtre (varsayılan "ACIK")
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.EXECUTIVE_READ);

    const { searchParams } = new URL(req.url);
    const durumFilter = searchParams.get("durum") || "ACIK";

    const query =
      durumFilter === ""
        ? `
      SELECT
        id, sku, urun, hareket_gunu, onceki, yeni, delta,
        normal_gunluk_dusus, esik_nedeni, entegra_degisim_zamani,
        ty_adet, fba_adet, aciklanamayan_adet, aciklanamayan_maliyet_try,
        durum, aciklama, otomatik_teshis
      FROM cfo_stok_sicrama_durum
      WHERE hareket_gunu >= current_date - interval '30 days'
      ORDER BY hareket_gunu DESC
    `
        : `
      SELECT
        id, sku, urun, hareket_gunu, onceki, yeni, delta,
        normal_gunluk_dusus, esik_nedeni, entegra_degisim_zamani,
        ty_adet, fba_adet, aciklanamayan_adet, aciklanamayan_maliyet_try,
        durum, aciklama, otomatik_teshis
      FROM cfo_stok_sicrama_durum
      WHERE durum = $1
        AND hareket_gunu >= current_date - interval '30 days'
      ORDER BY hareket_gunu DESC
    `;

    const rows = await prisma.$queryRawUnsafe(
      durumFilter === "" ? query.split("$1")[0] : query,
      ...(durumFilter === "" ? [] : [durumFilter])
    );

    return NextResponse.json(rows || []);
  } catch (error) {
    console.error("[stok-sicrama] Hata:", error);
    return NextResponse.json(
      { error: "Veri yükleme başarısız" },
      { status: 500 }
    );
  }
}
