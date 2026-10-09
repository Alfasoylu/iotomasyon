// VALUE OF INFORMATION ENGINE — SAF, deterministik (2026-10-07, Alperen: "CFO yalnız sermayeyi değil, belirsizliği ve
// yöneticinin dikkatini de optimize etsin"). Her önemli UNKNOWN için: hangi kararı etkiliyor, karar değerinin değişebileceği
// TL aralığı, yaklaşık bilgi değeri (EVPI ≈ karar salınımı × kararın değişme olasılığı) ve eylem:
//   DECIDE_NOW     — bilgi değeri dikkat maliyetinin altında ya da karar aralığın her ucunda aynı → ihtiyatlı varsayımla karar ver, sorma
//   ASK_FIRST      — değer yüksek ve yalnız Alperen cevaplayabilir (banka bakiyesi, tedarikçi şartı, durum)
//   RESEARCH_FIRST — değer yüksek ve CFO veriden/araştırmadan kendisi çözebilir
// Değerler YAKLAŞIKTIR ve dayanakları (basis) yazılıdır; ölçülemeyen değer null kalır (sıralamada ölçülenlerin arkasında).

export type VoiAction = "DECIDE_NOW" | "ASK_FIRST" | "RESEARCH_FIRST";
export type Resolver = "OWNER" | "CFO";
export type VoiItem = {
  key: string; unknown: string; decision: string;
  /** kararın değerinin değişebileceği aralık (TL) */
  rangeLoTry: number; rangeHiTry: number;
  /** yaklaşık bilgi değeri (TL); ölçülemiyorsa null */
  voiTry: number | null;
  /** karar aralığın iki ucunda farklı mı? (false → bilgi kararı değiştirmez) */
  decisionFlips: boolean;
  basis: string; resolver: Resolver; action: VoiAction;
  questionId?: string; area?: string;
};
export type VoiParams = {
  /** yöneticiye bir soru sormanın dikkat maliyeti (TL karşılığı); bunun altındaki bilgi sorulmaz */
  askMinTry: number;
  /** ilk ekranda Alperen'e gösterilecek en çok soru */
  askBudget: number;
  /** karar ufku (ay): yanlış kararın sürdüğü varsayılan süre */
  horizonMonths: number;
};
export const DEFAULT_VOI_PARAMS: VoiParams = { askMinTry: 2000, askBudget: 5, horizonMonths: 3 };

const r0 = (v: number) => Math.round(v);

export function decideAction(voi: number | null, flips: boolean, resolver: Resolver, p: VoiParams = DEFAULT_VOI_PARAMS): VoiAction {
  if (!flips) return "DECIDE_NOW";
  if (voi == null) return resolver === "CFO" ? "RESEARCH_FIRST" : "ASK_FIRST";
  if (voi < p.askMinTry) return "DECIDE_NOW";
  return resolver === "CFO" ? "RESEARCH_FIRST" : "ASK_FIRST";
}

const item = (o: Omit<VoiItem, "action">, p: VoiParams): VoiItem => ({ ...o, action: decideAction(o.voiTry, o.decisionFlips, o.resolver, p) });

/** Maliyeti bilinmeyen stoklu SKU: maliyet, bilinen SKU'ların maliyet/net oranı dağılımının p25–p75 aralığında varsayılır.
 *  Sınıf (tut / erit / büyüt) iki uçta farklıysa salınım = aylık kayıp farkı × ufuk; olasılık 0,5. */
export function skuCostVoi(rows: { sku: string; stock: number; unitNet: number; dailyVelocity: number }[],
  ratio: { p25: number; p75: number }, classify: (unitCost: number, r: { sku: string; stock: number; unitNet: number; dailyVelocity: number }) => { cls: string; dragMonthlyTry: number; capitalTry: number },
  p: VoiParams = DEFAULT_VOI_PARAMS): VoiItem[] {
  return rows.map(r => {
    const lo = classify(r.unitNet * ratio.p25, r), hi = classify(r.unitNet * ratio.p75, r);
    const flips = lo.cls !== hi.cls;
    const swing = Math.abs(hi.dragMonthlyTry - lo.dragMonthlyTry) * p.horizonMonths;
    return item({ key: `sku-cost:${r.sku}`, unknown: `${r.sku} birim maliyeti`, decision: "stok tut / erit / yeniden sipariş",
      rangeLoTry: r0(lo.capitalTry), rangeHiTry: r0(hi.capitalTry), voiTry: r0(swing * 0.5), decisionFlips: flips,
      basis: `maliyet net değerin %${Math.round(ratio.p25 * 100)}–%${Math.round(ratio.p75 * 100)}'i (bilinen SKU dağılımı) → ${lo.cls}/${hi.cls}`, resolver: "OWNER" }, p);
  });
}

/** Satış kanıtı olmayan ölü stok: geri kazanılabilir değer maliyetin %50–150'si. Tasfiye fiyatı kararı için doğrusal kazançta
 *  eşik ortadayken EVPI ≈ (üst − alt) / 8. CFO piyasa fiyatını kendisi araştırabilir. */
