/**
 * POST /api/admin/banka-yukleme/onizleme
 *
 * Dosyayı ayrıştırır, sütunları eşler ve NE OLACAĞINI döner.
 * ⛔ TEK SATIR YAZMAZ. Yazma yalnız /uygula ucundan, onay sonrası.
 *
 * Zorunlu sütunlar (tarih/açıklama/tutar) otomatik eşleşmezse `needsMapping:true`
 * döner — istemci ilk 5 satırı gösterip kullanıcıya elle seçtirir, sonra aynı
 * uca `mapping` alanıyla tekrar sorar.
 */
import { NextResponse } from "next/server";
import { kapi } from "@/lib/banka/http";
import { fileHash, onayAnahtariHesapla } from "@/lib/banka/parse";
import { hazirla, kayitlaraDonustur, buildOnizleme } from "@/lib/banka/import";
import { ALAN_ETIKET } from "@/lib/banka/columns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const g = await kapi(req);
  if (!g.ok) return g.res;

  try {
    const h = hazirla(g.buffer, g.elleEsleme);

    if (h.eksikZorunlu.length > 0) {
      return NextResponse.json({
        needsMapping: true,
        basliklar: h.basliklar,
        ilkSatirlar: h.ilkSatirlar,
        eslesen: h.eslesen,
        eksikZorunlu: h.eksikZorunlu,
        alanEtiketleri: ALAN_ETIKET,
      });
    }

    const kayitlar = kayitlaraDonustur(h.satirlar, g.banka, g.fileName);
    const onizleme = await buildOnizleme(kayitlar, g.banka, h.atlanan.length);
    const gercekHash = fileHash(g.buffer);

    return NextResponse.json({
      needsMapping: false,
      // Onay adımı bu ikisini geri gönderir; sunucu dosyayı VE banka/eşlemeyi
      // yeniden hesaplayıp karşılaştırır (bkz. onayAnahtariHesapla).
      fileHash: gercekHash,
      onayAnahtari: onayAnahtariHesapla(gercekHash, g.banka, h.eslesen),
      fileName: g.fileName,
      banka: g.banka,
      eslesen: h.eslesen,
      eslesmeyenSutunlar: h.eslesmeyenSutunlar,
      onizleme,
      atlananOrnek: h.atlanan.slice(0, 10),
    });
  } catch (err) {
    console.error("[banka-onizleme]", err);
    const msg = err instanceof Error ? err.message : "Dosya okunamadı.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
