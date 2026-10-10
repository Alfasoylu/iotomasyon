// CFO-028 karar 1 (Alperen "Onaylıyorum", 2026-10-10): EPTT'de Entegra "Komisyon Tutarı" (`commissionTry`) çoğu satırda boş, "Komisyon
// Oranı" (`commissionPct`) her satırda dolu. Tutar boşken oran × KDV dahil satır toplamı TAHMİNİ komisyondur (measured=false):
//   • kanal marjına girer (lib/cfo-agent/snapshot.ts — ölçülmüş SKU oranı yoksa), /cfo/belgeler kayıtsız kanal tablosunda ayrı görünür;
//   • SKU komisyon oranı ölçümüne (06.10 kuralı: 120 gün, adet_duz=1, guven=YUKSEK, ≥10 kayıt) GİRMEZ — o yalnız `commissionTry` okur;
//   • ham satış kaydı değişmez (türetme okuma katmanında).
// Bilinen sapma: tutarın ve oranın ikisi de dolu 125 EPTT satırında oran ort. %14,02, gerçek tutar/toplam %14,42 (~0,4 puan düşük).
//
// CFO-028 adım 2 (2026-10-10): N11'de Entegra oranı ve tutarı 0 (90 gün 154 satırın tamamı) → kanalın PAZARYERİ API'sinden ölçülen etkin
// oranı (lib/n11/client.ts summarizeCommission: Σ satır × (komisyon − satıcı kampanya komisyonu), iptal/tedarik edilemedi hariç) ×
// KDV dahil toplam = TAHMİNİ komisyon. Oran ölçüm tarihinden itibaren API_RATE_VALID_DAYS gün geçerli; süresi dolunca kanal yine UNKNOWN
// (bayat oran sessizce kalmaz) — yeniden ölçüm: pazaryeri-api-test.yml / /api/cron/n11-tani.
// Koçtaş: 30 günde 1 sipariş (iade) — örneklem yetersiz, UNKNOWN kalır (TL02 %15,0 yalnız bilgi). Diğer kanallar (Amazon, Pazarama,
// Idefix, Temu, FBA) oran belgesi/API ölçümü gelene kadar UNKNOWN — %20 yer tutucu yok.
export const API_RATE_VALID_DAYS = 90;
export type ApiMeasuredRate = { pct: number; measuredOn: string; basis: string };
export const API_MEASURED_COMMISSION: Readonly<Record<string, ApiMeasuredRate>> = {
  N11: { pct: 15.88, measuredOn: "2026-10-10", basis: "N11 REST shipmentPackages, 30 gün: 94 paket, 120.802 TL, komisyon 19.183 TL" },
};
export const ESTIMATED_COMMISSION_CHANNELS: readonly string[] = ["EPTT", ...Object.keys(API_MEASURED_COMMISSION)];
export const COMMISSION_ESTIMATE_REASON = "eptt_entegra_rate_estimate";
export const API_COMMISSION_ESTIMATE_REASON = "marketplace_api_measured_rate_estimate";

export function commissionEstimateReason(channel: string): string {
  return channel in API_MEASURED_COMMISSION ? API_COMMISSION_ESTIMATE_REASON : COMMISSION_ESTIMATE_REASON;
}

/** asOf tarihinde geçerli API ölçümlü oranlar (süresi dolan kanal listede yok → UNKNOWN). */
export function activeApiRates(asOf: Date = new Date()): [string, ApiMeasuredRate][] {
  return Object.entries(API_MEASURED_COMMISSION).filter(([, r]) => {
    const age = (asOf.getTime() - new Date(`${r.measuredOn}T00:00:00Z`).getTime()) / 86400_000;
    return age >= 0 && age <= API_RATE_VALID_DAYS && r.pct > 0 && r.pct < 100;
  });
}

/** asOf tarihinde tahmin alan kanallar (EPTT + süresi dolmamış API oranlı kanallar). Snapshot kanal marjı bunu kullanır: süresi dolan
 *  kanalın 0 tutarları "komisyon 0" sayılmasın. */
export function estimatedCommissionChannels(asOf: Date = new Date()): string[] {
  return ["EPTT", ...activeApiRates(asOf).map(([ch]) => ch)];
}

export type CommissionColumns = { channel: string; commissionTry: string; commissionPct: string; totalAmountTry: string };
const DEFAULT_COLUMNS: CommissionColumns = { channel: "channel", commissionTry: `"commissionTry"`, commissionPct: `"commissionPct"`, totalAmountTry: `"totalAmountTry"` };
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** SQL: satırın TAHMİNİ komisyonu — EPTT: tutar boşken Entegra oranı × toplam; API kanalı: tutar boş/0 iken ölçülen oran × toplam; değilse NULL. */
export function estimatedCommissionSql(c: CommissionColumns = DEFAULT_COLUMNS, asOf: Date = new Date()): string {
  const api = activeApiRates(asOf).map(([ch, r]) => ` when ${c.channel}::text = ${lit(ch)} and coalesce(${c.commissionTry}::numeric, 0) = 0`
    + ` and ${c.totalAmountTry} is not null then round(${c.totalAmountTry}::numeric * ${Number(r.pct)} / 100, 2)`).join("");
  return `(case when ${c.commissionTry} is null and ${c.channel}::text = 'EPTT' and ${c.commissionPct}::numeric > 0 and ${c.totalAmountTry} is not null`
    + ` then round(${c.totalAmountTry}::numeric * ${c.commissionPct}::numeric / 100, 2)${api} end)`;
}

/** TS aynası (test): estimatedCommissionSql ile aynı kural. */
export function estimatedCommission(row: { channel: string; commissionTry: number | null; commissionPct: number | null; totalAmountTry: number | null }, asOf: Date = new Date()): number | null {
  if (row.totalAmountTry == null) return null;
  if (row.channel === "EPTT") {
    if (row.commissionTry != null || row.commissionPct == null || !(row.commissionPct > 0)) return null;
    return Math.round(row.totalAmountTry * row.commissionPct) / 100;
  }
  const api = activeApiRates(asOf).find(([ch]) => ch === row.channel)?.[1];
  if (!api || (row.commissionTry ?? 0) !== 0) return null;
  return Math.round(row.totalAmountTry * api.pct) / 100;
}