export function deadPriceVoi(rows: { sku: string; stock: number; unitCost: number }[], p: VoiParams = DEFAULT_VOI_PARAMS): VoiItem[] {
  return rows.map(r => {
    const lo = r.stock * r.unitCost * 0.5, hi = r.stock * r.unitCost * 1.5;
    return item({ key: `dead-price:${r.sku}`, unknown: `${r.sku} satılabilir fiyatı (90 günde satış yok)`, decision: "tasfiye fiyatı / tut",
      rangeLoTry: r0(lo), rangeHiTry: r0(hi), voiTry: r0((hi - lo) / 8), decisionFlips: true,
      basis: "geri kazanım maliyetin %50–150'si; EVPI ≈ aralık/8", resolver: "CFO" }, p);
  });
}

/** Bayat banka bakiyesi: gerçek bakiye son 30 gün brüt hareketin bayat gün oranı kadar sapabilir. Karar: likidite açığına
 *  fon/tasfiye. Salınım = sapma × eşik faiz × dibe kalan ay; açık sapmayla işaret değiştirebiliyorsa karar değişir. */
export function staleBalanceVoi(accounts: { name: string; staleDays: number; grossFlow30Try: number }[], liquidityGapTry: number, hurdleMonthly: number | null,
  daysToDip: number, p: VoiParams = DEFAULT_VOI_PARAMS): VoiItem[] {
  return accounts.filter(a => a.staleDays > 7).map(a => {
    const dev = a.grossFlow30Try * Math.min(1, a.staleDays / 30);
    // Açık varken sapma açığın ≥ %25'i ise fon miktarı kararı değişir; açık yokken her sapma gizli bir açığı saklayabilir.
    const flips = liquidityGapTry > 0 ? dev >= liquidityGapTry * 0.25 : dev > 0;
    return item({ key: `stale-balance:${a.name}`, unknown: `${a.name} güncel bakiyesi (${a.staleDays} gün eski)`, decision: "likidite açığına fon / tasfiye",
      rangeLoTry: r0(-dev), rangeHiTry: r0(dev), voiTry: hurdleMonthly == null ? null : r0(dev * hurdleMonthly * Math.max(1, daysToDip / 30)), decisionFlips: flips,
      basis: hurdleMonthly == null ? `sapma ≈ 30 gün brüt hareket × ${a.staleDays}/30; eşik faiz bilinmiyor — değer ölçülemedi`
        : `sapma ≈ 30 gün brüt hareket × ${a.staleDays}/30; değer = sapma × aylık eşik %${(hurdleMonthly * 100).toFixed(2)}`, resolver: "OWNER" }, p);
  });
}

/** Varışı geçmiş ama YOLDA görünen ithalat: gümrük ödemesi ve satış başlangıcı planı. Bir haftalık yanlış plan ≈ aylık katkının 1/4'ü. */
export function importStatusVoi(projects: { code: string; status: string; eta: string | null; monthlyProfitTry: number | null }[], today: string,
  p: VoiParams = DEFAULT_VOI_PARAMS): VoiItem[] {
  return projects.filter(x => x.eta != null && x.eta < today && (x.status === "YOLDA" || x.status === "PLANLANDI")).map(x => item({
    key: `import-status:${x.code}`, unknown: `${x.code} gerçek durumu (varış ${x.eta}, kayıt ${x.status})`, decision: "gümrük nakdi + satış başlangıcı planı",
    rangeLoTry: 0, rangeHiTry: r0(x.monthlyProfitTry ?? 0), voiTry: x.monthlyProfitTry == null ? null : r0(x.monthlyProfitTry / 4), decisionFlips: true,
    basis: "1 haftalık yanlış plan ≈ aylık beklenen kârın 1/4'ü", resolver: "OWNER" }, p));
}

/** Kart maliyeti bilinmiyor (devreden bakiye ya da akdi faiz girilmemiş): kart kapama ↔ kredi kapama sırası ve eşik getiri bu
 *  bilgiye bağlı. Değer ≈ tutar × eşik × ufuk / 4 (yanlış sıranın faiz farkı kabaca eşiğin dörtte biri; kaba, sıralama içindir). */
export function cardCostVoi(cards: { name: string; totalDebtTry: number; revolvingTry: number | null; contractMonthlyRatePct: number | null }[],
  hurdleMonthly: number | null, p: VoiParams = DEFAULT_VOI_PARAMS): VoiItem[] {
  return cards.filter(c => c.totalDebtTry > 0 && (c.revolvingTry == null || (c.revolvingTry > 0 && c.contractMonthlyRatePct == null))).map(c => {
    const stake = c.revolvingTry ?? c.totalDebtTry;
    return item({ key: `card-cost:${c.name}`, unknown: `${c.name}: ${c.revolvingTry == null ? "devreden (faiz işleyen) bakiye" : "ekstredeki aylık akdi faiz"} girilmemiş`,
      decision: "kart mı kredi mi önce kapatılır; eşik getiri", rangeLoTry: 0, rangeHiTry: hurdleMonthly == null ? r0(stake) : r0(stake * hurdleMonthly * p.horizonMonths),
      voiTry: hurdleMonthly == null ? null : r0((stake * hurdleMonthly * p.horizonMonths) / 4), decisionFlips: true,
      basis: hurdleMonthly == null ? "ekstrede yazar (son ekstreden kalan borç + akdi faiz); eşik faiz bilinmiyor — değer ölçülemedi"
        : "ekstrede yazar (son ekstreden kalan borç + akdi faiz); tutar × eşik × ufuk / 4", resolver: "OWNER" }, p);
  });
}

