/**
 * lib/sales-forecast.ts — Aylık satış tahmin motoru
 *
 * Önceki davranış (Phase 90 ve öncesi):
 *   effectiveMonthlyUnits = max(trendyol_son_30g, kullanıcı_aylık_potansiyel)
 *
 * Eksiklikleri:
 *   - Sadece Trendyol son 30g — diğer 13 kanal yok sayılıyordu
 *   - 30g pencere — yeni gelen ya da o ay yavaş olan ürün düşük tahmin edilir
 *   - Mevsimsellik dikkate alınmıyordu (klima yazın, ısıtıcı kışın)
 *
 * Yeni motor (Phase 92):
 *   1. Tüm kanallardan (MarketplaceSalesRecord + TrendyolSalesRecord +
 *      HepsiburadaSalesRecord) iptal/iade hariç aylık bucket'lar
 *   2. Bileşenler:
 *        - last30dUnits          → son 30g toplamı (= aylık tahmin)
 *        - last90dMonthly        → son 90g / 3
 *        - last365dMonthly       → son 365g / 12
 *        - lifetimeMonthly       → toplam / aktif ay sayısı
 *   3. Recency-weighted blend = 90d×0.50 + 365d×0.30 + lifetime×0.20
 *   4. Mevsimsel düzeltme: bulunulan ayın yıllık ortalamaya oranı (0.5..2.0 arasında clamp)
 *   5. Sonuç = max(last30dUnits, blend × seasonalMultiplier)
 *
 * Caller'lar `max(forecast.monthlyUnits, product.onlineSalesPotential)`
 * formülünü kullanır — sistem tahmini ile kullanıcının manuel girdiği değerden
 * büyük olanı seçer.
 */

export interface ForecastComponents {
  last30dUnits: number;
  last90dMonthly: number;
  last365dMonthly: number;
  lifetimeMonthly: number;
  seasonalMultiplier: number;
  blendSeasonal: number;
  monthsActive: number;
  totalLifetimeUnits: number;
}

export interface SalesForecast {
  monthlyUnits: number;
  components: ForecastComponents;
  formula: string; // hangi bileşen kazandı: "last30d" | "blend+seasonal" | "no-data"
}

/**
 * "YYYY-MM" formatında bir ay anahtarını mid-month Date'e çevirir.
 */
function monthKeyToDate(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15));
}

/**
 * Aktif ay sayısı (firstMonth ile now arasındaki ay sayısı, min 1).
 */
function monthsBetween(start: Date, end: Date): number {
  return Math.max(
    1,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()) +
      1,
  );
}

/**
 * Bulunulan ayın yıllık ortalamaya oranı. Yeterli veri yoksa 1.0.
 * Clamp [0.5, 2.0] — sparse data'da uç değerlerden korunur.
 */
function computeSeasonalMultiplier(
  monthlySales: Map<string, number>,
  now: Date,
): number {
  const currentMonth = now.getUTCMonth(); // 0-11

  // Aynı takvim ayındaki tüm geçmiş yılların toplam ve ortalaması
  const sumByMonth: number[] = Array(12).fill(0);
  const countByMonth: number[] = Array(12).fill(0);
  for (const [key, units] of monthlySales) {
    const m = parseInt(key.slice(5, 7), 10) - 1; // 0-11
    if (m < 0 || m > 11) continue;
    sumByMonth[m] += units;
    countByMonth[m]++;
  }

  // En az 2 yıllık veri olmadan mevsimsellik tahmini güvensiz
  const totalCount = countByMonth.reduce((s, v) => s + v, 0);
  if (totalCount < 12 || countByMonth[currentMonth] === 0) return 1.0;

  const currentAvg = sumByMonth[currentMonth] / countByMonth[currentMonth];
  const overallAvg =
    sumByMonth.reduce((s, v) => s + v, 0) /
    countByMonth.reduce((s, v) => s + v, 0);

  if (overallAvg <= 0) return 1.0;
  const ratio = currentAvg / overallAvg;
  return Math.max(0.5, Math.min(2.0, ratio));
}

