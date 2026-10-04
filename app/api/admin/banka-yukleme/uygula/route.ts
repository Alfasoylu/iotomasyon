/**
 * POST /api/admin/banka-yukleme/uygula
 *
 * Yalnız ONAYLANMIŞ yüklemeyi yazar. Önizlemeden dönen `fileHash` ve
 * `onayAnahtari` zorunludur ve sunucu ikisini de yeniden hesaplayıp
 * karşılaştırır: dosya, banka ya da sütun eşlemesi önizlemeden farklıysa
 * HİÇBİR ŞEY yazılmaz (bkz. lib/banka/parse.ts → onayAnahtariHesapla).
 *
 * ⛔ Yazma yalnız `cfo_banka_hareket`'e INSERT'tir (ON CONFLICT DO NOTHING).
 * UPDATE/DELETE yok, `cfo_bank_account.balanceTry` bu uçtan HİÇ değişmez.
 */
import { verifyPreview } from "@/lib/banka/confirmation";
import { BankPdfError } from "@/lib/banka/pdf";
import { NextResponse } from "next/server";
import { kapi } from "@/lib/banka/http";
import { fileHash, onayAnahtariHesapla } from "@/lib/banka/parse";
import { hazirla, kayitlaraDonustur, buildOnizleme, yaz } from "@/lib/banka/import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const g = await kapi(req);
  if (!g.ok) return g.res;

  if (!g.elleEsleme) {
    return NextResponse.json(
      { error: "Sütun eşlemesi eksik. Önizlemeden dönen `eslesen` alanını `mapping` olarak geri gönderin." },
      { status: 400 }
    );
  }

  const gercekHash = fileHash(g.buffer);
  const bekleyenHash = String(g.form.get("fileHash") ?? "");
  const bekleyenOnay = String(g.form.get("onayAnahtari") ?? "");
  if (!bekleyenHash || !bekleyenOnay) {
    return NextResponse.json({ error: "Onay bilgisi yok. Önce önizleme alın." }, { status: 400 });
  }
  if (bekleyenHash !== gercekHash) {
    return NextResponse.json(
      { error: "Dosya önizlemeden sonra değişmiş. Hiçbir şey yazılmadı — önizlemeyi yenileyin." },
      { status: 409 }
    );
  }
  const gercekOnay = onayAnahtariHesapla(gercekHash, g.banka, g.elleEsleme);
  if (!verifyPreview(bekleyenOnay, g.userId, gercekOnay)) {
    return NextResponse.json(
      {
        error:
          "Banka ya da sütun eşlemesi önizlemeden sonra değişmiş. Hiçbir şey yazılmadı — önizlemeyi yenileyin.",
      },
      { status: 409 }
    );
  }

  try {
    const h = await hazirla(g.buffer, g.elleEsleme, g.fileName);
    if (h.eksikZorunlu.length > 0) {
      return NextResponse.json({ error: "Zorunlu sütunlar eksik." }, { status: 400 });
    }

    const kayitlar = kayitlaraDonustur(h.satirlar, g.banka, g.fileName, h.legacySatirlar);
    // Log'a yazılacak tarih aralığı/bakiye için önizleme yeniden hesaplanır
    // (okuma). Onizleme ve yazma AYNI kayıt listesini kullanır — ayrı
    // üretilselerdi biri diğerinden sapabilirdi.
    const onizleme = await buildOnizleme(kayitlar, g.banka, h.atlanan.length);

    if (!onizleme.canImport) return NextResponse.json({ error: "Hareket aktarımı bu veritabanında hazır değil. Bakiye formunu kullanabilirsiniz." }, { status: 503 });
    if (!kayitlar.length) return NextResponse.json({ error: "Kaydedilecek geçerli hareket bulunamadı." }, { status: 400 });
    const sonuc = await yaz(kayitlar, {
      banka: g.banka,
      fileName: g.fileName,
      userId: g.userId,
      userEmail: g.userEmail,
      onizleme,
      atlananSayisi: h.atlanan.length,
    });

    return NextResponse.json({
      ok: true,
      eklenen: sonuc.eklenen,
      atlananMukerrer: sonuc.atlananMukerrer,
      atlananGecersiz: h.atlanan.length,
      sureMs: sonuc.sureMs,
      tarihBas: onizleme.dosyaTarihBas,
      tarihSon: onizleme.dosyaTarihSon,
      dosyaSonBakiye: onizleme.dosyaSonBakiye,
      dosyaBakiyeTarihi: onizleme.dosyaBakiyeTarihi,
      defterBakiye: onizleme.defterBakiye,
      bakiyeFarki: onizleme.bakiyeFarki,
    });
  } catch (error) {
    if (error instanceof BankPdfError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "İşlem tamamlanamadı. Dosyayı ve hesap seçimini kontrol edip yeniden deneyin." }, { status: 400 });
  }
}
