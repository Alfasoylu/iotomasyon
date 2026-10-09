import { prisma } from "@/lib/prisma";
import { getCfoConfig } from "./config";
import { readCashFloor } from "./cash-floor";
import { istanbulPeriod } from "./period";
import { LOAN_AMOUNT_TOLERANCE } from "@/lib/cfo/payment-schedule";

// Alarm — Cowork CFO'nun iki koşusu (08:00 / 16:49 TR) arasında Alperen'e ulaşan TEK kanal (2026-10-08 mimari kararı).
// Sitede LLM yok: "içgörü yok", bütçe ve token alarmları kaldırıldı (AI çağrısı olmaması normaldir). Alarmlar:
//   engine_stale          deterministik motor 20 saattir tamamlanmadı (günde 3 koşu: en uzun boşluk 16:07 → 07:17 TR ≈ 15 saat + GitHub gecikmesi)
//   consecutive_failures  son iki motor koşusu tamamlanmadı (failed, takılmış ya da beklenmeyen durum)
//   stuck_run             bir motor koşusu STUCK_RUN_MINUTES'tan uzun süredir 'running' (fonksiyon zaman aşımıyla öldü; CFO-009)
//   floor_breach          cfo_nakit_projeksiyon(120) dibi tabanın altında (taban: cfo_settings.netPositionFloorTry — Goal Engine ile aynı; yoksa AI_CFO_CASH_FLOOR_TRY)
//   payment_unmarked      vadesi bugün olup 15:00 TR sonrası hâlâ işaretlenmemiş ya da vadesi geçmiş ödeme. TEK kaynak: ödeme takvimi
//                         (cfo_cash_event, taksit başına satır + isSettled; /cfo/odemeler'de loglu işaretlenir) — projeksiyonla aynı defter.
//                         cfo_loan/cfo_credit_card."currentMonthState" kullanılmaz: ay dönümünde sıfırlanmıyor, geçen ayın "ODENDI"si bu
//                         ayın taksitini örtüyordu (CFO-010, 08.10: 11 kalemin 10'u) ve takvimle çift alarm üretiyordu.
//   ledger_stale          aktif kredi/kartın takvimde bekleyen sonraki ödemesi yok → projeksiyon o taksiti görmüyor, ödeme alarmı da
//                         çalışmaz (kredi: banka + tutar ±%25 eşleşmesi; kart: banka eşleşmesi). CFO-010 kısım 2.
//   schedule_duplicate    bir bankanın aynı aydaki bekleyen kredi taksiti satırı, o bankadaki aktif kredi sayısından fazla → mükerrer
//                         satır projeksiyonu fazla çıkışla kötüleştiriyor (09.10: Yapı Kredi Kas–Oca 25'i + eski 28'i kaydı, 3 × 33.277 TL)
//   source_dead           Entegra / XML / Trendyol senkronu ya da banka bakiyesi eşik süreden eski
//   capacity_breach       nakit pozisyonu (cfo_nakit_projeksiyon, faizsiz) şirket KMH kapasitesini aşıyor — Cowork CFO sırası
//                         2026-10-08: önce kapasite alarmı, sonra kademeli faiz, en son kuralı faizli dibe bağlama
// Bildirim (GitHub işi kırmızı → e-posta) yalnız arıza, YENİ alarm ya da sabah koşusundaki (06:00–10:59 TR) günlük hatırlatmada:
// süregelen bir taban alarmı her koşuda e-posta üretmez; yine de her koşuda cfo_gun_ozeti'nde görünür.

