/**
 * Faz 90 — CFO modülü ortak formatlayıcılar.
 * Sayfalar arasında tekrar eden Intl kurulumunu tek yerde toplar.
 */

const TRY0 = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const TRY2 = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const USD0 = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUM0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const NUM1 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtTry = (n: number | null | undefined) => (n == null ? "—" : TRY0.format(n));
export const fmtTry2 = (n: number | null | undefined) => (n == null ? "—" : TRY2.format(n));
export const fmtUsd = (n: number | null | undefined) => (n == null ? "—" : USD0.format(n));
export const fmtNum = (n: number | null | undefined) => (n == null ? "—" : NUM0.format(n));
export const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `%${NUM1.format(n * 100)}`);

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateShort(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

/** Bugünden itibaren kaç gün — negatif = geçmiş. */
export function daysFromNow(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(dt);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

/** "3 gün sonra" / "bugün" / "2 gün gecikti" */
export function relDays(d: Date | string | null | undefined): string {
  const n = daysFromNow(d);
  if (n == null) return "—";
  if (n === 0) return "bugün";
  if (n === 1) return "yarın";
  if (n > 0) return `${n} gün sonra`;
  return `${Math.abs(n)} gün önce`;
}