/**
 * Bir ürün için aylık satış tahminini hesaplar.
 *
 * @param monthlySales  "YYYY-MM" → adet (iptal/iade hariç tüm kanallar)
 * @param now           referans tarihi (test edilebilirlik için override edilebilir)
 */
export function forecastMonthlySales(
  monthlySales: Map<string, number>,
  now: Date = new Date(),
): SalesForecast {
  if (monthlySales.size === 0) {
    return {
      monthlyUnits: 0,
      components: {
        last30dUnits: 0,
        last90dMonthly: 0,
        last365dMonthly: 0,
        lifetimeMonthly: 0,
        seasonalMultiplier: 1.0,
        blendSeasonal: 0,
        monthsActive: 0,
        totalLifetimeUnits: 0,
      },
      formula: "no-data",
    };
  }

  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const cutoff365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  let units30 = 0;
  let units90 = 0;
  let units365 = 0;
  let unitsLifetime = 0;
  let monthsActive = 0;
  let firstMonth: Date | null = null;

  for (const [key, units] of monthlySales) {
    if (units <= 0) continue;
    const monthDate = monthKeyToDate(key);
    unitsLifetime += units;
    monthsActive++;
    if (!firstMonth || monthDate < firstMonth) firstMonth = monthDate;
    if (monthDate >= cutoff30) units30 += units;
    if (monthDate >= cutoff90) units90 += units;
    if (monthDate >= cutoff365) units365 += units;
  }

  // Pencere bazlı aylık tahminler
  const last30dUnits = units30;
  const last90dMonthly = units90 / 3;
  const last365dMonthly = units365 / 12;
  const lifetimeMonthly = firstMonth
    ? unitsLifetime / monthsBetween(firstMonth, now)
    : 0;

  // Recency-weighted blend (90d ağırlığı en yüksek, lifetime sadece smoothing)
  const blend =
    last90dMonthly * 0.5 + last365dMonthly * 0.3 + lifetimeMonthly * 0.2;

  // Mevsimsel düzeltme
  const seasonalMultiplier = computeSeasonalMultiplier(monthlySales, now);
  const blendSeasonal = blend * seasonalMultiplier;

  // Sonuç = max(son 30g, blend×seasonal)
  let monthlyUnits: number;
  let formula: string;
  if (last30dUnits >= blendSeasonal) {
    monthlyUnits = last30dUnits;
    formula = "last30d";
  } else {
    monthlyUnits = blendSeasonal;
    formula = "blend+seasonal";
  }

  return {
    monthlyUnits: Math.round(monthlyUnits),
    components: {
      last30dUnits,
      last90dMonthly,
      last365dMonthly,
      lifetimeMonthly,
      seasonalMultiplier,
      blendSeasonal,
      monthsActive,
      totalLifetimeUnits: unitsLifetime,
    },
    formula,
  };
}

/**
 * Helper: çoklu ürün için DB'den yüklenen flat ([productId, month, units])
 * satırlarını Map<productId, Map<monthKey, units>> yapısına dönüştürür.
 */
export function buildMonthlySalesMap(
  rows: Array<{ productId: string; month: Date; units: number | bigint }>,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = r.month.toISOString().slice(0, 7); // "YYYY-MM"
    let m = result.get(r.productId);
    if (!m) {
      m = new Map();
      result.set(r.productId, m);
    }
    m.set(key, (m.get(key) ?? 0) + Number(r.units));
  }
  return result;
}

/**
 * Sistem tahmini ile kullanıcının manuel girdiği aylık satış potansiyelinden
 * büyük olanı döndürür. Bu, ithalat kararlarında kullanılan "effective" sinyaldir.
 */
export function effectiveMonthlyUnits(
  forecast: SalesForecast,
  manualOnlineSalesPotential: number | null,
): number {
  const manual = manualOnlineSalesPotential ?? 0;
  return Math.max(forecast.monthlyUnits, manual);
}
