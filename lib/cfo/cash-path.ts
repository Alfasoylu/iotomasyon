// NAKİT UFKU VE AY SONLARI — tek nakit yolundan (CFO-018 adım 2, 2026-10-10). Eski motor (`computeCfo`) ufukları kendi haftalık
// kovalarıyla kuruyordu: pencere sonundaki kısmi hafta tahmini tahsilatı düşüyor, başlangıç ve kapasite kuralı SQL'den ayrı yaşıyordu.
// Artık `/cfo`, `/cfo/nakit-akisi` ve `/cfo/borclar` ufuk/ay sonu tabloları, motorun kapasite alarmı (`capacity.ts`) ve ödeme takvimiyle
// AYNI yolu okur: `cfo_nakit_projeksiyon(n)` (açılış = şirket nakdi, takvim + alacak + tahmini tahsilat, vadesi geçmiş ödenmemiş bugün).
// Trafik: açık yok → YEŞİL; açık ≤ şirket kapasitesi (genel KMH + amaca bağlı limit) → SARI; aşarsa KIRMIZI — KIRMIZI eşiği
// `capacityStatus` "danger" ile aynı. Pozisyon kullanılan KMH'yi zaten içerir → kapasite tam limittir (CFO-030). Yol ya da limit okunamazsa tablo yok (UNKNOWN).
import type { Traffic } from "@/lib/cfo/engine";
import type { CapacityInput } from "@/lib/cfo-agent/capacity";

export type PathRow = { date: string; inflow: number; outflow: number; position: number };
export type HorizonRow = { label: string; days: number; inflow: number; outflow: number; net: number; position: number; gap: number; traffic: Traffic };
export type MonthEndRow = HorizonRow & { date: Date; freeCapacityAfter: number };

export const CASH_PATH_SQL = `select tarih::text as d, giris as i, cikis as o, pozisyon as p from cfo_nakit_projeksiyon(120) order by tarih`;
const TR_AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
export function toPathRows(rows: { d: string | null; i: unknown; o: unknown; p: unknown }[]): PathRow[] {
  return rows.flatMap(r => { const p = num(r.p); return r.d && p != null ? [{ date: r.d, inflow: num(r.i) ?? 0, outflow: num(r.o) ?? 0, position: p }] : []; });
}

export function pathTraffic(gap: number, cap: Pick<CapacityInput, "generalTry" | "customsTry">): Traffic {
  if (gap <= 0) return "YESIL";
  return gap <= cap.generalTry + cap.customsTry ? "SARI" : "KIRMIZI";
}

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Yolun `until` gününe kadarki (dahil) birikimli akış ve o günün pozisyonu. Yol o güne ulaşmıyorsa null. */
function at(path: PathRow[], until: string, cap: Pick<CapacityInput, "generalTry" | "customsTry">, label: string, days: number): HorizonRow | null {
  const upto = path.filter(r => r.date <= until);
  if (!upto.length || path[path.length - 1].date < until) return null;
  const inflow = upto.reduce((a, r) => a + r.inflow, 0), outflow = upto.reduce((a, r) => a + r.outflow, 0);
  const position = upto[upto.length - 1].position, gap = position < 0 ? -position : 0;
  return { label, days, inflow, outflow, net: inflow - outflow, position, gap, traffic: pathTraffic(gap, cap) };
}

/** 7/30/60/90 günlük ufuklar (yolun ilk günü = bugün). */
export function horizonsFromPath(path: PathRow[], cap: Pick<CapacityInput, "generalTry" | "customsTry">): HorizonRow[] {
  if (!path.length) return [];
  return [7, 30, 60, 90].flatMap(days => at(path, addDays(path[0].date, days), cap, `${days} gün`, days) ?? []);
}

/** Bu ay + 2 ay sonu (bankaların gördüğü bakiye ay sonu bakiyesidir — Alperen kuralı, 24.08). */
export function monthEndsFromPath(path: PathRow[], cap: Pick<CapacityInput, "generalTry" | "customsTry">): MonthEndRow[] {
  if (!path.length) return [];
  const [y, m] = path[0].date.split("-").map(Number);
  return [0, 1, 2].flatMap(i => {
    const eom = new Date(Date.UTC(y, m - 1 + i + 1, 0)), iso = eom.toISOString().slice(0, 10);
    const days = Math.round((eom.getTime() - new Date(`${path[0].date}T00:00:00Z`).getTime()) / 86400000);
    const h = at(path, iso, cap, `${TR_AY[eom.getUTCMonth()]} ${eom.getUTCFullYear()}`, days);
    return h ? [{ ...h, date: new Date(y, m - 1 + i + 1, 0), freeCapacityAfter: cap.generalTry + cap.customsTry - h.gap }] : [];
  });
}

/** Sayfa yükleyicisi: yol + kapasite (motorun `capacity.ts` kapı SQL'iyle aynı). Okunamazsa boş tablolar (UNKNOWN; eski motora düşmez). */
export async function loadCashHorizons(): Promise<{ horizons: HorizonRow[]; monthEnds: MonthEndRow[]; capacityTry: number | null }> {
  const [{ prisma }, { CAPACITY_GATE_SQL }] = await Promise.all([import("@/lib/prisma"), import("@/lib/cfo-agent/capacity")]);
  const q = <T,>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql).catch(() => [] as T[]);
  const [rows, gate] = await Promise.all([q<{ d: string | null; i: unknown; o: unknown; p: unknown }>(CASH_PATH_SQL), q<{ g: unknown; c: unknown }>(CAPACITY_GATE_SQL)]);
  const g = num(gate[0]?.g);
  if (g == null) return { horizons: [], monthEnds: [], capacityTry: null };
  const cap = { generalTry: g, customsTry: num(gate[0]?.c) ?? 0 }, path = toPathRows(rows);
  return { horizons: horizonsFromPath(path, cap), monthEnds: monthEndsFromPath(path, cap), capacityTry: cap.generalTry + cap.customsTry };
}
