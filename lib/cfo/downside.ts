// AŞAĞI YÖN SENARYOLARI — nakit dibi şoklara ne kadar dayanır? (SAF, deterministik; 2026-10-07 CFO yol haritası #6)
// Girdi: cfo_nakit_projeksiyon(120)'nin GÜNLÜK bileşenleri (defterdeki alacak, kanal hızından tahmini tahsilat, çıkış, kurla
// büyüyen çıkış = VERGI_GUMRUK) + başlangıç nakdi + kaynak katmanları (cfo_nakit_kapisi / cfo_kaynak_yeterliligi).
// Projeksiyonun bilinçli eksiği: eksi pozisyonun FİNANSMAN MALİYETİ (KMH faizi) yok. Burada her senaryoya eklenir; baz da dahil.
// KADEMELİ FAİZ (Cowork sırası #2, 2026-10-08): faiz YALNIZ KMH ile fonlanan kısma, hesap başına ÖLÇÜLMÜŞ oranla işler. Eksi
// pozisyon dilimlere sırayla dağıtılır: katman sırası genel → amaca bağlı (gümrük) → şahsi; katman içinde ölçülmüş oranlı limitler
// en ucuzdan pahalıya, sonra oranı ölçülmemişler. Oranı ölçülmemiş dilimin faizi UNKNOWN (uydurma/küresel oran yok; kullanılan
// TL·gün raporlanır, faiz toplamı o kısım için alt sınırdır). Tüm kapasiteyi aşan kısım fonlanamaz → faiz de işlemez.
// Nakit havuz kabul edilir (bir hesaptaki artı bakiye diğerinin eksisine sayılır).
// Şoklar parametriktir ve etiketlidir — olasılık iddiası yoktur; amaç "hangi şok bizi hangi kaynak katmanına iter, ne kadar pay
// var" sorusuna sayı vermektir. Ufuk dışına kayan tahsilat düşülür (temkinli).

export type DayFlow = {
  date: string;
  /** cfo_receivable açık kayıtları (satış gerçekleşmiş, ödeme bekleniyor) */
  ledgerIn: number;
  /** kanal ödeme temposundan tahmini tahsilat (gelecek satış) */
  forecastIn: number;
  /** tüm planlı çıkışlar (fxOut dahil) */
  out: number;
  /** kurla TL karşılığı büyüyen çıkış (gümrük vergisi: USD CIF × kur) */
  fxOut: number;
};
export type Shock = {
  /** tahmini tahsilat çarpanı (0,8 = ciro −%20); defterdeki alacak satılmış maldır, çarpılmaz */
  revenueFactor: number;
  /** tüm tahsilatların gecikmesi (gün) — pazar yeri hakediş gecikmesi */
  payoutDelayDays: number;
  /** USD/TRY artışı (0,15 = +%15) → fxOut × (1 + fxUp) */
  fxUp: number;
  /** KMH aylık faiz artışı (0,01 = +1 puan/ay) */
  rateUpMonthly: number;
};
export const NO_SHOCK: Shock = { revenueFactor: 1, payoutDelayDays: 0, fxUp: 0, rateUpMonthly: 0 };

export type Resources = {
  /** her işe kullanılabilir boş KMH */
  generalTry: number;
  /** yalnız gümrük ödemesinde açılan amaca bağlı limit */
  customsTry: number;
  /** şahsi KMH — son çare, KKDF+BSMV ile pahalı; bilinmiyorsa null */
  personalTry: number | null;
};
export type Tier = "GENERAL" | "CUSTOMS" | "PERSONAL" | "UNFUNDED";
export const TIER_LABEL: Record<Tier, string> = {
  GENERAL: "genel KMH yetiyor", CUSTOMS: "gümrük limiti gerekiyor", PERSONAL: "şahsi hesaplar gerekiyor (son çare)", UNFUNDED: "FONLANAMIYOR",
};

/** Tek KMH dilimi (bir hesabın limiti). monthlyRate ondalık (0,0425 = %4,25/ay); null = ölçülmedi (UNKNOWN). */
export type KmhSlice = { name: string; tier: Exclude<Tier, "UNFUNDED">; limitTry: number; monthlyRate: number | null };
/** Faiz girdisi: dilim listesi (kademeli) ya da tek oran (kapasite sınırsız, eski/teşhis kullanımı; 0 = faizsiz projeksiyon). */
export type KmhRates = KmhSlice[] | number;

