// CİRO HEDEFİNE GİDEN YOL — gelir kaldıraçları (SAF, deterministik; 2026-10-07). Aylık ciro hedefi (100.000 USD) ile bugünkü
// ciro arasındaki açığı hangi kaldıracın ne kadar kapattığını, ek sermaye ihtiyacını ve paranın zaten harcanıp harcanmadığını
// sıralar. Batık sermaye (ödenmiş ama satılamayan ithalat) ek sermaye istemez → katkı / ek sermaye sonsuz → ilk sırada.
// Tahminler TAHMİNİ işaretlidir; satış hızı bilinmeyen kalemde ithalat projesinin kendi satış süresi varsayımı kullanılır.

export type Lever = {
  key: string; label: string;
  /** aylık ek ciro (TL, KDV dahil satış tutarı) */
  revenueMonthlyTry: number;
  /** aylık brüt katkı = ciro − satılan malın maliyeti (komisyon/kargo hariç) */
  grossMonthlyTry: number;
  /** başlatmak için gereken EK sermaye (TL) */
  capitalNeededTry: number;
  /** zaten harcanmış, bugün getirisiz duran sermaye (TL) */
  sunkCapitalTry: number;
  /** ilk cirona kadar gün (yaklaşık) */
  daysToRevenue: number;
  confidence: number; basis: string; blocker: string;
  /** aylık brüt katkı / ek sermaye (ek sermaye 0 ise null = sınırsız) */
  grossPerCapital: number | null;
};

export function stockoutLever(rows: { sku: string; rev90: number; units90: number; unitCost: number | null }[], leadDays: number, coverDays: number): Lever | null {
  const known = rows.filter(r => r.unitCost != null && r.unitCost > 0);
  if (!rows.length) return null;
  const rev = rows.reduce((s, r) => s + r.rev90, 0) / 3;
  const cogs = known.reduce((s, r) => s + r.units90 * r.unitCost!, 0) / 3;
  const revKnown = known.reduce((s, r) => s + r.rev90, 0) / 3;
  const gross = revKnown - cogs;
  const capital = cogs * (coverDays / 30);
  return { key: "stockout", label: `Stoksuz kalan ${rows.length} satan ürünü yeniden stokla`, revenueMonthlyTry: Math.round(rev), grossMonthlyTry: Math.round(gross),
    capitalNeededTry: Math.round(capital), sunkCapitalTry: 0, daysToRevenue: leadDays, confidence: 0.6,
    basis: `son 90 gün satılmış, bugün stok 0; aylık ciro = 90 gün cirosu/3; sermaye = ${coverDays} günlük örtü × maliyet (${rows.length - known.length} üründe maliyet yok)`,
    blocker: "ithalat borç kapısı (yeni sipariş, finansal borç hedefin altına inince) + öz nakit", grossPerCapital: capital > 0 ? gross / capital : null };
}

export function newProductsLever(agg: { n: number; notInCatalog: number; grossListTry: number; landedTry: number; salesMonths: number }): Lever | null {
  if (agg.n === 0) return null;
  const rev = agg.grossListTry / agg.salesMonths;
  const gross = (agg.grossListTry - agg.landedTry) / agg.salesMonths;
  return { key: "new-products", label: `Konteynerdeki ${agg.n} yeni ürünü listele (${agg.notInCatalog}'i katalogda yok)`, revenueMonthlyTry: Math.round(rev),
    grossMonthlyTry: Math.round(gross), capitalNeededTry: 0, sunkCapitalTry: Math.round(agg.landedTry), daysToRevenue: 14, confidence: 0.4,
    basis: `liste fiyatı × adet ${Math.round(agg.grossListTry)} TL, ${agg.salesMonths} ayda eriyeceği varsayımı (ithalat projesi); mal parası ödenmiş`,
    blocker: "ürün kartı, görsel, kategori/marka eşleme — iş gücü; sermaye gerekmez", grossPerCapital: null };
}

export function scaleProtectLever(restockCapitalTry: number, protectedRevenueMonthlyTry: number, grossMonthlyTry: number, leadDays: number): Lever | null {
  if (restockCapitalTry <= 0) return null;
  return { key: "scale-restock", label: "Yıldız ürünlerin (SCALE) stoğunu tamamla — ciroyu koru", revenueMonthlyTry: Math.round(protectedRevenueMonthlyTry),
    grossMonthlyTry: Math.round(grossMonthlyTry), capitalNeededTry: Math.round(restockCapitalTry), sunkCapitalTry: 0, daysToRevenue: leadDays, confidence: 0.6,
    basis: "sermaye verimliliği motorunun SCALE sınıfı: getiri eşiğin 2 katı üstünde ve stok hedef örtünün altında", blocker: "öz nakit; borç kapısı",
    grossPerCapital: grossMonthlyTry / restockCapitalTry };
}

export type RevenuePlan = { currentMonthlyTry: number; targetMonthlyTry: number; gapMonthlyTry: number; levers: (Lever & { gapShare: number })[]; coveredShare: number };

/** Sıra: önce ek sermaye istemeyen (batık sermayeyi çalıştıran), sonra aylık brüt katkı / ek sermaye; güvenle ağırlıklı. */
export function rankLevers(levers: (Lever | null)[], currentMonthlyTry: number, targetMonthlyTry: number): RevenuePlan {
  const gap = Math.max(0, targetMonthlyTry - currentMonthlyTry);
  const xs = levers.filter((l): l is Lever => l != null).sort((a, b) => {
    const sa = a.grossPerCapital == null ? Infinity : a.grossPerCapital * a.confidence, sb = b.grossPerCapital == null ? Infinity : b.grossPerCapital * b.confidence;
    return sb - sa || b.grossMonthlyTry * b.confidence - a.grossMonthlyTry * a.confidence;
  });
  const withShare = xs.map(l => ({ ...l, gapShare: gap > 0 ? Math.min(1, (l.revenueMonthlyTry * l.confidence) / gap) : 0 }));
  return { currentMonthlyTry: Math.round(currentMonthlyTry), targetMonthlyTry: Math.round(targetMonthlyTry), gapMonthlyTry: Math.round(gap), levers: withShare,
    coveredShare: Math.min(1, withShare.reduce((s, l) => s + l.gapShare, 0)) };
}
