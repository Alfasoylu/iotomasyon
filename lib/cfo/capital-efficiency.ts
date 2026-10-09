// Sermaye verimliliği + marjinal tahsis — SAF, deterministik (2026-10-07, "her 1 TL en verimli nerede?").
// LLM yok: sınıflandırma, eşik getiri (hurdle), fazla stok, tasfiye eşiği ve tahsis sırası burada hesaplanır; AI CFO yalnız
// sonuçları kanıt olarak görür. Girdiler veri kaynağından (cfo_stok_deger, cfo_loan, cfo_bank_account, cfo_settings, nakit dibi);
// ölçülemeyen her şey UNKNOWN kalır, uydurulmaz.
//
// Çekirdek fikir: borcun marjinal maliyeti (en pahalı kapatılabilir borcun aylık faizi) her TL'nin geçmesi gereken eşiktir.
// Stokta duran 1 TL ayda eşikten az kazandırıyorsa, o TL'yi borç kapatmaya ya da eşiği aşan ürüne taşımak şirketi zenginleştirir.

export type CapClass = "SCALE" | "KEEP" | "TRIM" | "FIX_PRICE" | "LIQUIDATE" | "UNKNOWN";

export type SkuInput = {
  id: string; sku: string; name: string; stock: number;
  /** birim maliyet (TL) — yoksa UNKNOWN */
  unitCost: number | null;
  /** birim net gerçekleşebilir değer (son 90 gün satış fiyatı × kanal net oranı − kargo); satış yoksa null */
  unitNet: number | null;
  /** son 90 gün günlük satış hızı (adet/gün) */
  dailyVelocity: number;
};
export type DebtInput = {
  name: string; kind: "LOAN" | "KMH" | "CARD";
  /** kapatmak için gereken tutar (erken kapama dahil) */
  payoffTry: number;
  /** aylık faiz (ondalık: 0,043 = %4,3); bilinmiyorsa null */
  monthlyRate: number | null;
  /** aylık taksit (kapatılınca serbest kalan nakit akışı) */
  monthlyPaymentTry: number | null;
  personal?: boolean;
};
export type Params = {
  /** hedef stok örtüsü (gün): tedarik süresi + emniyet */
  targetCoverDays: number;
  /** tasfiye indiriminin üst sınırı (marka/kanal riski) */
  maxDiscount: number;
  /** SCALE için eşik getirinin katı */
  scaleMultiple: number;
};
export const DEFAULT_PARAMS: Params = { targetCoverDays: 97, maxDiscount: 0.5, scaleMultiple: 2 };

