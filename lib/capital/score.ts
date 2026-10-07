// Sermaye Sağlık Skoru (0-100) — saf hesap. /admin/sermaye ve dashboard manşeti aynı fonksiyonu kullanır
// (2026-10-07 sermaye sayfaları birleşmesi: daha önce iki ayrı kopya, iki ayrı talep kaynağıyla hesaplıyordu).
// Ağırlıklar:
//   ROI:           50 puan → yıllık ROI %60+ ise tam puan, doğrusal
//   Ölü stok:      25 puan → ölü stok / bağlı sermaye oranı %50+ ise 0
//   Acil sipariş:  10 puan → her acil ürün −1
//   Likidasyon:    15 puan → her aday −0,5

export type ScoreTone = "ok" | "info" | "warn" | "danger";
export type CapitalScore = { total: number; roi: number; dead: number; urgent: number; liquidation: number; label: string; tone: ScoreTone };

export function capitalScore(i: { annualRoiPct: number; deadRatio: number; urgentCount: number; liquidationCount: number }): CapitalScore {
  const roi = Math.min(50, Math.max(0, (i.annualRoiPct / 60) * 50));
  const dead = Math.max(0, (1 - Math.min(1, Math.max(0, i.deadRatio) * 2)) * 25);
  const urgent = Math.max(0, 10 - i.urgentCount);
  const liquidation = Math.max(0, 15 - i.liquidationCount * 0.5);
  const total = Math.round(roi + dead + urgent + liquidation);
  const tone: ScoreTone = total >= 75 ? "ok" : total >= 55 ? "info" : total >= 35 ? "warn" : "danger";
  const label = total >= 75 ? "Mükemmel" : total >= 55 ? "İyi" : total >= 35 ? "Dikkat" : "Kritik";
  return { total, roi, dead, urgent, liquidation, label, tone };
}

/** Serbest sermaye: toplam (ayar) − stokta bağlı; rezerv serbest kısmın yüzdesidir (eski Yönetici Paneli toplamın
 *  yüzdesini alıyordu — aynı kavram iki sayfada iki farklı sayı veriyordu; tek kural bu). */
export function freeCapital(totalTry: number, lockedTry: number, reservePct: number) {
  const available = Math.max(0, totalTry - lockedTry);
  const reserve = available * (reservePct / 100);
  return { total: totalTry, locked: lockedTry, available, reserve, deployable: Math.max(0, available - reserve) };
}
