/**
 * Senkron sonrası (after()) motor koşusu için süre bütçesi (CFO-009, 2026-10-09).
 * xml-sync / trendyol-sync motoru yanıt sonrası aynı fonksiyon süresinden (maxDuration 300 sn) çalıştırır. Senkron uzun sürünce motor
 * (~2 dk) süre sınırında öldürülüyor ve cfo_run satırı 'running' kalıyordu (09.10 02:34 UTC, 4+ saat). Yeterli süre yoksa motor hiç başlamaz;
 * sıradaki zamanlanmış koşu (GitHub) ya da diğer senkron işi yapar.
 */
/** Motorun güvenle bitmesi için gereken süre: ölçülen ~130 sn + pay. */
export const ENGINE_MIN_BUDGET_MS = 150_000;

export function engineBudgetOk(startedAtMs: number, nowMs: number, maxDurationSec = 300): boolean {
  return maxDurationSec * 1000 - (nowMs - startedAtMs) >= ENGINE_MIN_BUDGET_MS;
}
