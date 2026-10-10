// CFO-028 karar 1 (Alperen "Onaylıyorum", 2026-10-10): EPTT'de Entegra "Komisyon Tutarı" (`commissionTry`) çoğu satırda boş, "Komisyon
// Oranı" (`commissionPct`) her satırda dolu. Tutar boşken oran × KDV dahil satır toplamı TAHMİNİ komisyondur (measured=false):
//   • kanal marjına girer (lib/cfo-agent/snapshot.ts — ölçülmüş SKU oranı yoksa), /cfo/belgeler kayıtsız kanal tablosunda ayrı görünür;
//   • SKU komisyon oranı ölçümüne (06.10 kuralı: 120 gün, adet_duz=1, guven=YUKSEK, ≥10 kayıt) GİRMEZ — o yalnız `commissionTry` okur;
//   • ham satış kaydı değişmez (türetme okuma katmanında).
// Bilinen sapma: tutarın ve oranın ikisi de dolu 125 EPTT satırında oran ort. %14,02, gerçek tutar/toplam %14,42 (~0,4 puan düşük).
// Diğer kanallar (N11, Amazon, Pazarama, Koçtaş, Idefix, Temu, FBA) oran belgesi gelene kadar UNKNOWN — oran alanı da boş, %20 yer tutucu yok.
export const ESTIMATED_COMMISSION_CHANNELS: readonly string[] = ["EPTT"];
export const COMMISSION_ESTIMATE_REASON = "eptt_entegra_rate_estimate";

export type CommissionColumns = { channel: string; commissionTry: string; commissionPct: string; totalAmountTry: string };
const DEFAULT_COLUMNS: CommissionColumns = { channel: "channel", commissionTry: `"commissionTry"`, commissionPct: `"commissionPct"`, totalAmountTry: `"totalAmountTry"` };

/** SQL: satırın TAHMİNİ komisyonu — yalnız tutar boşken, tahmin kanalında, oran > 0 ve toplam biliniyorsa; değilse NULL. */
export function estimatedCommissionSql(c: CommissionColumns = DEFAULT_COLUMNS): string {
  const channels = ESTIMATED_COMMISSION_CHANNELS.map(ch => `'${ch.replace(/'/g, "''")}'`).join(",");
  return `(case when ${c.commissionTry} is null and ${c.channel}::text in (${channels}) and ${c.commissionPct}::numeric > 0 and ${c.totalAmountTry} is not null`
    + ` then round(${c.totalAmountTry}::numeric * ${c.commissionPct}::numeric / 100, 2) end)`;
}

/** TS aynası (test): estimatedCommissionSql ile aynı kural. */
export function estimatedCommission(row: { channel: string; commissionTry: number | null; commissionPct: number | null; totalAmountTry: number | null }): number | null {
  if (row.commissionTry != null || !ESTIMATED_COMMISSION_CHANNELS.includes(row.channel)) return null;
  if (row.commissionPct == null || !(row.commissionPct > 0) || row.totalAmountTry == null) return null;
  return Math.round(row.totalAmountTry * row.commissionPct) / 100;
}
