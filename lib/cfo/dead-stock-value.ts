// ÖLÜ STOK TL DEĞERİ — tek kural (CFO-020 kalan, 2026-10-10). `cfo_olu_stok.bagli_sermaye` iki ayrı esasla dolar (`deger_kaynagi`):
//   • MALIYET            → stok × birim maliyet (bağlı sermaye; net sermaye/stok değeri ile aynı esas),
//   • GERCEKLESEN_SATIS  → maliyet yok, stok × gerçekleşen ortalama satış fiyatı (KDV + marj dahil — sermaye DEĞİL, satış değeri).
// Üretim 10.10: 95 SKU = 27 maliyetli (122.172 TL) + 68 maliyetsiz (2.020.039 TL satış değeri). Sayfa "Bağlı sermaye 2,14M" diyordu,
// /admin/sermaye bu toplamı maliyet esaslı bağlı sermayeye bölüyordu (iki esas karışık); motor (snapshot) maliyetsiz satırları UNKNOWN sayıyordu.
// Kural: ölü stok TL = YALNIZ maliyet esaslı satırlar; maliyetsiz satırlar sayıyla + satış değeriyle AYRI gösterilir, toplama girmez.
export const COST_BASIS = "MALIYET";

export type DeadValueRow = { bagli_sermaye: unknown; deger_kaynagi: string | null };
export type DeadStockValue = { costTry: number; costSku: number; unknownCostSku: number; saleValueTry: number };

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function isCostBasis(r: DeadValueRow): boolean {
  return r.deger_kaynagi === COST_BASIS && num(r.bagli_sermaye) != null;
}

/** Maliyet esaslı TL (bağlı sermaye) — maliyetsiz satırlar sayılır ama TL'ye girmez. */
export function deadStockValue(rows: DeadValueRow[]): DeadStockValue {
  const out: DeadStockValue = { costTry: 0, costSku: 0, unknownCostSku: 0, saleValueTry: 0 };
  for (const r of rows) {
    if (isCostBasis(r)) { out.costTry += num(r.bagli_sermaye)!; out.costSku++; }
    else { out.unknownCostSku++; out.saleValueTry += num(r.bagli_sermaye) ?? 0; }
  }
  out.costTry = Math.round(out.costTry * 100) / 100;
  out.saleValueTry = Math.round(out.saleValueTry * 100) / 100;
  return out;
}
