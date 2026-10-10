// KMH KAPASİTE DURUMU — tek kural (CFO-020/CFO-023, RF-019, 2026-10-10). Motorun capacity_breach alarmı (health.ts) ve /cfo "Boş KMH
// kapasitesi" kartı AYNI fonksiyonu kullanır; sayfada ayrı sabit eşik (eskiden 1.500.000 / 750.000 TL) yok.
// Kural: 120 günlük nakit yolu (cfo_nakit_projeksiyon, takvim + tahmini tahsilat) bir gün
//   - şirket kapasitesini (genel KMH + amaca bağlı limit) aşıyorsa → "danger" (şahsi hesaplar / fonlanamaz),
//   - yalnız genel KMH'yi aşıyorsa → "warn" (amaca bağlı limit yalnız gümrük Ziraat'ten ödenirse kapatır),
//   - aşmıyorsa → "ok". Yol ya da limit bilinmiyorsa → "unknown" (yeşil gösterilmez).
// Yol pozisyonu kullanılan KMH'yi zaten içerir → kapasite TAM ticari limittir (CFO-030).
import { prisma } from "@/lib/prisma";

export type PathPoint = { date: string; position: number };
export type CapacityInput = { generalTry: number; customsTry: number; personalTry: number | null; path: PathPoint[] };
export type CapacityStatus = { status: "ok" | "warn" | "danger" | "unknown"; breach: { date: string; positionTry: number; overTry: number; scope: "company" | "general" } | null;
  worst: PathPoint | null };

export function capacityStatus(c: CapacityInput | null): CapacityStatus {
  if (!c || !c.path.length) return { status: "unknown", breach: null, worst: null };
  const { generalTry: g, customsTry: k, path } = c;
  const worst = path.reduce((m, d) => (d.position < m.position ? d : m), path[0]);
  const first = (limit: number) => path.find(d => -d.position > limit);
  const company = first(g + k);
  if (company) return { status: "danger", breach: { date: company.date, positionTry: company.position, overTry: -company.position - g - k, scope: "company" }, worst };
  const general = first(g);
  if (general) return { status: "warn", breach: { date: general.date, positionTry: general.position, overTry: -general.position - g, scope: "general" }, worst };
  return { status: "ok", breach: null, worst };
}

export const CAPACITY_PATH_SQL = `select pozisyon as v, tarih::text as d from cfo_nakit_projeksiyon(120) order by tarih`;
export const CAPACITY_GATE_SQL = `select kmh_limit_try as g, amacli_kmh_try as c from cfo_nakit_kapisi`;
export const CAPACITY_PERSONAL_SQL = `select tutar as t from cfo_kaynak_yeterliligi() where kalem ilike 'Sahsi KMH%' limit 1`;

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function toCapacityInput(path: { v: unknown; d: string | null }[], gate: { g: unknown; c: unknown }[], personal: { t: unknown }[]): CapacityInput | null {
  const pts = path.map(r => ({ date: String(r.d), position: num(r.v) })).filter((r): r is PathPoint => r.position != null);
  const g = num(gate[0]?.g);
  return g != null && pts.length ? { generalTry: g, customsTry: num(gate[0]?.c) ?? 0, personalTry: num(personal[0]?.t), path: pts } : null;
}

/** Sayfa için yükleyici (motorla aynı SQL). Hata → null (durum "unknown"). */
export async function loadCapacity(): Promise<CapacityInput | null> {
  const q = <T,>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql).catch(() => [] as T[]);
  const [path, gate, personal] = await Promise.all([q<{ v: unknown; d: string | null }>(CAPACITY_PATH_SQL), q<{ g: unknown; c: unknown }>(CAPACITY_GATE_SQL), q<{ t: unknown }>(CAPACITY_PERSONAL_SQL)]);
  return toCapacityInput(path, gate, personal);
}
