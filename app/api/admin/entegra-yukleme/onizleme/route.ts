/**
 * POST /api/admin/entegra-yukleme/onizleme
 *
 * Dosyayı ayrıştırır, ürünleri eşleştirir ve NE OLACAĞINI döner.
 * ⛔ TEK SATIR YAZMAZ. Yazma yalnız /uygula ucundan, onay sonrası.
 */
import { NextResponse } from "next/server";
import { kapi, eksikSutunYaniti } from "@/lib/entegra/http";
import { fileHash } from "@/lib/entegra/parse";
import { hazirla, buildOnizleme } from "@/lib/entegra/import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const g = await kapi(req);
  if (!g.ok) return g.res;

  try {
    const h = await hazirla(g.buffer);
    if (h.eksikSutunlar.length > 0) return eksikSutunYaniti(h.eksikSutunlar);
    if (h.kayitlar.length === 0) {
      return NextResponse.json(
        { error: "Dosyada işlenebilir satır yok.", atlanan: h.atlanan.slice(0, 10) },
        { status: 400 }
      );
    }

    const onizleme = await buildOnizleme(h.kayitlar, h.atlanan.length, h.dosyaIciMukerrer);

    return NextResponse.json({
      // Onay adımı bu değeri geri gönderir; sunucu dosyayı yeniden hash'leyip
      // karşılaştırır. Böylece "önizlediğim dosya ile yazılan dosya aynı mı?"
      // sorusu sunucuda yanıtlanır, kullanıcının sözüne güvenilmez.
      fileHash: fileHash(g.buffer),
      fileName: g.fileName,
      onizleme,
      atlananOrnek: h.atlanan.slice(0, 10),
    });
  } catch (err) {
    console.error("[entegra-onizleme]", err);
    const msg = err instanceof Error ? err.message : "Dosya okunamadı.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
