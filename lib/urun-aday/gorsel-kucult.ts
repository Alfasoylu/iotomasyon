/**
 * Tarayıcıda görsel küçültme — yüklemeden ÖNCE.
 *
 * NEDEN GEREKLİ: Next.js sunucu eylemlerinin gövde sınırı varsayılan 1 MB ve
 * istek sunucu koduna ULAŞMADAN reddediliyor; tarayıcı 404 görüyor, log'a da
 * hiçbir şey düşmüyor. Sınırı yükseltmek tek başına yetmez — Vercel'de istek
 * gövdesi ~4,5 MB'ta zaten duvara çarpar.
 *
 * Asıl mesele şu: telefon fotoğrafı 3-8 MB ama pazaryerleri 1200-2000 piksel
 * istiyor. Tam boy yüklemenin faydası yok. 2000 piksele indirip JPEG'e çevirince
 * dosya ~300-800 KB'a düşüyor ve kalite pazaryeri standardının üstünde kalıyor.
 *
 * ÜÇ TUZAK, üçü de burada karşılanıyor:
 *   • EXIF dönüklüğü — telefonla dikey çekilen fotoğraf canvas'a çizilince yan
 *     yatar. `imageOrientation: "from-image"` bunu düzeltir.
 *   • Saydam PNG — beyaz doldurulmazsa saydam alanlar SİYAH çıkar.
 *   • GIF — canvas'tan geçirmek animasyonu öldürür, o yüzden hiç dokunulmaz.
 */

/** Pazaryeri galerileri için yeterli; Trendyol/HB/Amazon 2000'i kırpmadan alır. */
const MAX_KENAR = 2000;
const HEDEF_BAYT = 900 * 1024;
const KALITE_ADIMLARI = [0.85, 0.75, 0.65, 0.55];

export type KucultmeSonucu = {
  dosya: File;
  kucultuldu: boolean;
  eskiBayt: number;
  yeniBayt: number;
  not?: string;
};

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const kb = (b: number) => `${Math.round(b / 1024)} KB`;

export function boyutYaz(b: number) {
  return b >= 1024 * 1024 ? mb(b) : kb(b);
}

async function blobUret(
  canvas: HTMLCanvasElement,
  kalite: number,
): Promise<Blob | null> {
  return new Promise((cozumle) =>
    canvas.toBlob((b) => cozumle(b), "image/jpeg", kalite),
  );
}

/**
 * Görseli gerekiyorsa küçültür. Küçültemezse ORİJİNALİ döndürür — yüklemeyi
 * engellemez; boyut kontrolü sunucuda zaten var ve oradaki hata mesajı anlaşılır.
 */
export async function gorseliKucult(file: File): Promise<KucultmeSonucu> {
  const eskiBayt = file.size;

  // GIF'e dokunma: canvas animasyonu tek kareye indirir.
  if (file.type === "image/gif") {
    return {
      dosya: file,
      kucultuldu: false,
      eskiBayt,
      yeniBayt: eskiBayt,
      not: "GIF küçültülmedi (animasyon korunuyor).",
    };
  }

  try {
    // EXIF dönüklüğünü uygula — yoksa dikey telefon fotoğrafı yan yatar.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const enBuyukKenar = Math.max(bitmap.width, bitmap.height);
    const olcek = enBuyukKenar > MAX_KENAR ? MAX_KENAR / enBuyukKenar : 1;

    // Zaten küçük ve hafifse dokunma: yeniden kodlamak kaliteyi boşuna düşürür.
    if (olcek === 1 && eskiBayt <= HEDEF_BAYT) {
      bitmap.close();
      return { dosya: file, kucultuldu: false, eskiBayt, yeniBayt: eskiBayt };
    }

    const g = Math.round(bitmap.width * olcek);
    const y = Math.round(bitmap.height * olcek);

    const canvas = document.createElement("canvas");
    canvas.width = g;
    canvas.height = y;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { dosya: file, kucultuldu: false, eskiBayt, yeniBayt: eskiBayt };
    }

    // Saydam PNG'yi beyaza bas — doldurmazsak saydam alanlar siyah çıkıyor.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, g, y);
    ctx.drawImage(bitmap, 0, 0, g, y);
    bitmap.close();

    let blob: Blob | null = null;
    for (const kalite of KALITE_ADIMLARI) {
      blob = await blobUret(canvas, kalite);
      if (blob && blob.size <= HEDEF_BAYT) break;
    }
    if (!blob) {
      return { dosya: file, kucultuldu: false, eskiBayt, yeniBayt: eskiBayt };
    }

    // Küçültme büyüttüyse (küçük PNG'lerde olabilir) orijinali koru.
    if (blob.size >= eskiBayt) {
      return { dosya: file, kucultuldu: false, eskiBayt, yeniBayt: eskiBayt };
    }

    const ad = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      dosya: new File([blob], ad, { type: "image/jpeg", lastModified: Date.now() }),
      kucultuldu: true,
      eskiBayt,
      yeniBayt: blob.size,
      not: `${g}×${y} piksele indirildi`,
    };
  } catch {
    // Tarayıcı desteklemiyorsa yüklemeyi engelleme; sunucu sınırı yakalar.
    return { dosya: file, kucultuldu: false, eskiBayt, yeniBayt: eskiBayt };
  }
}