export type AlarmCode = "engine_stale" | "consecutive_failures" | "stuck_run" | "floor_breach" | "payment_unmarked" | "ledger_stale" | "schedule_duplicate" | "source_dead" | "capacity_breach" | "duty_gap";
export type CfoAlarm = { code: AlarmCode; key: string; message: string };
export type EngineRunInfo = { status: string; generatedAt: Date; finishedAt: Date | null; error: string | null };
export type DueItem = { label: string; amountTry: number | null; due: string };
export type ScheduleDuplicate = { bank: string; month: string; count: number; expected: number; rows: string };
export type SourceAge = { name: string; lastAt: Date | null; maxAgeHours: number };
export type AlarmInput = {
  now: Date; engineEnabled: boolean; runs: EngineRunInfo[];
  minPosition: { valueTry: number | null; date: string | null } | null; floorTry: number;
  payments: DueItem[]; sources: SourceAge[]; staleBankAccounts: string[];
  /** takvimde (cfo_cash_event) bekleyen sonraki ödemesi olmayan aktif kredi/kart (CFO-010) */
  staleLedger?: DueItem[];
  /** banka × ay: bekleyen kredi taksiti satırı > aktif kredi sayısı (CFO-010) */
  scheduleDuplicates?: ScheduleDuplicate[];
  /** KMH kapasitesi ve projeksiyon yolu (cfo_nakit_kapisi + cfo_nakit_projeksiyon(120)); yoksa kapasite alarmı değerlendirilmez */
  capacity?: { generalTry: number; customsTry: number; personalTry: number | null; path: { date: string; position: number }[] } | null;
  /** CFO-026: stoklu ve kayıtlı gümrük %'si yasal yükün (GV + İGV + KDV, cfo_gtip_yuk) DUTY_GAP_POINTS'ten fazla altında kalan ürünler */
  dutyGap?: { count: number; missingTry: number; worst: { sku: string; kayitliPct: number; yasalPct: number } | null } | null;
};
/** Kayıtlı gümrük % yasal yükün bu kadar puan altındaysa maliyet eksik sayılır (yuvarlama/masraf payı toleransı). */
export const DUTY_GAP_POINTS = 5;

export const ENGINE_STALE_HOURS = 20;
/** Motor koşusu ~2 dk sürer; Vercel fonksiyon sınırı 300 sn. Bundan uzun 'running' kalan koşu öldürülmüş sayılır (CFO-009). */
export const STUCK_RUN_MINUTES = 15;
/** Günlük hatırlatma penceresi: sabah zamanlanmış koşusu 07:17 TR; GitHub gecikmesi için 11:00'a kadar. */
export const REMINDER_WINDOW_TR = { fromHour: 6, toHour: 11 } as const;
const H = 3600000;
const tl = (v: number) => `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(v))} TL`;

