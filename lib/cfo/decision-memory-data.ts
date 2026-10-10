import type { SqlQuery } from "./capital-efficiency-data";
import { METRIC_LABEL, evaluateHamle, planMeasurements, resolveMetric, summarize, type Hamle, type Measurement, type MetricKey } from "./decision-memory";
import { personalAccountSql, personalCardSql } from "./ownership";

// Decision Memory veri yükleyicisi (sayfa ve AI CFO aynı kodu çağırır; okuma salt-okunur). Metrikler bugünkü değerdir; geçmiş
// ölçüm satırları (cfo_hamle_olcum) değiştirilmez. CFO-012 (2026-10-10): kontrol noktası gelen kararlar için ölçüm satırı EKLENİR
// (measureDecisions — yalnız INSERT, mevcut satır/karar değişmez; xml-sync after() günlük).

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

/** Kontrol noktası itibarıyla değer (CFO-012). Borç: o güne en yakın günlük bakiye (önce ≤ gün, ±3 gün); kamu/FBA: o güne biten pencere.
 *  Veri yoksa null (ölçüm yazılmaz, sonraki koşu tekrar dener). Kart/KMH bakiyesi geçmiş tarihli okunamaz → loadMetric (bugün). */
export async function loadMetricAsOf(q: SqlQuery, key: MetricKey, d: string): Promise<{ value: number; source: string } | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`decision-memory: geçersiz gün ${d}`);
  const D = `'${d}'::date`;
  const one = async (sql: string) => (await q<{ v: unknown; d?: unknown }>(sql))[0];
  switch (key) {
    case "debt_try": {
      const r = await one(`select value_try as v, economic_date::text as d from fm_balance_day where metric_key='debt_try'
        and economic_date between ${D} - 3 and ${D} + 3 order by (economic_date > ${D}), abs(economic_date - ${D}) limit 1`);
      return num(r?.v) == null ? null : { value: num(r!.v)!, source: `fm_balance_day ${String(r!.d)}` };
    }
    case "kamu_monthly_try": {
      const r = await one(`select coalesce(sum(tutar),0) as v from cfo_pay_obs where kanal::text like 'KURUMSAL%' and odeme_tarihi > ${D} - 30 and odeme_tarihi <= ${D}`);
      return { value: num(r?.v) ?? 0, source: `cfo_pay_obs KURUMSAL_* (${d} biten 30 gün)` };
    }
    case "fba_90d_try": {
      const r = await one(`select coalesce(sum(tutar_duz),0) as v from cfo_satis_birim_duz where channel = 'AMAZON_FBA' and "orderDate" > ${D} - 90 and "orderDate" < ${D} + 1`);
      return { value: num(r?.v) ?? 0, source: `cfo_satis_birim_duz AMAZON_FBA (${d} biten 90 gün)` };
    }
    default: return null;
  }
}

const HAMLE_SQL = `select kod, baslik, karar_tarihi, durum, baslangic_metrik, baslangic_deger, beklenen_etki, beklenen_deger,
    olcum_metrigi, ilk_olcum_tarihi, gerceklesen_deger, (created_at at time zone 'Europe/Istanbul')::date::text as created_at from cfo_hamle order by karar_tarihi`;
const MEASUREMENTS_SQL = `select hamle_kod, olcum_tarihi::text as d, deger as v from cfo_hamle_olcum order by hamle_kod, olcum_tarihi`;

