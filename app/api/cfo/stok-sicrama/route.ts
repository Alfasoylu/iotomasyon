import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cfo/stok-sicrama
 *
 * cfo_stok_sicrama_durum view'inden son 30 günlük sıçramaları döner.
 * Query params:
 *   - durum: filtre (varsayılan "ACIK"; "" → hepsi)
 *
 * ⚠️ bigint ve numeric kolonlar SQL'de text/float'a çevrilir: NextResponse.json()
 * BigInt'i serialize EDEMEZ ("Do not know how to serialize a BigInt") ve uç
 * çalışma anında 500 dönerdi — tip denetimi bunu yakalamaz.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await checkPermission(user, PERMISSIONS.CFO_READ))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const durumParam = searchParams.get("durum");
    // Parametre hiç verilmediyse varsayılan "ACIK"; boş verildiyse filtre yok.
    const durum = durumParam === null ? "ACIK" : durumParam.trim() || null;

    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT
        id::text                        AS id,
        sku, urun, hareket_gunu,
        onceki, yeni, delta,
        normal_gunluk_dusus::float8     AS normal_gunluk_dusus,
        esik_nedeni, entegra_degisim_zamani,
        ty_adet::int                    AS ty_adet,
        fba_adet::int                   AS fba_adet,
        aciklanamayan_adet::int         AS aciklanamayan_adet,
        aciklanamayan_maliyet_try::float8 AS aciklanamayan_maliyet_try,
        durum, aciklama, otomatik_teshis
      FROM cfo_stok_sicrama_durum
      WHERE ($1::text IS NULL OR durum = $1::text)
        AND hareket_gunu >= current_date - interval '30 days'
      ORDER BY hareket_gunu DESC
      LIMIT 500
      `,
      durum
    );

    return NextResponse.json(rows ?? []);
  } catch (error) {
    console.error("[stok-sicrama] Hata:", error);
    return NextResponse.json({ error: "Veri yükleme başarısız" }, { status: 500 });
  }
}
