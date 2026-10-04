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
import { signPreview } from "@/lib/banka/confirmation";
import { BankPdfError } from "@/lib/banka/pdf";
import { NextResponse } from "next/server";
import { kapi } from "@/lib/banka/http";
import { fileHash, onayAnahtariHesapla } from "@/lib/banka/parse";
import { hazirla, kayitlaraDonustur, buildOnizleme } from "@/lib/banka/import";
import { ALAN_ETIKET } from "@/lib/banka/columns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const g = await kapi(req);
  if (!g.ok) return g.res;

  try {
    const h = await hazirla(g.buffer, g.elleEsleme, g.fileName);

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
      onayAnahtari: signPreview(g.userId, onayAnahtariHesapla(gercekHash, g.banka, h.eslesen)),
      fileName: g.fileName,
      banka: g.banka,
      eslesen: h.eslesen,
      eslesmeyenSutunlar: h.eslesmeyenSutunlar,
      onizleme,
      atlananOrnek: h.atlanan.slice(0, 10),
    });
  } catch (error) {
    if (error instanceof BankPdfError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "İşlem tamamlanamadı. Dosyayı ve hesap seçimini kontrol edip yeniden deneyin." }, { status: 400 });
  }
}
