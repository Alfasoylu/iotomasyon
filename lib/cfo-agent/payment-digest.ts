// Günlük ödeme özeti WhatsApp'ta (Alperen 2026-10-10: "WhatsApp bildirimi her gün en yakın 5 ödemeyi de bildirsin"). Kaynak ödeme
// takviminin kendisi (cfo_cash_event: ödenmemiş, çıkış > 0 — projeksiyon/alarm ile aynı satırlar); bugünden itibaren en yakın 5 ödeme
// + vadesi geçmiş işaretlenmemiş sayısı. Onaylı cfo_alarm şablonu (2 değişken) kullanılır: {{1}} başlık + toplam, {{2}} liste.
// Günde bir kez: gönderim cfo_change_log'a iz bırakır (alıcı/numara yazılmaz); aynı İstanbul gününde ikinci kez gitmez (force hariç).
export type DigestRow = { due: string; kind: string; description: string; amountTry: number; certainty: string };

const tl = (v: number) => `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(v))} TL`;
const ddmm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
/** Kısa etiket: açıklamanın ilk parçası (— / ( / . öncesi), tek satır, ≤ 34 karakter. */
export function shortLabel(description: string): string {
  const s = description.replace(/\s+/g, " ").trim().split(/\s+—\s+|\s+\(|\.\s/)[0].trim();
  return s.length > 34 ? `${s.slice(0, 33).trimEnd()}…` : s;
}

/** Meta şablon parametresi: satır sonu/sekme yok, 4'ten fazla ardışık boşluk yok; toplam gövde 1024 sınırına uzak (≤ 600). */
export function paymentDigestParams(rows: DigestRow[], overdue: number, today: string): [string, string] {
  const top = rows.slice(0, 5);
  const total = top.reduce((s, r) => s + r.amountTry, 0);
  const head = top.length
    ? `Günlük ödeme özeti ${ddmm(today)} — en yakın ${top.length} ödeme, toplam ${tl(total)}`
    : `Günlük ödeme özeti ${ddmm(today)} — yaklaşan ödenmemiş ödeme yok`;
  const tail = overdue > 0 ? ` (+${overdue} vadesi geçmiş, işaretlenmemiş)` : "";
  const list = top.length
    ? top.map((r, i) => `${i + 1}) ${ddmm(r.due)} ${shortLabel(r.description)} ${tl(r.amountTry)}${r.certainty === "TAHMINI" ? " (tahmini)" : ""}`).join(" · ")
    : "Takvimde bugünden sonra ödenmemiş çıkış yok";
  return [(head + tail).slice(0, 200), list.slice(0, 600)];
}

export const upcomingPaymentsSql = (today: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("today must be YYYY-MM-DD");
  return `select "eventDate"::date::text as due, kind::text as kind, description, "outflowTry"::float8 as "amountTry", certainty::text as certainty
    from cfo_cash_event where not "isSettled" and coalesce("outflowTry", 0) > 0 and "eventDate"::date >= '${today}'::date
    order by "eventDate", "outflowTry" desc limit 5`;
};
export const overduePaymentsSql = (today: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("today must be YYYY-MM-DD");
  return `select count(*)::int as n from cfo_cash_event where not "isSettled" and coalesce("outflowTry", 0) > 0 and "eventDate"::date < '${today}'::date`;
};
