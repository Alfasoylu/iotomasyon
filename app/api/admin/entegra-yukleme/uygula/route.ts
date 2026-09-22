/**
 * POST /api/admin/entegra-yukleme/uygula
 *
 * Yalnız ONAYLANMIŞ yüklemeyi yazar. Önizlemeden dönen `fileHash` zorunludur ve
 * sunucu dosyayı yeniden hash'leyip karşılaştırır: eşleşmezse HİÇBİR ŞEY
 * yazılmaz. Önizlenen dosya ile yazılan dosyanın aynı olduğu böyle garanti
 * edilir (kullanıcı arada başka dosya seçmiş olabilir).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kapi, eksikSutunYaniti } from "@/lib/entegra/http";
import { fileHash } from "@/lib/entegra/parse";
import { hazirla, buildOnizleme, yaz } from "@/lib/entegra/import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const g = await kapi(req);
  if (!g.ok) return g.res;

  const onaylanan = String(g.form.get("fileHash") ?? "");
  const gercek = fileHash(g.buffer);
  if (!onaylanan) {
    return NextResponse.json({ error: "Onay bilgisi yok. Önce önizleme alın." }, { status: 400 });
  }
  if (onaylanan !== gercek) {
    return NextResponse.json(
      { error: "Dosya önizlemeden sonra değişmiş. Hiçbir şey yazılmadı — önizlemeyi yenileyin." },
      { status: 409 }
    );
  }

  try {
    const h = await hazirla(g.buffer);
    if (h.eksikSutunlar.length > 0) return eksikSutunYaniti(h.eksikSutunlar);
    if (h.kayitlar.length === 0) {
      return NextResponse.json({ error: "Dosyada işlenebilir satır yok." }, { status: 400 });
    }

    // Tarih aralığını log'a yazmak için önizleme yeniden hesaplanır (okuma).
    const on = await buildOnizleme(h.kayitlar, h.atlanan.length, h.dosyaIciMukerrer);
    const sonuc = await yaz(h.kayitlar);

    await prisma.entegraImportLog.create({
      data: {
        fileName: g.fileName,
        fileHash: gercek,
        rowCount: h.kayitlar.length,
        createdCount: sonuc.yeni,
        updatedCount: sonuc.guncellenen,
        skippedCount: sonuc.atlanan + h.atlanan.length,
        dateFrom: on.tarihBas ? new Date(`${on.tarihBas}T00:00:00Z`) : null,
        dateTo: on.tarihSon ? new Date(`${on.tarihSon}T00:00:00Z`) : null,
        durationMs: sonuc.sureMs,
        userId: g.userId,
        userEmail: g.userEmail,
      },
    });

    return NextResponse.json({
      ok: true,
      yeni: sonuc.yeni,
      guncellenen: sonuc.guncellenen,
      atlanan: sonuc.atlanan + h.atlanan.length,
      sureMs: sonuc.sureMs,
      tarihBas: on.tarihBas,
      tarihSon: on.tarihSon,
    });
  } catch (err) {
    console.error("[entegra-uygula]", err);
    const msg = err instanceof Error ? err.message : "Yükleme başarısız.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
