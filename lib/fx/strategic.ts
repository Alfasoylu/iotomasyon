// STRATEJİK KUR — hedef ölçen her USD dönüşümünün TEK kaynağı (CFO-003, Alperen D-P04 2026-10-09).
// Kural: TCMB döviz alış, ayın 15'i bülteni (fm_fx_monthly; yoksa 15'inden önceki son bülten). Değerlendirme ayının kuru henüz
// yoksa önceki en yakın ay (kalite B, "önceki ay" işaretli); hiç yoksa BİLİNMİYOR (null) — sabit/elle kur yedeği YOK.
// Goal Engine (fm_goal_evaluate) aynı kuralı SQL'de uygular. Operasyonel kur (ithalat fiyatlama, maliyet) ayrıdır: lib/fx/current.ts.
// Saf: DB'ye bağlanmaz; çağıran STRATEGIC_FX_SQL'i kendi bağlantısıyla çalıştırır ($1 = değerlendirme anı).

export const STRATEGIC_FX_SQL = `select month::text as month, usd_try_forex_buying::numeric as rate, ref_date::text as ref_date
  from fm_memory_fx_monthly where usd_try_forex_buying is not null and month <= date_trunc('month', $1::timestamp)::date
  order by month desc limit 1`;

/** Parametresiz yükleyiciler için (değerlendirme anı = şimdi, İstanbul). */
export const STRATEGIC_FX_SQL_NOW = STRATEGIC_FX_SQL.replace("$1::timestamp", "(now() at time zone 'Europe/Istanbul')");

export type StrategicFx = {
  usdTry: number;
  /** kurun ait olduğu ay, YYYY-MM */
  month: string;
  /** A = değerlendirme ayının kuru; B = önceki ay (bu ayın 15'i henüz gelmedi ya da bülten çekilmedi) */
  grade: "A" | "B";
  priorMonth: boolean;
  /** ekranda gösterilecek kısa kaynak etiketi */
  label: string;
};

export function pickStrategicFx(row: { month?: unknown; rate?: unknown } | null | undefined, asOf: Date): StrategicFx | null {
  const rate = row?.rate == null ? NaN : Number(row.rate);
  const month = typeof row?.month === "string" ? row.month.slice(0, 7) : null;
  if (!month || !Number.isFinite(rate) || rate <= 0) return null;
  const evalMonth = new Date(asOf.getTime() + 3 * 3600000).toISOString().slice(0, 7); // İstanbul ayı (UTC+3)
  const priorMonth = month < evalMonth;
  return { usdTry: rate, month, grade: priorMonth ? "B" : "A", priorMonth,
    label: `TCMB döviz alış ${month}${priorMonth ? " (önceki ay; bu ayın bülteni henüz yok)" : ""}` };
}