export function evaluateCfoAlarms(i: AlarmInput): CfoAlarm[] {
  const out: CfoAlarm[] = [];
  // Takılmış koşu (CFO-009): zaman aşımıyla ölen fonksiyon satırı 'running' bırakır; eskiden hiç sayılmıyordu (sessiz arıza).
  const stuckBefore = i.now.getTime() - STUCK_RUN_MINUTES * 60000;
  const runs = i.runs.map(r => r.status === "running" && r.generatedAt.getTime() < stuckBefore ? { ...r, status: "stuck" } : r);
  const stuck = runs.filter(r => r.status === "stuck");
  if (stuck.length) out.push({ code: "stuck_run", key: "stuck_run", message: `${stuck.length} motor koşusu ${STUCK_RUN_MINUTES} dakikadan uzun süredir 'running' — zaman aşımıyla öldü (son: ${stuck[0].generatedAt.toISOString()})` });
  const finished = runs.filter(r => r.status !== "running").sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
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
  // Mükerrer taksit: banka başına tek alarm (aylar birlikte), anahtar bankaya bağlı — her ay yeni e-posta üretmez
  const dupByBank = new Map<string, ScheduleDuplicate[]>();
  for (const d of i.scheduleDuplicates ?? []) dupByBank.set(d.bank, [...(dupByBank.get(d.bank) ?? []), d]);
  for (const [bank, ds] of dupByBank)
    out.push({ code: "schedule_duplicate", key: `schedule_duplicate:${bank}`, message: `${bank}: ödeme takviminde aktif kredi sayısından fazla bekleyen taksit var — ${ds
      .map(d => `${d.month}: ${d.count} satır / ${d.expected} kredi (${d.rows})`).join("; ")}. Mükerrer satır projeksiyonu fazla çıkışla kötüleştirir; fazla olanı /cfo/odemeler'de kapat`});
  for (const l of i.staleLedger ?? [])
    out.push({ code: "ledger_stale", key: `ledger_stale:${l.label}`, message: `${l.label}: ödeme takviminde bekleyen sonraki ödeme yok${l.due ? ` (defterdeki vade ${l.due})` : ""} — takvime ekle; yoksa nakit projeksiyonu bu ödemeyi görmez ve ödeme alarmı çalışmaz` });
  for (const s of i.sources) {
    const age = s.lastAt ? (i.now.getTime() - s.lastAt.getTime()) / H : null;
    if (age == null || age > s.maxAgeHours)
      out.push({ code: "source_dead", key: `source_dead:${s.name}`, message: `${s.name} verisi ${age == null ? "hiç gelmedi" : `${Math.floor(age)} saattir gelmedi`} (eşik ${s.maxAgeHours} saat)` });
  }
  // Kapasite: pozisyonun eksisi = KMH ihtiyacı. Genel KMH her işe; amaca bağlı limit yalnız gümrük Ziraat'ten ödenirse; şahsi
  // hesaplar son çare. İlk aşım günü ve aşım tutarı yazılır (alarm anahtarı günsüz: tarih kayınca yeni e-posta üretmez).
  if (i.capacity) {
    const { generalTry: g, customsTry: c, personalTry: p, path } = i.capacity;
    const first = (limit: number) => path.find(d => -d.position > limit);
    const beyondCompany = first(g + c), beyondGeneral = first(g);
    if (beyondCompany) {
      const worst = path.reduce((m, d) => (d.position < m.position ? d : m), beyondCompany);
      const allTry = g + c + (p ?? 0), personal = p == null ? "şahsi kapasite bilinmiyor" : -worst.position > allTry
        ? `şahsi hesaplar (${tl(p)}) dahil FONLANAMIYOR (en kötü gün ${worst.date}: ${tl(-worst.position - allTry)} açık)` : `şahsi hesaplar (${tl(p)}) gerekiyor`;
      out.push({ code: "capacity_breach", key: "capacity_breach:company", message: `Nakit pozisyonu ${beyondCompany.date}'de ${tl(beyondCompany.position)} — şirket KMH kapasitesini (genel ${tl(g)} + amaca bağlı ${tl(c)}) ${tl(-beyondCompany.position - g - c)} aşıyor; ${personal}` });
    } else if (beyondGeneral) {
      out.push({ code: "capacity_breach", key: "capacity_breach:general", message: `Nakit pozisyonu ${beyondGeneral.date}'de ${tl(beyondGeneral.position)} — genel KMH'yi (${tl(g)}) ${tl(-beyondGeneral.position - g)} aşıyor; yalnız gümrük Ziraat'ten ödenirse amaca bağlı limit (${tl(c)}) kapatır` });
    }
  }
  // Maliyet eksik: kayıtlı gümrük % yasal yükün altında → marj ve stok değeri olduğundan iyi görünür (CFO-026). Anahtar sayısız:
  // süregelen durum her koşuda yeni bildirim üretmez; cfo_gtip_yuk ürün listesini verir.
  if (i.dutyGap && i.dutyGap.count > 0) {
    const w = i.dutyGap.worst;
    out.push({ code: "duty_gap", key: "duty_gap", message: `${i.dutyGap.count} stoklu üründe kayıtlı gümrük % yasal yükün (GV + İGV + KDV) ${DUTY_GAP_POINTS}+ puan altında — stok maliyeti ~${tl(i.dutyGap.missingTry)} eksik${w ? `; en büyük: ${w.sku} (kayıtlı %${w.kayitliPct}, yasal %${w.yasalPct})` : ""} (cfo_gtip_yuk)` });
  }
  if (i.staleBankAccounts.length)
    out.push({ code: "source_dead", key: "source_dead:banka", message: `Banka bakiyesi 7 günden eski: ${i.staleBankAccounts.join(", ")}` });
  return out;
}

/** E-posta (503) yalnız: motor arızası, önceki motor koşusunda olmayan YENİ alarm, ya da sabah penceresinde günlük hatırlatma. */
/** Motor arızası alarmları: her koşuda bildirilir (süregelen olsa da). */
export const ENGINE_ALARM_CODES: readonly AlarmCode[] = ["engine_stale", "consecutive_failures", "stuck_run"];
// alreadySent: aynı zincirde (Vercel cron after(): motor öncesi + sonrası) az önce bildirilmiş anahtarlar — ikinci kez gönderilmez.
export function shouldNotify(current: CfoAlarm[], previousKeys: string[] | null, hourTr: number, alreadySent: readonly string[] = []): boolean {
  const sent = new Set(alreadySent);
  const fresh = current.filter(a => !sent.has(a.key));
  if (!fresh.length) return false;
  if (fresh.some(a => ENGINE_ALARM_CODES.includes(a.code))) return true;
  if (hourTr >= REMINDER_WINDOW_TR.fromHour && hourTr < REMINDER_WINDOW_TR.toHour) return true;
  const prev = new Set(previousKeys ?? []);
  return fresh.some(a => !prev.has(a.key));
}

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Ödeme alarmı (CFO-010): takvimdeki işaretlenmemiş çıkışlar. Vadesi geçmiş her zaman; bugün vadeli yalnız 15:00 TR sonrası. */
export function unmarkedPaymentsSql(today: string, afternoon: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("today must be YYYY-MM-DD");
  return `select left(coalesce(description, kind::text), 60) as label, "outflowTry" as amount, "eventDate"::date::text as due
    from cfo_cash_event where not "isSettled" and coalesce("outflowTry", 0) > 0 and "eventDate"::date ${afternoon ? "<=" : "<"} '${today}'::date
    order by "eventDate" limit 20`;
}