function toHamle(r: Record<string, unknown>, today: string): Hamle {
  return {
    kod: String(r.kod), baslik: String(r.baslik ?? ""), kararTarihi: dateStr(r.karar_tarihi) ?? today, durum: String(r.durum ?? ""),
    baslangicMetrik: r.baslangic_metrik == null ? null : String(r.baslangic_metrik), baslangicDeger: num(r.baslangic_deger),
    beklenenEtki: r.beklenen_etki == null ? null : String(r.beklenen_etki), beklenenDeger: num(r.beklenen_deger),
    olcumMetrigi: r.olcum_metrigi == null ? null : String(r.olcum_metrigi), ilkOlcumTarihi: dateStr(r.ilk_olcum_tarihi), gerceklesenDeger: num(r.gerceklesen_deger),
    createdAt: typeof r.created_at === "string" ? r.created_at.slice(0, 10) : null,
  };
}
async function loadMeasurements(q: SqlQuery): Promise<Map<string, Measurement[]>> {
  const out = new Map<string, Measurement[]>();
  for (const r of await q<{ hamle_kod: string; d: string; v: unknown }>(MEASUREMENTS_SQL).catch(() => [])) {
    const v = num(r.v);
    if (v == null) continue;
    out.set(r.hamle_kod, [...(out.get(r.hamle_kod) ?? []), { date: String(r.d).slice(0, 10), value: v }]);
  }
  return out;
}
const istanbulDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(at);

export async function loadDecisionMemory(q: SqlQuery, at: Date = new Date()) {
  const today = istanbulDay(at);
  const hamleler = (await q<Record<string, unknown>>(HAMLE_SQL).catch(() => [])).map(r => toHamle(r, today));
  const measurements = await loadMeasurements(q);
  const keys = [...new Set(hamleler.map(h => resolveMetric(`${h.olcumMetrigi ?? ""} ${h.baslangicMetrik ?? ""}`)).filter((k): k is MetricKey => k != null))];
  const values = new Map<MetricKey, number | null>(await Promise.all(keys.map(async k => [k, await loadMetric(q, k)] as const)));
  return { ...summarize(hamleler.map(h => {
    const k = resolveMetric(`${h.olcumMetrigi ?? ""} ${h.baslangicMetrik ?? ""}`);
    return evaluateHamle(h, k ? values.get(k) ?? null : null, today);
  }), measurements), today, measurements };
}

/** $1 newHamleRow (jsonb), $2 kaynak (kullanıcı). Var olan kod üzerine yazılmaz; yazıldıysa cfo_change_log (strateji, karar). */
export const INSERT_HAMLE_SQL = `WITH h AS (
    INSERT INTO public.cfo_hamle (kod, baslik, karar_tarihi, alan, durum, neden, yapilan, baslangic_metrik, baslangic_deger, beklenen_etki,
                                  beklenen_deger, olcum_metrigi, ilk_olcum_tarihi, kaynak)
    SELECT r.kod, r.baslik, r.karar_tarihi, r.alan, r.durum, r.neden, r.yapilan, r.baslangic_metrik, r.baslangic_deger, r.beklenen_etki,
           r.beklenen_deger, r.olcum_metrigi, r.ilk_olcum_tarihi, r.kaynak
      FROM jsonb_to_record($1::jsonb) AS r(kod text, baslik text, karar_tarihi date, alan text, durum text, neden text, yapilan text,
           baslangic_metrik text, baslangic_deger numeric, beklenen_etki text, beklenen_deger numeric, olcum_metrigi text, ilk_olcum_tarihi date, kaynak text)
    ON CONFLICT (kod) DO NOTHING
    RETURNING kod, olcum_metrigi, baslangic_deger, beklenen_deger, ilk_olcum_tarihi),
  l AS (
    INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
    SELECT gen_random_uuid()::text, 'strateji', 'Karar kaydı ' || kod, NULL,
           olcum_metrigi || ': ' || baslangic_deger::text || ' → ' || beklenen_deger::text || ' (' || ilk_olcum_tarihi::text || ')', $2, 'karar',
           'CFO-012: beklenen değerli karar; ölçüm kontrol noktalarında otomatik'
      FROM h
    RETURNING 1)
SELECT (SELECT count(*) FROM h)::int AS n`;