/** Bayat Trendyol fatura dosyası: kesinti oranı ±2 puan belirsiz → fiyat tabanı kararı. Değer = aylık satış × 0,02. */
export function financeFileVoi(ageDays: number | null, monthlySalesTry: number | null, p: VoiParams = DEFAULT_VOI_PARAMS): VoiItem[] {
  if (ageDays == null || ageDays <= 14 || monthlySalesTry == null) return [];
  return [item({ key: "trendyol-finance-file", unknown: `Trendyol fatura/hakediş dosyası (${ageDays} gün eski)`, decision: "fiyat tabanı / kesinti oranı",
    rangeLoTry: r0(-monthlySalesTry * 0.02), rangeHiTry: r0(monthlySalesTry * 0.02), voiTry: r0(monthlySalesTry * 0.02), decisionFlips: true,
    basis: "kesinti oranı ±2 puan × aylık brüt satış", resolver: "OWNER" }, p)];
}

/** Metin sorulardaki TL tutarları (ör. "3.408.171 TL", "993,57 TL"). */
export function tlAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(?:TL|₺)/gi)) out.push(Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : "")));
  return out.filter(Number.isFinite);
}
const CASH_AREAS = new Set(["nakit", "banka", "kredi", "alacak", "vergi", "gumruk"]);
const MARGIN_AREAS = new Set(["marj", "satis", "stok", "siparis", "urun"]);

/** Açık serbest metin sorular: kaba değer = metindeki en büyük TL × alan çarpanı (nakit alanı: bir aylık eşik faizi; marj
 *  alanı: %10). Tutarsız ya da finansal olmayan soru (veri/güvenlik) → değer null; ölçülenlerin arkasında sıralanır. */
export function textQuestionVoi(questions: { id: string; question: string; area: string }[], hurdleMonthly: number | null, p: VoiParams = DEFAULT_VOI_PARAMS): VoiItem[] {
  return questions.map(q => {
    const stake = Math.max(0, ...tlAmounts(q.question));
    const factor = CASH_AREAS.has(q.area) ? hurdleMonthly : MARGIN_AREAS.has(q.area) ? 0.1 : null;
    const voi = stake > 0 && factor != null ? r0(stake * factor) : null;
    return item({ key: `question:${q.id}`, questionId: q.id, area: q.area, unknown: q.question.slice(0, 140), decision: `${q.area} kararı`,
      rangeLoTry: 0, rangeHiTry: r0(stake), voiTry: voi, decisionFlips: true,
      basis: voi == null ? (stake === 0 ? "metinde tutar yok — değer ölçülemedi" : CASH_AREAS.has(q.area) ? "eşik faiz bilinmiyor — değer ölçülemedi" : "alan finansal değil — değer ölçülemedi") : `metindeki en büyük tutar ${r0(stake)} TL × ${CASH_AREAS.has(q.area) ? "aylık eşik faiz" : "%10"}`,
      resolver: q.area === "veri" ? "CFO" : "OWNER" }, p);
  });
}

export type VoiRanking = { ask: VoiItem[]; research: VoiItem[]; decideNow: VoiItem[]; suppressedAsk: VoiItem[]; unmeasured: VoiItem[]; totalVoiTry: number };

/** Sıralama: ölçülen bilgi değerine göre azalan; dikkat bütçesi kadar ASK_FIRST Alperen'e gösterilir, kalanı bastırılır. */
export function rankVoi(items: VoiItem[], p: VoiParams = DEFAULT_VOI_PARAMS): VoiRanking {
  const byValue = (a: VoiItem, b: VoiItem) => (b.voiTry ?? -1) - (a.voiTry ?? -1) || a.key.localeCompare(b.key);
  const measured = items.filter(i => i.voiTry != null);
  const askAll = measured.filter(i => i.action === "ASK_FIRST").sort(byValue);
  return {
    ask: askAll.slice(0, p.askBudget), suppressedAsk: askAll.slice(p.askBudget),
    research: measured.filter(i => i.action === "RESEARCH_FIRST").sort(byValue),
    decideNow: measured.filter(i => i.action === "DECIDE_NOW").sort(byValue),
    unmeasured: items.filter(i => i.voiTry == null).sort(byValue),
    totalVoiTry: r0(measured.filter(i => i.action !== "DECIDE_NOW").reduce((s, i) => s + (i.voiTry ?? 0), 0)),
  };
}
