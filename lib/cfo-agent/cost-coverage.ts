// Maliyet kapsamı açığını kapatan en kısa liste (SAF, deterministik; 2026-10-08).
// Girdi: cfo_maliyet_kapsami_satir(asof) — kapsamın TEK sınıflaması — SKU × durum toplamları. Kapsam yüzdesi ile bu liste aynı
// sınıflamadan gelir. Açık = ceil(eşik × ciro) − kapsanan. En büyük TL'den başlayarak açığı kapatana kadar kalem seçilir (en az kalem
// ile kapı açılır). Her kalemin yapılacak işi durumuna göredir:
//   maliyetsiz → ürün maliyeti gir · eslesmeyen → satıştaki model kodunu ürüne eşle · guvenilmez → adet/set ayrıştırması belirsiz
//   (güven KARMA/BILINMIYOR) ya da satır kimliği boş tekrar.

export type CoverageRow = { durum: string; sku: string; tl: number; guven: string | null; tekrar: boolean };
export type CoverageCloser = { sku: string; durum: "maliyetsiz" | "eslesmeyen" | "guvenilmez"; tl: number; why: string };

export function coverageClosers(rows: CoverageRow[], ciroTry: number, kapsananTry: number, minPct: number, max = 10):
  { gapTry: number; items: CoverageCloser[]; closesGap: boolean } {
  const gapTry = Math.max(0, Math.ceil((minPct / 100) * ciroTry - kapsananTry));
  const items: CoverageCloser[] = [];
  let sum = 0;
  for (const r of [...rows].filter(r => r.durum !== "kapsanan" && r.tl > 0).sort((a, b) => b.tl - a.tl || a.sku.localeCompare(b.sku))) {
    if (sum >= gapTry || items.length >= max) break;
    const durum = r.durum as CoverageCloser["durum"];
    const why = durum === "maliyetsiz" ? "maliyet girilmemiş" : durum === "eslesmeyen" ? "ürüne eşleşmiyor"
      : r.tekrar ? "satır kimliği boş tekrar" : `adet/set ayrıştırması belirsiz, güven ${r.guven ?? "yok"}`;
    items.push({ sku: r.sku, durum, tl: Math.round(r.tl), why });
    sum += r.tl;
  }
  return { gapTry, items, closesGap: sum >= gapTry };
}

export const fmtClosers = (items: Pick<CoverageCloser, "sku" | "tl" | "why">[]) =>
  items.map(i => `${i.sku} ${new Intl.NumberFormat("tr-TR").format(i.tl)} TL (${i.why})`).join("; ");