export type SkuResult = SkuInput & {
  cls: CapClass; capitalTry: number; unitMargin: number | null; monthlyContributionTry: number | null;
  /** aylık sermaye getirisi (katkı / bağlı sermaye) */
  rocMonthly: number | null; coverDays: number | null;
  excessUnits: number; excessCapitalTry: number;
  /** eşik getiriye göre aylık değer kaybı (eşik × sermaye − katkı), yalnız eşik altındaysa */
  dragMonthlyTry: number;
  /** tasfiyenin elde tutmaya eşit olduğu en yüksek indirim (net değerin oranı) */
  breakEvenDiscount: number | null;
  /** fazlanın break-even indirimle satılması halinde açığa çıkan nakit */
  releaseCashTry: number;
  /** SCALE: bir sonraki TL'nin aylık marjinal getirisi; hedef örtüye tamamlamak için gereken sermaye */
  marginalReturnMonthly: number | null; restockCapitalTry: number;
  reason: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Marjinal borç maliyeti: kapatılabilir (şahsi olmayan, faizi bilinen) en pahalı borcun aylık faizi. */
export function hurdleRate(debts: DebtInput[]): { monthly: number | null; source: string | null } {
  const c = debts.filter(d => !d.personal && d.monthlyRate != null && d.monthlyRate > 0 && d.payoffTry > 0)
    .sort((a, b) => (b.monthlyRate! - a.monthlyRate!));
  return c.length ? { monthly: c[0].monthlyRate!, source: c[0].name } : { monthly: null, source: null };
}

/** `hurdle` null = eşik faiz BİLİNMİYOR (faizi ölçülmüş kapatılabilir borç yok): eşiğe dayanan sınıf (SCALE/TRIM/KEEP), taşıma maliyeti
 *  ve tasfiye eşiği hesaplanmaz — varsayılan oran uydurulmaz (CFO-014). Eşikten bağımsız FIX_PRICE / LIQUIDATE yine verilir. */
export function classifySku(s: SkuInput, hurdle: number | null, p: Params = DEFAULT_PARAMS): SkuResult {
  const capital = s.unitCost != null && s.unitCost > 0 ? s.stock * s.unitCost : 0;
  const base = { ...s, capitalTry: capital, unitMargin: null, monthlyContributionTry: null, rocMonthly: null, coverDays: null, excessUnits: 0,
    excessCapitalTry: 0, dragMonthlyTry: 0, breakEvenDiscount: null, releaseCashTry: 0, marginalReturnMonthly: null, restockCapitalTry: 0 };
  if (s.unitCost == null || s.unitCost <= 0) return { ...base, cls: "UNKNOWN", reason: "birim maliyet yok" };
  const v = Math.max(0, s.dailyVelocity);
  const coverDays = v > 0 ? s.stock / v : null;
  const targetUnits = v * p.targetCoverDays;
  const excessUnits = Math.max(0, Math.floor(s.stock - targetUnits));
  const excessCapital = excessUnits * s.unitCost;
  if (s.unitNet == null) {
    // Satış kanıtı yok: değer bilinmiyor ama sermaye bağlı. 90 günde hiç satış yoksa ölü sayılır.
    const dead = v === 0 && s.stock > 0;
    return { ...base, coverDays, excessUnits: dead ? s.stock : excessUnits, excessCapitalTry: dead ? capital : excessCapital,
      dragMonthlyTry: dead && hurdle != null ? r2(capital * hurdle) : 0, cls: dead ? "LIQUIDATE" : "UNKNOWN",
      reason: dead ? "90 günde satış yok, satış fiyatı kanıtı yok" : "satış fiyatı kanıtı yok" };
  }
  const unitMargin = s.unitNet - s.unitCost;
  const contribution = unitMargin * v * 30;
  const roc = capital > 0 ? contribution / capital : null;
  const drag = hurdle != null && roc != null && roc < hurdle ? Math.max(0, capital * hurdle - contribution) : 0;
  // Tasfiye eşiği: fazla stok doğrusal satılırsa ortalama bekleme T = (fazla örtü)/2 ay; elde tutmanın bugünkü değeri
  // 1/(1+h)^T. Bundan daha az indirim tasfiyeyi elde tutmaktan iyi yapar (yalnız finansman maliyeti; değer kaybı hariç → tutucu).
  const excessMonths = v > 0 ? excessUnits / v / 30 : Infinity;
  const T = excessMonths / 2;
  const be = excessUnits > 0 ? (!Number.isFinite(T) ? 1 : hurdle == null ? null : 1 - 1 / Math.pow(1 + hurdle, T)) : null;
  // Eşik bilinmiyorsa serbest kalacak nakit en kötü indirimle (tutucu) hesaplanır
  const disc = excessUnits > 0 && be == null ? p.maxDiscount : be == null ? 0 : Math.min(be, p.maxDiscount);
  const release = excessUnits > 0 ? Math.max(0, excessUnits * s.unitNet * (1 - disc)) : 0;
  const common = { ...base, unitMargin: r2(unitMargin), monthlyContributionTry: r2(contribution), rocMonthly: roc, coverDays, excessUnits,
    excessCapitalTry: r2(excessCapital), dragMonthlyTry: r2(drag), breakEvenDiscount: be == null ? null : r2(Math.min(be, 1)), releaseCashTry: r2(release) };

  if (unitMargin < 0 && v > 0) return { ...common, cls: "FIX_PRICE", reason: `her satış ${r2(-unitMargin)} TL zarar (net ${r2(s.unitNet)} < maliyet ${r2(s.unitCost)})` };
  if (v * 30 < 1 && s.stock > 0) return { ...common, excessUnits: s.stock, excessCapitalTry: r2(capital), cls: "LIQUIDATE",
    releaseCashTry: r2(s.stock * s.unitNet * (1 - p.maxDiscount)), breakEvenDiscount: 1, reason: `ayda <1 satış, ${s.stock} adet duruyor` };
  const marginal = (unitMargin / s.unitCost) * (30 / p.targetCoverDays);
  if (hurdle == null) return { ...common, cls: "UNKNOWN", reason: "eşik faiz bilinmiyor (faizi ölçülmüş kapatılabilir borç yok) — büyüt/azalt kararı verilmez" };
  if (roc != null && roc >= hurdle * p.scaleMultiple && (coverDays ?? Infinity) < p.targetCoverDays) {
    const need = Math.max(0, Math.ceil(targetUnits - s.stock));
    return { ...common, cls: "SCALE", marginalReturnMonthly: marginal, restockCapitalTry: r2(need * s.unitCost),
      reason: `aylık getiri %${r2(roc * 100)} ≥ eşiğin ${p.scaleMultiple} katı, örtü ${Math.round(coverDays ?? 0)} gün < hedef ${p.targetCoverDays}` };
  }
  if (excessUnits > 0 && roc != null && roc < hurdle) return { ...common, cls: "TRIM",
    reason: `aylık getiri %${r2(roc * 100)} < eşik %${r2(hurdle * 100)}, ${excessUnits} adet hedef örtünün üstünde` };
  return { ...common, cls: "KEEP", marginalReturnMonthly: marginal, reason: roc != null && roc >= hurdle ? "eşiğin üstünde" : "eşiğin altında ama fazla stok yok" };
}

export type Use = {
  kind: "LIQUIDITY" | "RESTOCK" | "DEBT_PAYOFF";
  label: string; capitalTry: number;
  /** aylık beklenen getiri (ondalık); likidite için null (zorunluluk) */
  returnMonthly: number | null; confidence: number;
  riskAdjusted: number; goal: { debtTry: number; netCapitalMonthlyTry: number; revenueMonthlyTry: number };
  downside: string;
};
export type Allocation = {
  hurdleMonthly: number | null; hurdleSource: string | null;
  portfolio: Record<CapClass, { n: number; capitalTry: number; contributionMonthlyTry: number; dragMonthlyTry: number; releaseCashTry: number }>;
  dragMonthlyTry: number; releasableCashTry: number;
  uses: Use[];
  /** bir sonraki `budget` TL'nin önerilen dağılımı (sıralı, açgözlü) */
  plan: { use: Use; amountTry: number }[];
};

/**
 * Marjinal tahsis: önce likidite açığı (zorunlu), sonra risk ayarlı getiriye göre stok yenileme ve borç kapama.
 * Borç kapama getirisi kesin (güven 1); stok yenileme getirisi 90 günlük satış hızına dayanır (güven 0,6) ve talep sınırlıdır.
 */
export function allocate(skus: SkuInput[], debts: DebtInput[], opts: { liquidityGapTry: number; budgetTry: number; unitPriceBySku?: Map<string, number>; stressGapTry?: number }, p: Params = DEFAULT_PARAMS): Allocation & { skus: SkuResult[] } {
  const h = hurdleRate(debts);
  const hurdle = h.monthly;
  const res = skus.map(s => classifySku(s, hurdle, p));
  const classes: CapClass[] = ["SCALE", "KEEP", "TRIM", "FIX_PRICE", "LIQUIDATE", "UNKNOWN"];
  const portfolio = Object.fromEntries(classes.map(c => {
    const xs = res.filter(r => r.cls === c);
    return [c, { n: xs.length, capitalTry: r2(xs.reduce((s, r) => s + r.capitalTry, 0)), contributionMonthlyTry: r2(xs.reduce((s, r) => s + (r.monthlyContributionTry ?? 0), 0)),
      dragMonthlyTry: r2(xs.reduce((s, r) => s + r.dragMonthlyTry, 0)), releaseCashTry: r2(xs.reduce((s, r) => s + r.releaseCashTry, 0)) }];
  })) as Allocation["portfolio"];

  const uses: Use[] = [];
  // Likidite önce; açık, baz (Goal Engine tabanı) ile makul stres senaryosunun (lib/cfo/downside.ts) büyüğü → nakit tüketen her
  // kullanım (stok tamamlama, borç kapama) önce stres dibini tabana çekecek nakit ayrıldıktan sonra sıraya girer.
  const stress = Math.max(0, opts.stressGapTry ?? 0);
  const liq = Math.max(opts.liquidityGapTry, stress);
  if (liq > 0) uses.push({ kind: "LIQUIDITY", label: stress > opts.liquidityGapTry
      ? `makul streste nakit dibi tabanın ${Math.round(stress)} TL altında (baz ${Math.round(opts.liquidityGapTry)}) — önce açığı kapat`
      : "nakit dibi tabanın altında — önce açığı kapat", capitalTry: r2(liq),
    returnMonthly: null, confidence: 1, riskAdjusted: Infinity, goal: { debtTry: 0, netCapitalMonthlyTry: 0, revenueMonthlyTry: 0 }, downside: "kapanmazsa ödeme aksar / pahalı KMH" });
  for (const r of res.filter(x => x.cls === "SCALE" && x.restockCapitalTry > 0 && x.marginalReturnMonthly != null)) {
    const conf = 0.6;
    const price = opts.unitPriceBySku?.get(r.sku) ?? r.unitNet ?? 0;
    uses.push({ kind: "RESTOCK", label: `${r.sku} stok tamamla (${Math.round(r.restockCapitalTry / (r.unitCost ?? 1))} adet)`, capitalTry: r.restockCapitalTry,
      returnMonthly: r.marginalReturnMonthly, confidence: conf, riskAdjusted: r.marginalReturnMonthly! * conf,
      goal: { debtTry: 0, netCapitalMonthlyTry: r2(r.restockCapitalTry * r.marginalReturnMonthly!), revenueMonthlyTry: r2(r.dailyVelocity * 30 * price) },
      downside: "talep düşerse sermaye bağlanır; tedarik süresi boyunca nakit çıkışı" });
  }
  for (const d of debts.filter(x => !x.personal && x.monthlyRate != null && x.monthlyRate > 0 && x.payoffTry > 0 && (x.kind === "LOAN" || x.kind === "CARD"))) {
    uses.push({ kind: "DEBT_PAYOFF", label: d.kind === "CARD" ? `${d.name} devreden bakiyesini kapat` : `${d.name} kapat`, capitalTry: r2(d.payoffTry), returnMonthly: d.monthlyRate, confidence: 1, riskAdjusted: d.monthlyRate!,
      goal: { debtTry: -r2(d.payoffTry), netCapitalMonthlyTry: r2(d.payoffTry * d.monthlyRate!), revenueMonthlyTry: 0 },
      downside: d.kind === "CARD" ? "likidite azalır; kart limiti yeniden harcanabilir hâle gelir"
        : `likidite azalır; aylık taksit ${d.monthlyPaymentTry != null ? Math.round(d.monthlyPaymentTry) : "?"} TL serbest kalır` });
  }
  uses.sort((a, b) => b.riskAdjusted - a.riskAdjusted);

  const plan: Allocation["plan"] = [];
  let left = opts.budgetTry;
  for (const u of uses) {
    if (left <= 0) break;
    const amt = Math.min(left, u.capitalTry);
    if (amt <= 0) continue;
    plan.push({ use: u, amountTry: r2(amt) });
    left -= amt;
  }
  return { hurdleMonthly: h.monthly, hurdleSource: h.source, portfolio, dragMonthlyTry: r2(res.reduce((s, r) => s + r.dragMonthlyTry, 0)),
    releasableCashTry: r2(res.filter(r => r.cls === "TRIM" || r.cls === "LIQUIDATE").reduce((s, r) => s + r.releaseCashTry, 0)), uses, plan, skus: res };
}
