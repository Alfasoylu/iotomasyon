import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * POST /api/cfo/sicrama-kapat
 *
 * Stok sıçramasını kapatan ve açıklamasını kaydeden endpoint.
 * Request body:
 *   - id: bigint
 *   - durum: string (SATIS, TOPLU_SATIS, FBA_GONDERIM, SAYIM_DUZELTME, IADE_IPTAL, TRANSFER_BASKA_SKU, DIGER)
 *   - aciklama: string
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.EXECUTIVE_WRITE);

    const { id, durum, aciklama } = await req.json();

    if (!id || !durum) {
      return NextResponse.json(
        { error: "id ve durum gerekli" },
        { status: 400 }
      );
    }

    // cfo_sicrama_kapat() fonksiyonunu çağır
    const result = await prisma.$queryRawUnsafe(
      `SELECT cfo_sicrama_kapat($1, $2, $3) as result`,
      BigInt(id),
      durum,
      aciklama || ""
    );

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[sicrama-kapat] Hata:", error);
    return NextResponse.json(
      { error: "İşlem başarısız oldu" },
      { status: 500 }
    );
  }
}
