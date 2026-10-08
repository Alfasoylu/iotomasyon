import { prisma } from "@/lib/prisma";
import { getCfoConfig } from "./config";
import { istanbulPeriod } from "./period";

// Alarm — Cowork CFO'nun iki koşusu (08:00 / 16:49 TR) arasında Alperen'e ulaşan TEK kanal (2026-10-08 mimari kararı).
// Sitede LLM yok: "içgörü yok", bütçe ve token alarmları kaldırıldı (AI çağrısı olmaması normaldir). Alarmlar:
//   engine_stale          deterministik motor 20 saattir tamamlanmadı (günde 3 koşu: en uzun boşluk 16:07 → 07:17 TR ≈ 15 saat + GitHub gecikmesi)
//   consecutive_failures  son iki motor koşusu tamamlanmadı (failed ya da beklenmeyen durum)
//   floor_breach          cfo_nakit_projeksiyon(120) dibi tabanın (−3.000.000) altında
//   payment_unmarked      vadesi bugün olup 15:00 TR sonrası hâlâ işaretlenmemiş ya da vadesi geçmiş ödeme
//   source_dead           Entegra / XML / Trendyol senkronu ya da banka bakiyesi eşik süreden eski
// Bildirim (GitHub işi kırmızı → e-posta) yalnız arıza, YENİ alarm ya da sabah koşusundaki (06:00–10:59 TR) günlük hatırlatmada:
// süregelen bir taban alarmı her koşuda e-posta üretmez; yine de her koşuda cfo_gun_ozeti'nde görünür.

export type AlarmCode = "engine_stale" | "consecutive_failures" | "floor_breach" | "payment_unmarked" | "source_dead";
export type CfoAlarm = { code: AlarmCode; key: string; message: string };
export type EngineRunInfo = { status: string; generatedAt: Date; finishedAt: Date | null; error: string | null };
export type DueItem = { label: string; amountTry: number | null; due: string };
export type SourceAge = { name: string; lastAt: Date | null; maxAgeHours: number };
export type AlarmInput = {
  now: Date; engineEnabled: boolean; runs: EngineRunInfo[];
  minPosition: { valueTry: number | null; date: string | null } | null; floorTry: number;
  payments: DueItem[]; sources: SourceAge[]; staleBankAccounts: string[];
};

export const ENGINE_STALE_HOURS = 20;
/** Günlük hatırlatma penceresi: sabah zamanlanmış koşusu 07:17 TR; GitHub gecikmesi için 11:00'a kadar. */
export const REMINDER_WINDOW_TR = { fromHour: 6, toHour: 11 } as const;
const H = 3600000;
const tl = (v: number) => `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(v))} TL`;

export function evaluateCfoAlarms(i: AlarmInput): CfoAlarm[] {
  const out: CfoAlarm[] = [];
  const finished = i.runs.filter(r => r.status !== "running").sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  const lastOk = finished.find(r => r.status === "completed");
  if (i.engineEnabled) {
    const at = lastOk ? (lastOk.finishedAt ?? lastOk.generatedAt) : null;
    if (!at || i.now.getTime() - at.getTime() > ENGINE_STALE_HOURS * H)
      out.push({ code: "engine_stale", key: "engine_stale", message: `Deterministik motor ${ENGINE_STALE_HOURS} saattir tamamlanmadı; son başarılı koşu: ${at ? at.toISOString() : "hiç"}` });
  }
  const [a, b] = finished;
  if (a && b && a.status !== "completed" && b.status !== "completed")
    out.push({ code: "consecutive_failures", key: "consecutive_failures", message: `Son iki motor koşusu tamamlanmadı: ${[a, b].map(r => `${r.status}${r.error ? ` (${r.error})` : ""}`).join(" · ")}` });
  if (i.minPosition?.valueTry != null && i.minPosition.valueTry < i.floorTry)
    out.push({ code: "floor_breach", key: "floor_breach", message: `Nakit dibi ${tl(i.minPosition.valueTry)}${i.minPosition.date ? ` (${i.minPosition.date})` : ""} — taban ${tl(i.floorTry)} deliniyor` });
  for (const p of i.payments)
    out.push({ code: "payment_unmarked", key: `payment_unmarked:${p.label}:${p.due}`, message: `Vadesi ${p.due} olan ödeme işaretlenmemiş: ${p.label}${p.amountTry != null ? ` · ${tl(p.amountTry)}` : ""}` });
  for (const s of i.sources) {
    const age = s.lastAt ? (i.now.getTime() - s.lastAt.getTime()) / H : null;
    if (age == null || age > s.maxAgeHours)
      out.push({ code: "source_dead", key: `source_dead:${s.name}`, message: `${s.name} verisi ${age == null ? "hiç gelmedi" : `${Math.floor(age)} saattir gelmedi`} (eşik ${s.maxAgeHours} saat)` });
  }
  if (i.staleBankAccounts.length)
    out.push({ code: "source_dead", key: "source_dead:banka", message: `Banka bakiyesi 7 günden eski: ${i.staleBankAccounts.join(", ")}` });
  return out;
}

