/**
 * ChatGPT info-görsel promptu üretici.
 *
 * NEDEN ÜRETİLİYOR: tedarikçiden gelen bilgi görselleri ÇİNCE. Pazaryeri Çince
 * görsel kabul etmiyor, müşteri de okuyamıyor. Aynı bilgiyi Türkçe, kendi
 * görselimizde vermemiz gerekiyor.
 *
 * NEDEN ŞABLON: bu oturumda IP kamera seti için elle yazılan promptlar işe
 * yaradı; oradaki kalıp burada sabitlendi. Kritik kısımlar deneyle öğrenildi:
 *   • "metinleri birebir şu şekilde yaz" demezsen model Türkçe'yi bozuyor
 *     (harf düşürüyor, İ/ı karıştırıyor) — o yüzden metinler tırnak içinde,
 *     "değiştirme" talimatıyla veriliyor.
 *   • Ölçü verilmezse model rastgele ölçü uyduruyor. Bilinmeyen alan prompta
 *     HİÇ konmuyor; uydurulmasındansa eksik kalması iyi.
 *   • Kare (1:1) isteniyor çünkü Trendyol/HB/Amazon galerisi kare kırpıyor.
 */

export type PromptGirdi = {
  sku: string;
  ad: string;
  marka?: string | null;
  kategori?: string | null;
  aciklama?: string | null;
  ozellikler?: Record<string, string> | null;
  kutuEn?: number | null;
  kutuBoy?: number | null;
  kutuYuk?: number | null;
  agirlikKg?: number | null;
  mensei?: string | null;
  garantiAy?: number | null;
};

function madde(g: PromptGirdi): string[] {
  const m: string[] = [];
  for (const [k, v] of Object.entries(g.ozellikler ?? {})) {
    const t = String(v ?? "").trim();
    if (t) m.push(`${k}: ${t}`);
  }
  if (g.kutuEn && g.kutuBoy && g.kutuYuk) {
    m.push(`Kutu ölçüsü: ${g.kutuEn}×${g.kutuBoy}×${g.kutuYuk} cm`);
  }
  if (g.agirlikKg) m.push(`Ağırlık: ${g.agirlikKg} kg`);
  if (g.mensei) m.push(`Menşei: ${g.mensei}`);
  if (g.garantiAy) m.push(`Garanti: ${g.garantiAy} ay`);
  return m;
}

/** Görsel 1 — teknik özellikler kartı. */
export function ozellikPromptu(g: PromptGirdi): string {
  const maddeler = madde(g);
  const baslik = g.marka ? `${g.marka} ${g.ad}` : g.ad;

  return [
    `Bir e-ticaret ürün bilgi görseli tasarla. Kare format, 2000x2000 piksel, yüksek çözünürlük.`,
    ``,
    `ÜRÜN: ${baslik}`,
    g.kategori ? `KATEGORİ: ${g.kategori}` : null,
    ``,
    `GÖRSELDE YER ALACAK METİNLER — bunları BİREBİR, harfi harfine yaz.`,
    `Türkçe karakterleri (ç ğ ı İ ö ş ü) doğru yaz, hiçbirini değiştirme veya çevirme:`,
    ``,
    `Başlık: "${baslik}"`,
    maddeler.length > 0
      ? maddeler.map((x) => `• "${x}"`).join("\n")
      : `(Teknik özellik verilmedi — özellik maddesi EKLEME, uydurma.)`,
    ``,
    `TASARIM:`,
    `- Temiz beyaz veya çok açık gri zemin.`,
    `- Ürün fotoğrafı ortada veya solda, özellikler sağda liste hâlinde.`,
    `- Her özelliğin yanında basit, tek renk bir ikon.`,
    `- Modern, sade, teknik. Abartılı gölge, alev, parlama efekti YOK.`,
    `- Yazılar büyük ve okunaklı; telefonda küçük ekranda da okunmalı.`,
    ``,
    `YASAKLAR:`,
    `- Çince, İngilizce veya başka dilde HİÇBİR metin olmasın. Yalnız Türkçe.`,
    `- Yukarıda verilmeyen hiçbir teknik değer, ölçü veya rakam UYDURMA.`,
    `- Marka logosu, başka firma adı, fiyat, indirim rozeti, "ücretsiz kargo"`,
    `  gibi kampanya ifadesi ekleme.`,
    `- İnsan yüzü, el veya model kullanma.`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

/** Görsel 2 — kutu içeriği / kullanım kartı. */
export function kutuPromptu(g: PromptGirdi, icerik: string[]): string {
  const baslik = g.marka ? `${g.marka} ${g.ad}` : g.ad;
  return [
    `Bir e-ticaret "kutunun içinde ne var" görseli tasarla. Kare format, 2000x2000 piksel.`,
    ``,
    `ÜRÜN: ${baslik}`,
    ``,
    `GÖRSELDE YER ALACAK METİNLER — BİREBİR yaz, Türkçe karakterleri bozma:`,
    ``,
    `Başlık: "Kutuda Ne Var?"`,
    icerik.length > 0
      ? icerik.map((x) => `• "${x}"`).join("\n")
      : `(Kutu içeriği verilmedi — parça listesi UYDURMA, önce içeriği gir.)`,
    ``,
    `TASARIM:`,
    `- Beyaz zemin, parçalar düzenli aralıklarla dizilmiş, üstten görünüm.`,
    `- Her parçanın altında adı yazsın.`,
    `- Sade çizgi ikonlar veya gerçekçi ürün görselleri; ikisi karışmasın.`,
    ``,
    `YASAKLAR:`,
    `- Çince veya İngilizce metin YOK.`,
    `- Listede olmayan parça ekleme. Adet uydurma.`,
    `- Fiyat, kampanya, marka logosu ekleme.`,
  ].join("\n");
}

/**
 * Prompt üretilebilir mi? Yetersiz veriyle üretilen prompt modele uydurma
 * yaptırır; o yüzden eksikse prompt vermek yerine ne gerektiğini söylüyoruz.
 */
export function promptHazirMi(g: PromptGirdi): { hazir: boolean; eksik: string[] } {
  const eksik: string[] = [];
  if (!g.ad || g.ad.trim().length < 5) eksik.push("Türkçe ürün adı");
  if (madde(g).length === 0) eksik.push("En az bir teknik özellik (ölçü, ağırlık, menşei veya özellik)");
  return { hazir: eksik.length === 0, eksik };
}