// Banka eşleşmesi lib/cfo/payment-schedule.ts sameBank ile aynı: yapısal `bank` sütunu ya da açıklama; Türkçe I/İ/ı katlanır.
const fold = (x: string) => `lower(translate(${x}, 'İIı', 'iii'))`;
const bankMatch = (b: string) => `(${fold("coalesce(e.bank, '')")} = ${fold(b)} or ${fold("coalesce(e.description, '')")} like '%' || ${fold(b)} || '%')`;

/** CFO-026: kayıtlı gümrük % < yasal yük − DUTY_GAP_POINTS olan stoklu ürünler — sayı, eksik stok maliyeti, en büyük etki. */
export function dutyGapSql(): string {
  return `with g as (select sku, kayitli_pct, yasal_yuk_pct, eksik_maliyet_tl from cfo_gtip_yuk
      where kayitli_pct is not null and yasal_yuk_pct is not null and stok > 0 and kayitli_pct < yasal_yuk_pct - ${DUTY_GAP_POINTS})
    select count(*)::int as n, coalesce(sum(eksik_maliyet_tl), 0) as t,
      (select sku from g order by eksik_maliyet_tl desc limit 1) as sku,
      (select kayitli_pct from g order by eksik_maliyet_tl desc limit 1) as k,
      (select yasal_yuk_pct from g order by eksik_maliyet_tl desc limit 1) as y
    from g`;
}

/** Mükerrer taksit (CFO-010): projeksiyon ufkunda (120 gün) banka × ay bekleyen KREDI_TAKSITI satırı > o bankadaki aktif kredi. */
export function scheduleDuplicateSql(today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("today must be YYYY-MM-DD");
  return `with ev as (
      select coalesce(e.bank, '?') as bank, to_char(e."eventDate", 'YYYY-MM') as month, count(*)::int as n,
             string_agg(to_char(e."eventDate", 'YYYY-MM-DD') || ' ' || round(e."outflowTry")::text, ', ' order by e."eventDate") as rows
        from cfo_cash_event e
       where not e."isSettled" and e.kind::text = 'KREDI_TAKSITI' and coalesce(e."outflowTry", 0) > 0
         and e."eventDate"::date between '${today}'::date and '${today}'::date + 120
       group by 1, 2),
    cap as (select l.bank, count(*)::int as n from cfo_loan l
             where l.status::text = 'AKTIF' and (l."lastInstallmentDate" is null or l."lastInstallmentDate"::date >= '${today}'::date) group by 1)
    select ev.bank, ev.month, ev.n as count, coalesce(cap.n, 0) as expected, ev.rows
      from ev left join cap on ${fold("cap.bank")} = ${fold("ev.bank")}
     where ev.n > coalesce(cap.n, 0) order by ev.bank, ev.month`;
}

/** Defter ↔ takvim boşluğu (CFO-010): takvimde bekleyen sonraki ödemesi olmayan aktif kredi/kart. Vadesi geçmiş bekleyen satır da sayılır
 *  (o zaten payment_unmarked verir). Bitmiş kredi (son taksit tarihi geçmiş) ve borcu 0 olan kart dışarıda. */
export function ledgerGapSql(today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("today must be YYYY-MM-DD");
  return `select l.bank || ' — ' || l.name as label, null as amount, l."nextPaymentDate"::date::text as due
      from cfo_loan l
     where l.status::text = 'AKTIF' and (l."lastInstallmentDate" is null or l."lastInstallmentDate"::date >= '${today}'::date)
       and not exists (select 1 from cfo_cash_event e
                        where e.kind::text = 'KREDI_TAKSITI' and not e."isSettled" and ${bankMatch("l.bank")}
                          and (l."monthlyPaymentTry" is null or abs(e."outflowTry" - l."monthlyPaymentTry") <= ${LOAN_AMOUNT_TOLERANCE} * l."monthlyPaymentTry"))
    union all
    select c.bank || ' ' || coalesce(c.holder, '') || ' kart' as label, null as amount, c."nextDueDate"::date::text as due
      from cfo_credit_card c
     where c."isActive" and coalesce(c."totalDebtTry", 1) > 0
       and not exists (select 1 from cfo_cash_event e
                        where e.kind::text = 'KART_ODEMESI' and not e."isSettled" and ${bankMatch("c.bank")})
    order by label`;
}