export const MEASURE_SOURCE = "CFO-012 karar ölçümü";
/** $1 ölçümler (jsonb), $2 kaynak. Tek ifade: yalnız açık hamleye, kontrol noktası ve sonrası tarihli ölçüm YOKSA INSERT (tekrar koşu
 *  yazmaz) + yazıldıysa cfo_change_log özet satırı (area strateji, kind analiz). Mevcut ölçüm ve karar satırları değişmez. */
export const MEASURE_SQL = `WITH v AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(kod text, cp date, olcum date, deger numeric, note text)),
  i AS (
    INSERT INTO public.cfo_hamle_olcum (hamle_kod, olcum_tarihi, deger, not_)
    SELECT v.kod, v.olcum, v.deger, v.note FROM v JOIN public.cfo_hamle h ON h.kod = v.kod
     WHERE h.durum NOT IN ('SONUCLANDI', 'GERI_ALINDI')
       AND NOT EXISTS (SELECT 1 FROM public.cfo_hamle_olcum o WHERE o.hamle_kod = v.kod AND o.olcum_tarihi >= v.cp)
    RETURNING hamle_kod, olcum_tarihi, deger),
  s AS (
    INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
    SELECT gen_random_uuid()::text, 'strateji', 'CFO-012 karar ölçümü', NULL, (SELECT count(*) FROM i)::text || ' ölçüm yazıldı', $2, 'analiz',
           (SELECT string_agg(hamle_kod || ' ' || olcum_tarihi::text || ' = ' || round(deger)::text, '; ' ORDER BY hamle_kod, olcum_tarihi) FROM i)
     WHERE EXISTS (SELECT 1 FROM i)
    RETURNING 1)
SELECT (SELECT count(*) FROM i)::int AS n`;

export type MeasureDb = { query: <T>(sql: string, ...params: unknown[]) => Promise<T[]> };
export type MeasureRunResult = { planned: number; written: number; skipped: string[] };

/** CFO-012 ölçüm koşusu: plan (saf) → değerleri oku → tek ifadeyle yaz. Çağıran işlem kilidini tutar (decision-measure-job.ts). */
export async function measureDecisions(db: MeasureDb, at: Date = new Date()): Promise<MeasureRunResult> {
  const q: SqlQuery = <T,>(sql: string) => db.query<T>(sql);
  const today = istanbulDay(at);
  const hamleler = (await q<Record<string, unknown>>(HAMLE_SQL)).map(r => toHamle(r, today));
  const plan = planMeasurements(hamleler, await loadMeasurements(q), today);
  const rows: { kod: string; cp: string; olcum: string; deger: number; note: string }[] = [];
  const skipped: string[] = [];
  for (const p of plan) {
    if (p.asOf) {
      const r = await loadMetricAsOf(q, p.metric, p.date);
      if (r == null) { skipped.push(`${p.kod} ${p.checkpoint}: ${METRIC_LABEL[p.metric]} bu gün için yok`); continue; }
      rows.push({ kod: p.kod, cp: p.checkpoint, olcum: p.date, deger: r.value, note: `CFO-012 otomatik ölçüm — kontrol noktası ${p.checkpoint}; ${METRIC_LABEL[p.metric]} (${r.source})` });
    } else {
      const v = await loadMetric(q, p.metric);
      if (v == null) { skipped.push(`${p.kod} ${p.checkpoint}: ${METRIC_LABEL[p.metric]} okunamadı`); continue; }
      rows.push({ kod: p.kod, cp: p.checkpoint, olcum: p.date, deger: v,
        note: `CFO-012 otomatik ölçüm — kontrol noktası ${p.checkpoint}; ${METRIC_LABEL[p.metric]} ${p.date} bakiyesi (geçmiş tarihli okunamaz)` });
    }
  }
  if (!rows.length) return { planned: plan.length, written: 0, skipped };
  const [res] = await db.query<{ n: number }>(MEASURE_SQL, JSON.stringify(rows), MEASURE_SOURCE);
  return { planned: plan.length, written: Number(res?.n ?? 0), skipped };
}
