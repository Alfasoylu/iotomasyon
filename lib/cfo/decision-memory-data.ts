import type { SqlQuery } from "./capital-efficiency-data";
import { evaluateHamle, resolveMetric, summarize, type Hamle, type MetricKey } from "./decision-memory";
import { personalAccountSql, personalCardSql } from "./ownership";

// Decision Memory veri yükleyicisi (salt-okunur; sayfa ve AI CFO aynı kodu çağırır). Metrikler bugünkü değerdir; geçmiş
// ölçüm satırları (cfo_hamle_olcum) değiştirilmez — CFO defterine YAZILMAZ.

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const dateStr = (v: unknown) => (v == null ? null : new Date(String(v)).toISOString().slice(0, 10));

export async function loadMetric(q: SqlQuery, key: MetricKey): Promise<number | null> {
  const one = async (sql: string) => num((await q<{ v: unknown }>(sql).catch(() => []))[0]?.v);
  switch (key) {
    case "debt_try": return one(`select value_try as v from fm_balance_day where metric_key='debt_try' order by economic_date desc limit 1`);
    case "card_try": return one(`select coalesce(sum("totalDebtTry"),0) as v from cfo_credit_card where "isActive"`);
    case "personal_card_try": return one(`select coalesce(sum("totalDebtTry"),0) as v from cfo_credit_card where "isActive" and ${personalCardSql("holder")}`);
    case "card_kmh_try": return one(`select (select coalesce(sum("totalDebtTry"),0) from cfo_credit_card where "isActive")
      + (select coalesce(sum(-"balanceTry"),0) from cfo_bank_account where "isActive" and "balanceTry" < 0 and not ${personalAccountSql('"accountType"')}) as v`);
    case "kamu_monthly_try": return one(`select coalesce(sum(tutar),0) as v from cfo_pay_obs where kanal::text like 'KURUMSAL%' and odeme_tarihi > current_date - 30`);
    case "fba_90d_try": return one(`select coalesce(sum(tutar_duz),0) as v from cfo_satis_birim_duz where channel = 'AMAZON_FBA' and "orderDate" > current_date - 90`);
  }
}

export async function loadDecisionMemory(q: SqlQuery, at: Date = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(at);
  const rows = await q<Record<string, unknown>>(`select kod, baslik, karar_tarihi, durum, baslangic_metrik, baslangic_deger, beklenen_etki, beklenen_deger,
      olcum_metrigi, ilk_olcum_tarihi, gerceklesen_deger from cfo_hamle order by karar_tarihi`).catch(() => []);
  const hamleler: Hamle[] = rows.map(r => ({
    kod: String(r.kod), baslik: String(r.baslik ?? ""), kararTarihi: dateStr(r.karar_tarihi) ?? today, durum: String(r.durum ?? ""),
    baslangicMetrik: r.baslangic_metrik == null ? null : String(r.baslangic_metrik), baslangicDeger: num(r.baslangic_deger),
    beklenenEtki: r.beklenen_etki == null ? null : String(r.beklenen_etki), beklenenDeger: num(r.beklenen_deger),
    olcumMetrigi: r.olcum_metrigi == null ? null : String(r.olcum_metrigi), ilkOlcumTarihi: dateStr(r.ilk_olcum_tarihi), gerceklesenDeger: num(r.gerceklesen_deger),
  }));
  const keys = [...new Set(hamleler.map(h => resolveMetric(`${h.olcumMetrigi ?? ""} ${h.baslangicMetrik ?? ""}`)).filter((k): k is MetricKey => k != null))];
  const values = new Map<MetricKey, number | null>(await Promise.all(keys.map(async k => [k, await loadMetric(q, k)] as const)));
  return { ...summarize(hamleler.map(h => {
    const k = resolveMetric(`${h.olcumMetrigi ?? ""} ${h.baslangicMetrik ?? ""}`);
    return evaluateHamle(h, k ? values.get(k) ?? null : null, today);
  })), today };
}
