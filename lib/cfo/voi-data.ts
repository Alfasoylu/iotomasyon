import { classifySku, type SkuInput } from "./capital-efficiency";
import { loadCapitalEfficiency, type SqlQuery } from "./capital-efficiency-data";
import { deadPriceVoi, DEFAULT_VOI_PARAMS, financeFileVoi, importStatusVoi, rankVoi, skuCostVoi, staleBalanceVoi, textQuestionVoi, type VoiItem } from "./voi";

// VOI veri yükleyicisi (salt-okunur, tek yükleyici: /cfo/sorular ve AI CFO aynı kodu çağırır). Sermaye motorunun çıktısını
// yeniden kullanır (eşik faiz, SKU sınıfları, likidite açığı) — stok verisini ikinci kez yorumlamaz.

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] : null; };
const fold = (s: string) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export async function loadVoi(q: SqlQuery, at: Date = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(at);
  const ce = await loadCapitalEfficiency(q, { budgetTry: 0 });
  const hurdle = ce.hurdleMonthly ?? 0.04;
  const [accounts, flows, dip, projects, fin, questions] = await Promise.all([
    q<{ name: string; updated: unknown; type: string | null }>(`select name, "lastUpdatedAt" as updated, "accountType"::text as type from cfo_bank_account where "isActive"`),
    q<{ banka: string; gross: unknown }>(`select banka, sum(abs(tutar_try))::float8 as gross from cfo_banka_hareket where tarih > current_date - 30 group by banka`).catch(() => []),
    q<{ d: unknown }>(`select min(kalan_gun) as d from (select kalan_gun from cfo_odeme_gunluk where kalan_gun between 0 and 60 order by gun_ici_dip asc nulls last limit 1) x`).catch(() => []),
    q<{ code: string; status: string; eta: unknown; profit: unknown; months: unknown }>(`select code, status::text as status, "etaDate"::date::text as eta, "expectedProfitTry" as profit, "salesMonths" as months
      from cfo_import_project where status::text not in ('TESLIM_ALINDI','IPTAL')`).catch(() => []),
    q<{ last: unknown; sales: unknown }>(`select (select max("importedAt") from trendyol_finance_import where ok) as last,
      (select sum("totalTry") from trendyol_settlement_line where "transactionType"='Satış' and "transactionDate" > (select max("transactionDate") from trendyol_settlement_line) - interval '30 days') as sales`).catch(() => []),
    q<{ id: string; question: string; area: string }>(`select id, question, area from cfo_question where status = 'ACIK'`),
  ]);

  // Bilinen SKU'ların maliyet / net değer oranı dağılımı (veriden; varsayım değil)
  const ratios = ce.skus.filter(s => s.unitCost != null && s.unitCost > 0 && s.unitNet != null && s.unitNet > 0).map(s => s.unitCost! / s.unitNet!);
  const ratio = { p25: quantile(ratios, 0.25) ?? 0.5, p75: quantile(ratios, 0.75) ?? 0.8 };
  const classify = (unitCost: number, r: { sku: string; stock: number; unitNet: number; dailyVelocity: number }) => {
    const x = classifySku({ id: r.sku, sku: r.sku, name: r.sku, stock: r.stock, unitCost, unitNet: r.unitNet, dailyVelocity: r.dailyVelocity } as SkuInput, hurdle, ce.params);
    return { cls: x.cls, dragMonthlyTry: x.dragMonthlyTry, capitalTry: x.capitalTry };
  };
  const costMissing = ce.skus.filter(s => (s.unitCost == null || s.unitCost <= 0) && s.unitNet != null && s.unitNet > 0 && s.stock > 0)
    .map(s => ({ sku: s.sku, stock: s.stock, unitNet: s.unitNet!, dailyVelocity: s.dailyVelocity }));
  const deadNoPrice = ce.skus.filter(s => s.cls === "LIQUIDATE" && s.unitNet == null && s.unitCost != null && s.unitCost > 0)
    .map(s => ({ sku: s.sku, stock: s.stock, unitCost: s.unitCost! }));

  const flowByBank = new Map(flows.map(f => [fold(f.banka), Number(f.gross)]));
  const stale = accounts.filter(a => !/şahsi|ŞAHSİ/i.test(`${a.type ?? ""} ${a.name}`)).map(a => {
    const updated = a.updated ? new Date(String(a.updated)) : null;
    const staleDays = updated ? Math.floor((at.getTime() - updated.getTime()) / 86400000) : 999;
    const key = [...flowByBank.keys()].find(k => fold(a.name).startsWith(k) || k.startsWith(fold(a.name)));
    return { name: a.name, staleDays, grossFlow30Try: key ? flowByBank.get(key)! : 0 };
  }).filter(a => a.grossFlow30Try > 0);

  const finLast = fin[0]?.last ? new Date(String(fin[0].last)) : null;
  const items: VoiItem[] = [
    ...skuCostVoi(costMissing, ratio, classify),
    ...deadPriceVoi(deadNoPrice),
    ...staleBalanceVoi(stale, ce.liquidityGapTry, hurdle, num(dip[0]?.d) ?? 30),
    ...importStatusVoi(projects.map(p => ({ code: p.code, status: p.status, eta: p.eta ? String(p.eta) : null,
      monthlyProfitTry: num(p.profit) != null && (num(p.months) ?? 0) > 0 ? num(p.profit)! / num(p.months)! : null })), today),
    ...financeFileVoi(finLast ? Math.floor((at.getTime() - finLast.getTime()) / 86400000) : null, num(fin[0]?.sales)),
    ...textQuestionVoi(questions, hurdle),
  ];
  return { ...rankVoi(items, DEFAULT_VOI_PARAMS), params: DEFAULT_VOI_PARAMS, hurdleMonthly: hurdle, costRatio: ratio, openQuestions: questions.length, items };
}