export async function loadAlarmInput(now = new Date(), env: Record<string, string | undefined> = process.env): Promise<AlarmInput> {
  const config = getCfoConfig(env);
  const p = istanbulPeriod(now), afternoon = p.minutes >= 15 * 60;
  const today = p.date;
  const q = <T,>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql).catch(() => [] as T[]);
  const [floor, runs, dip, events, xml, ty, entegra, banks, gate, personal, gaps, dups, duty] = await Promise.all([
    readCashFloor(config.cashFloorTry),
    prisma.cfoRun.findMany({ where: { idempotencyKey: { startsWith: "engine:" }, generatedAt: { gte: new Date(now.getTime() - 48 * H) } }, orderBy: { generatedAt: "desc" }, take: 20,
      select: { status: true, generatedAt: true, finishedAt: true, error: true } }),
    q<{ v: unknown; d: string | null }>(`select pozisyon as v, tarih::text as d from cfo_nakit_projeksiyon(120) order by tarih`),
    q<{ label: string; amount: unknown; due: string }>(unmarkedPaymentsSql(today, afternoon)),
    prisma.xmlSyncLog.findFirst({ where: { status: "SUCCESS" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }).catch(() => null),
    prisma.trendyolSalesRecord.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }).catch(() => null),
    prisma.entegraImportLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
    prisma.cfoBankAccount.findMany({ where: { isActive: true, lastUpdatedAt: { lt: new Date(now.getTime() - 7 * 24 * H) } }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
    q<{ g: unknown; c: unknown }>(`select bos_kmh_try as g, amacli_kmh_try as c from cfo_nakit_kapisi`),
    q<{ t: unknown }>(`select tutar as t from cfo_kaynak_yeterliligi() where kalem ilike 'Sahsi KMH%' limit 1`),
    q<{ label: string; amount: unknown; due: string }>(ledgerGapSql(today)),
    q<ScheduleDuplicate>(scheduleDuplicateSql(today)),
    // cfo_gtip_yuk (migration 20261009210000) yoksa q() boş döner → alarm değerlendirilmez
    q<{ n: unknown; t: unknown; sku: string | null; k: unknown; y: unknown }>(dutyGapSql()),
  ]);
  const path = dip.map(r => ({ date: String(r.d), position: num(r.v) })).filter((r): r is { date: string; position: number } => r.position != null);
  const low = path.reduce<{ date: string; position: number } | null>((m, d) => (!m || d.position < m.position ? d : m), null);
  const g = num(gate[0]?.g);
  const due = (r: { label: string; amount: unknown; due: string | null }) => ({ label: String(r.label).trim(), amountTry: num(r.amount), due: r.due == null ? "" : String(r.due) });
  return {
    now, engineEnabled: config.monitorEnabled, runs,
    minPosition: low ? { valueTry: low.position, date: low.date } : null, floorTry: floor.floorTry,
    capacity: g != null && path.length ? { generalTry: g, customsTry: num(gate[0]?.c) ?? 0, personalTry: num(personal[0]?.t), path } : null,
    payments: events.map(due),
    // Eşikler: XML ve Trendyol günlük senkron (26 saat); Entegra haftalık yükleme (8 gün = 7 + 1 tolerans).
    sources: [{ name: "XML", lastAt: xml?.completedAt ?? null, maxAgeHours: 26 }, { name: "Trendyol", lastAt: ty?.syncedAt ?? null, maxAgeHours: 26 },
      { name: "Entegra", lastAt: entegra?.createdAt ?? null, maxAgeHours: 8 * 24 }],
    staleBankAccounts: banks.map(b => b.name),
    staleLedger: gaps.map(due),
    dutyGap: duty[0] ? { count: num(duty[0].n) ?? 0, missingTry: num(duty[0].t) ?? 0,
      worst: duty[0].sku ? { sku: String(duty[0].sku), kayitliPct: num(duty[0].k) ?? 0, yasalPct: num(duty[0].y) ?? 0 } : null } : null,
    scheduleDuplicates: dups.map(d => ({ bank: String(d.bank), month: String(d.month), count: Number(d.count), expected: Number(d.expected), rows: String(d.rows) })),
  };
}

export async function loadCfoAlarms(now = new Date()): Promise<CfoAlarm[]> {
  return evaluateCfoAlarms(await loadAlarmInput(now));
}
