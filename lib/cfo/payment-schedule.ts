/**
 * Ödeme takvimi (cfo_cash_event) ↔ kredi/kart defteri eşleşmesi — CFO-010.
 *
 * Bir taksitin ödenip ödenmediğinin TEK kaynağı takvim satırıdır (taksit başına satır + isSettled; /cfo/odemeler'de
 * loglu işaretlenir; nakit projeksiyonu da aynı satırları okur). cfo_loan / cfo_credit_card."currentMonthState" ay
 * dönümünde sıfırlanmadığı için ödeme durumu olarak kullanılmaz (08.10: 11 kalemin 10'u geçen ayın "ODENDI"siyle kalmıştı).
 * Eşleşme kuralı lib/cfo-agent/health.ts ledgerGapSql ile aynıdır: banka (yapısal `bank` sütunu ya da açıklama) +
 * kredide tutar ±%25 (tahmini taksit, kısmi bölünme payı); kartta yalnız banka (asgari tutar her ay değişir).
 */

/** Kredi taksiti ↔ takvim satırı eşleşmesinde tutar toleransı. */
export const LOAN_AMOUNT_TOLERANCE = 0.25;

export type ScheduleRow = {
  kind: string; bank: string | null; description: string | null;
  eventDate: Date | string; outflowTry: unknown; isSettled: boolean;
};

/** Türkçe I/İ/ı farkını yok sayan küçük harf (Postgres ILIKE ile aynı sonucu verir: "YAPI" ~ "Yapı" ~ "yapi"). */
const fold = (s: string) => s.replace(/[İIı]/g, "i").toLowerCase();

export function sameBank(row: Pick<ScheduleRow, "bank" | "description">, bank: string): boolean {
  const b = fold(bank.trim());
  if (!b) return false;
  return (row.bank != null && fold(row.bank.trim()) === b) || (row.description != null && fold(row.description).includes(b));
}

/** Takvimdeki ilk bekleyen (işaretlenmemiş) eşleşen ödeme; yoksa null — projeksiyon bu borcun sonraki ödemesini görmüyor. */
export function nextScheduledPayment(
  rows: ScheduleRow[],
  q: { kind: "KREDI_TAKSITI" | "KART_ODEMESI"; bank: string; expectedTry?: number | null },
): { date: Date; amountTry: number } | null {
  const exp = q.expectedTry ?? null;
  let best: { date: Date; amountTry: number } | null = null;
  for (const r of rows) {
    if (r.isSettled || r.kind !== q.kind || !sameBank(r, q.bank)) continue;
    const amt = Number(r.outflowTry ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    if (q.kind === "KREDI_TAKSITI" && exp != null && exp > 0 && Math.abs(amt - exp) > LOAN_AMOUNT_TOLERANCE * exp) continue;
    const date = new Date(r.eventDate);
    if (!best || date.getTime() < best.date.getTime()) best = { date, amountTry: amt };
  }
  return best;
}