const TIER_ORDER: Record<KmhSlice["tier"], number> = { GENERAL: 0, CUSTOMS: 1, PERSONAL: 2 };
/** Çekiliş sırası: katman, sonra ölçülmüş oran (ucuzdan), sonra ölçülmemiş; eşitlikte ad (deterministik). */
export function orderSlices(slices: KmhSlice[]): KmhSlice[] {
  return slices.filter(s => s.limitTry > 0).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    || (a.monthlyRate == null ? 1 : 0) - (b.monthlyRate == null ? 1 : 0)
    || (a.monthlyRate ?? 0) - (b.monthlyRate ?? 0) || a.name.localeCompare(b.name, "tr"));
}

export type SliceUse = { name: string; tier: KmhSlice["tier"]; limitTry: number; monthlyRate: number | null; peakDrawTry: number; drawTryDays: number;
  /** null = oran ölçülmedi */ interestTry: number | null };

export type SimResult = {
  minPosition: number; minDate: string;
  /** ufuk boyunca KMH faizi (TL) — yalnız oranı ölçülmüş dilimler; ölçülmemiş dilim kullanıldıysa alt sınır */
  carryCostTry: number;
  /** oranı ölçülmemiş dilimlerden çekilen TL·gün (0 değilse faiz eksik) */
  unknownRateTryDays: number;
  /** tüm KMH kapasitesini aşan TL·gün (fonlanamaz, faizsiz) */
  beyondCapacityTryDays: number;
  slices: SliceUse[];
  /** pozisyonun genel KMH'yi ilk aştığı gün */
  firstBeyondGeneral: string | null;
  endPosition: number;
};

export function simulate(days: DayFlow[], startCash: number, shock: Shock, kmh: KmhRates, res: Resources | null = null): SimResult {
  const n = days.length;
  const inflow = new Array<number>(n).fill(0);
  days.forEach((d, i) => {
    const j = i + shock.payoutDelayDays;
    if (j < n) inflow[j] += d.ledgerIn + d.forecastIn * shock.revenueFactor;
  });
  const slices = typeof kmh === "number" ? [{ name: "KMH", tier: "GENERAL" as const, limitTry: Infinity, monthlyRate: kmh }] : orderSlices(kmh);
  const use = slices.map(sl => ({ ...sl, peakDrawTry: 0, drawTryDays: 0, interest: 0,
    daily: sl.monthlyRate == null ? null : Math.max(0, sl.monthlyRate + shock.rateUpMonthly) / 30 }));
  let pos = startCash, carry = 0, unknownDays = 0, beyond = 0, minPos = Infinity, minDate = days[0]?.date ?? "", first: string | null = null;
  days.forEach((d, i) => {
    pos += inflow[i] - (d.out + d.fxOut * shock.fxUp);
    if (pos < 0) {
      let left = -pos, c = 0;
      for (const u of use) {
        if (left <= 0) break;
        const p = Math.min(left, u.limitTry); left -= p;
        u.drawTryDays += p; if (p > u.peakDrawTry) u.peakDrawTry = p;
        if (u.daily == null) unknownDays += p; else { const ci = p * u.daily; u.interest += ci; c += ci; }
      }
      beyond += left; carry += c; pos -= c;
    }
    if (pos < minPos) { minPos = pos; minDate = d.date; }
    if (first == null && res && -pos > res.generalTry) first = d.date;
  });
  if (!n) minPos = startCash;
  return { minPosition: Math.round(minPos), minDate, carryCostTry: Math.round(carry), unknownRateTryDays: Math.round(unknownDays),
    beyondCapacityTryDays: Math.round(beyond),
    slices: use.map(u => ({ name: u.name, tier: u.tier, limitTry: u.limitTry, monthlyRate: u.monthlyRate, peakDrawTry: Math.round(u.peakDrawTry),
      drawTryDays: Math.round(u.drawTryDays), interestTry: u.daily == null ? null : Math.round(u.interest) })),
    firstBeyondGeneral: first, endPosition: Math.round(pos) };
}

export function tierOf(minPosition: number, r: Resources): { tier: Tier; shortfallTry: number; headroomTry: number | null } {
  const need = Math.max(0, -minPosition);
  const all = r.generalTry + r.customsTry + (r.personalTry ?? 0);
  const tier: Tier = need <= r.generalTry ? "GENERAL" : need <= r.generalTry + r.customsTry ? "CUSTOMS"
    : r.personalTry != null && need <= all ? "PERSONAL" : "UNFUNDED";
  return { tier, shortfallTry: Math.round(Math.max(0, need - all)), headroomTry: r.personalTry == null && tier === "UNFUNDED" ? null : Math.round(all - need) };
}