/** E-posta (503) yalnız: motor arızası, önceki motor koşusunda olmayan YENİ alarm, ya da sabah penceresinde günlük hatırlatma. */
export function shouldNotify(current: CfoAlarm[], previousKeys: string[] | null, hourTr: number): boolean {
  if (!current.length) return false;
  if (current.some(a => a.code === "engine_stale" || a.code === "consecutive_failures")) return true;
  if (hourTr >= REMINDER_WINDOW_TR.fromHour && hourTr < REMINDER_WINDOW_TR.toHour) return true;
  const prev = new Set(previousKeys ?? []);
  return current.some(a => !prev.has(a.key));
}

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export async function loadAlarmInput(now = new Date(), env: Record<string, string | undefined> = process.env): Promise<AlarmInput> {
  const config = getCfoConfig(env);
  const p = istanbulPeriod(now), afternoon = p.minutes >= 15 * 60;
  const today = p.date;
  const q = <T,>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql).catch(() => [] as T[]);
  const [runs, dip, events, loans, cards, xml, ty, entegra, banks] = await Promise.all([
    prisma.cfoRun.findMany({ where: { idempotencyKey: { startsWith: "engine:" }, generatedAt: { gte: new Date(now.getTime() - 48 * H) } }, orderBy: { generatedAt: "desc" }, take: 20,
      select: { status: true, generatedAt: true, finishedAt: true, error: true } }),
    q<{ v: unknown; d: string | null }>(`select pozisyon as v, tarih::text as d from cfo_nakit_projeksiyon(120) order by pozisyon asc limit 1`),
    // Vadesi geçmiş her zaman; bugün vadeli yalnız 15:00 TR sonrası (sabah işaretlenmemiş olması normal).
    q<{ label: string; amount: unknown; due: string }>(`select left(coalesce(description, kind::text), 60) as label, "outflowTry" as amount, "eventDate"::date::text as due
      from cfo_cash_event where not "isSettled" and coalesce("outflowTry", 0) > 0 and "eventDate"::date ${afternoon ? "<=" : "<"} '${today}'::date order by "eventDate" limit 20`),
    afternoon ? q<{ label: string; amount: unknown; due: string }>(`select bank || ' — ' || name as label, "monthlyPaymentTry" as amount, "nextPaymentDate"::date::text as due
      from cfo_loan where status::text = 'AKTIF' and "nextPaymentDate"::date = '${today}'::date and "currentMonthState"::text <> 'ODENDI'`) : Promise.resolve([]),
    afternoon ? q<{ label: string; amount: unknown; due: string }>(`select bank || ' ' || coalesce(holder, '') || ' kart' as label, "minOverrideTry" as amount, "nextDueDate"::date::text as due
      from cfo_credit_card where "isActive" and "nextDueDate"::date = '${today}'::date and "currentMonthState"::text <> 'ODENDI'`) : Promise.resolve([]),
    prisma.xmlSyncLog.findFirst({ where: { status: "SUCCESS" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }).catch(() => null),
    prisma.trendyolSalesRecord.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }).catch(() => null),
    prisma.entegraImportLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
    prisma.cfoBankAccount.findMany({ where: { isActive: true, lastUpdatedAt: { lt: new Date(now.getTime() - 7 * 24 * H) } }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
  ]);
  const due = (r: { label: string; amount: unknown; due: string }) => ({ label: String(r.label).trim(), amountTry: num(r.amount), due: String(r.due) });
  return {
    now, engineEnabled: config.monitorEnabled, runs,
    minPosition: dip[0] ? { valueTry: num(dip[0].v), date: dip[0].d } : null, floorTry: config.cashFloorTry,
    payments: [...events, ...loans, ...cards].map(due),
    // Eşikler: XML ve Trendyol günlük senkron (26 saat); Entegra haftalık yükleme (8 gün = 7 + 1 tolerans).
    sources: [{ name: "XML", lastAt: xml?.completedAt ?? null, maxAgeHours: 26 }, { name: "Trendyol", lastAt: ty?.syncedAt ?? null, maxAgeHours: 26 },
      { name: "Entegra", lastAt: entegra?.createdAt ?? null, maxAgeHours: 8 * 24 }],
    staleBankAccounts: banks.map(b => b.name),
  };
}

export async function loadCfoAlarms(now = new Date()): Promise<CfoAlarm[]> {
  return evaluateCfoAlarms(await loadAlarmInput(now));
}