export type Scenario = { key: string; label: string; shock: Shock };
/** Tekil şoklar standart büyüklükte; "Makul stres" hepsinin yarısı aynı anda (tahsis planı bunu kullanır). */
export const SCENARIOS: Scenario[] = [
  { key: "base", label: "Baz (KMH faizi dahil)", shock: NO_SHOCK },
  { key: "revenue-20", label: "Ciro −%20 (gelecek satış tahsilatı)", shock: { ...NO_SHOCK, revenueFactor: 0.8 } },
  { key: "payout-14", label: "Hakediş 14 gün gecikir", shock: { ...NO_SHOCK, payoutDelayDays: 14 } },
  { key: "fx-15", label: "Kur +%15 (gümrük vergisi)", shock: { ...NO_SHOCK, fxUp: 0.15 } },
  { key: "rate-1", label: "KMH faizi +1 puan/ay (ölçülmüş dilimler)", shock: { ...NO_SHOCK, rateUpMonthly: 0.01 } },
  { key: "stress", label: "Makul stres (ciro −%10, 7 gün gecikme, kur +%10, faiz +0,5 puan)", shock: { revenueFactor: 0.9, payoutDelayDays: 7, fxUp: 0.1, rateUpMonthly: 0.005 } },
  { key: "severe", label: "Ağır stres (tekil şokların hepsi birden)", shock: { revenueFactor: 0.8, payoutDelayDays: 14, fxUp: 0.15, rateUpMonthly: 0.01 } },
];

export type ScenarioResult = Scenario & SimResult & { deltaVsBaseTry: number; tier: Tier; shortfallTry: number; headroomTry: number | null };
export type Downside = {
  /** projeksiyonun kendi dibi (faizsiz) — cfo_nakit_projeksiyon ile aynı */
  projectionMin: { position: number; date: string };
  scenarios: ScenarioResult[];
  /** tekil şoklar zarar büyüklüğüne göre (en çok hangi şoka karşı korunmalı) */
  sensitivity: { key: string; label: string; deltaVsBaseTry: number }[];
  /** emniyet payı: tüm kaynaklarla (şahsi dahil) fonlanabilir kalan en büyük şok */
  tolerance: { maxRevenueDropPct: number | null; maxPayoutDelayDays: number | null; maxFxUpPct: number | null };
  stress: ScenarioResult;
};

/** f(x) fonlanabilir mi? x ∈ [lo, hi] üzerinde monoton varsayımıyla en büyük fonlanabilir x. Baz bile fonlanamıyorsa null. */
function maxTolerable(ok: (x: number) => boolean, lo: number, hi: number, integer = false): number | null {
  if (!ok(lo)) return null;
  if (ok(hi)) return hi;
  let a = lo, b = hi;
  for (let i = 0; i < 40 && b - a > (integer ? 1 : 1e-4); i++) {
    const m = integer ? Math.floor((a + b) / 2) : (a + b) / 2;
    if (ok(m)) a = m; else b = m;
  }
  return a;
}

export function runDownside(days: DayFlow[], startCash: number, res: Resources, kmh: KmhRates): Downside {
  const proj = simulate(days, startCash, NO_SHOCK, 0);
  const sims = SCENARIOS.map(s => ({ ...s, ...simulate(days, startCash, s.shock, kmh, res) }));
  const base = sims[0];
  const scenarios: ScenarioResult[] = sims.map(s => ({ ...s, deltaVsBaseTry: s.minPosition - base.minPosition, ...tierOf(s.minPosition, res) }));
  const funded = (sh: Shock) => tierOf(simulate(days, startCash, sh, kmh).minPosition, res).tier !== "UNFUNDED";
  const drop = maxTolerable(x => funded({ ...NO_SHOCK, revenueFactor: 1 - x }), 0, 1);
  const delay = maxTolerable(x => funded({ ...NO_SHOCK, payoutDelayDays: x }), 0, 60, true);
  const fx = maxTolerable(x => funded({ ...NO_SHOCK, fxUp: x }), 0, 2);
  return {
    projectionMin: { position: proj.minPosition, date: proj.minDate },
    scenarios,
    sensitivity: scenarios.filter(s => !["base", "stress", "severe"].includes(s.key)).map(s => ({ key: s.key, label: s.label, deltaVsBaseTry: s.deltaVsBaseTry }))
      .sort((a, b) => a.deltaVsBaseTry - b.deltaVsBaseTry),
    tolerance: { maxRevenueDropPct: drop == null ? null : Math.round(drop * 1000) / 10, maxPayoutDelayDays: delay, maxFxUpPct: fx == null ? null : Math.round(fx * 1000) / 10 },
    stress: scenarios.find(s => s.key === "stress")!,
  };
}

/** Tahsis için stres likidite açığı: makul streste dip, Goal Engine tabanının ne kadar altında (TL, ≥ 0). */
export function stressGapTry(d: Downside, floorTry: number): number {
  return Math.max(0, Math.round(floorTry - d.stress.minPosition));
}
