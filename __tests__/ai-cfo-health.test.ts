/**
 * CFO alarmları (lib/cfo-agent/health.ts, 2026-10-08: sitede LLM yok) — saf değerlendirme + bildirim kuralı.
 * Çalıştır: node --import tsx __tests__/ai-cfo-health.test.ts
 */
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { nextScheduledPayment, sameBank, type ScheduleRow } from "../lib/cfo/payment-schedule";
import { evaluateCfoAlarms, shouldNotify, unmarkedPaymentsSql, ledgerGapSql, scheduleDuplicateSql, type AlarmInput, type EngineRunInfo } from "../lib/cfo-agent/health";

const now = new Date("2026-10-08T10:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3600000);
const run = (hoursAgo: number, status: string, error: string | null = null): EngineRunInfo => ({ status, generatedAt: h(hoursAgo), finishedAt: h(hoursAgo), error });
const fresh = [{ name: "XML", lastAt: h(5), maxAgeHours: 26 }, { name: "Trendyol", lastAt: h(1), maxAgeHours: 26 }, { name: "Entegra", lastAt: h(70), maxAgeHours: 192 }];
const base = (o: Partial<AlarmInput> = {}): AlarmInput => ({ now, engineEnabled: true, runs: [run(1, "completed"), run(2, "completed")],
  minPosition: { valueTry: -2500000, date: "2026-12-01" }, floorTry: -3000000, payments: [], sources: fresh, staleBankAccounts: [], ...o });
const codes = (i: AlarmInput) => evaluateCfoAlarms(i).map(a => a.code);

assert.deepEqual(codes(base()), [], "sağlıklı: alarm yok — AI çağrısı olmaması alarm DEĞİL (no_insight_24h kaldırıldı)");

// Motor bayat: 20 saattir tamamlanmadı (günde 3 koşu) (koşu var ama hep başarısız ya da hiç yok); motor kapalıyken susar
assert.deepEqual(codes(base({ runs: [run(15, "completed")] })), [], "gece boşluğu (16:07 → 07:17) bayat değil");
assert.deepEqual(codes(base({ runs: [run(21, "completed")] })), ["engine_stale"]);
assert.deepEqual(codes(base({ runs: [] })), ["engine_stale"]);
assert.deepEqual(codes(base({ runs: [], engineEnabled: false })), [], "motor kapalıyken bayatlık alarmı yok");
// Üst üste iki tamamlanmamış koşu (failed ya da beklenmeyen durum); 'running' sayılmaz
assert.deepEqual(codes(base({ runs: [run(0, "failed", "engine_failed"), run(1, "failed"), run(2, "completed")] })), ["consecutive_failures"]);
assert.deepEqual(codes(base({ runs: [run(0, "running"), run(1, "failed"), run(2, "completed")] })), [], "koşan koşu başarısız sayılmaz");
// Takılmış koşu (CFO-009): 15 dakikadan uzun 'running' → zaman aşımıyla öldü; alarm verir ve ardışık hatada başarısız sayılır
assert.deepEqual(codes(base({ runs: [run(0.5, "running"), run(1, "completed")] })), ["stuck_run"]);
assert.deepEqual(codes(base({ runs: [run(0.5, "running"), run(1, "failed", "engine_failed"), run(2, "completed")] })), ["stuck_run", "consecutive_failures"]);
assert.deepEqual(codes(base({ runs: [run(0.2, "running"), run(1, "completed")] })), [], "12 dakikalık koşu henüz takılmış değil");
// Taban deliniyor (07.10: −3.379.787)
const floor = evaluateCfoAlarms(base({ minPosition: { valueTry: -3379787, date: "2026-12-01" } }));
assert.equal(floor[0].code, "floor_breach"); assert.match(floor[0].message, /-3\.379\.787 TL \(2026-12-01\).*-3\.000\.000 TL/);
// İşaretlenmemiş ödeme ve ölü kaynaklar (her biri ayrı anahtar)
const pay = evaluateCfoAlarms(base({ payments: [{ label: "Garanti — Kredi 1", amountTry: 60000, due: "2026-10-08" }] }));
assert.deepEqual(pay.map(a => a.key), ["payment_unmarked:Garanti — Kredi 1:2026-10-08"]);
// Defter ↔ takvim boşluğu (CFO-010): aktif kredinin takvimde bekleyen sonraki taksiti yok → ayrı anahtar
const led = evaluateCfoAlarms(base({ staleLedger: [{ label: "Ziraat — Ziraat Kredi 2", amountTry: null, due: "2026-11-10" }] }));
assert.deepEqual(led.map(a => a.key), ["ledger_stale:Ziraat — Ziraat Kredi 2"]);
assert.match(led[0].message, /ödeme takviminde bekleyen sonraki ödeme yok \(defterdeki vade 2026-11-10\).*projeksiyonu bu ödemeyi görmez/);
assert.doesNotMatch(evaluateCfoAlarms(base({ staleLedger: [{ label: "X kart", amountTry: null, due: "" }] }))[0].message, /defterdeki vade/);
// Mükerrer taksit (CFO-010): banka başına tek alarm, aylar mesajda
const dup = evaluateCfoAlarms(base({ scheduleDuplicates: [
  { bank: "Yapı Kredi", month: "2026-11", count: 2, expected: 1, rows: "2026-11-25 33112, 2026-11-28 33277" },
  { bank: "Yapı Kredi", month: "2026-12", count: 2, expected: 1, rows: "2026-12-25 33112, 2026-12-28 33277" }] }));
assert.deepEqual(dup.map(a => a.key), ["schedule_duplicate:Yapı Kredi"]);
assert.match(dup[0].message, /2026-11: 2 satır \/ 1 kredi \(2026-11-25 33112, 2026-11-28 33277\); 2026-12: 2 satır/);

// Takvim ↔ defter eşleşmesi (lib/cfo/payment-schedule.ts; Borçlar sayfası "takvimde sonraki ödeme")
const sch: ScheduleRow[] = [
  { kind: "KREDI_TAKSITI", bank: "Ziraat", description: "Ziraat KGF taksiti", eventDate: "2026-10-21", outflowTry: 51587, isSettled: false },
  { kind: "KREDI_TAKSITI", bank: "Ziraat", description: "Ziraat Kredi 2 — taksit 5", eventDate: "2026-11-10", outflowTry: 29750, isSettled: false },
  { kind: "KREDI_TAKSITI", bank: "Ziraat", description: "Ziraat Kredi 2 — taksit 4", eventDate: "2026-10-06", outflowTry: 29750, isSettled: true },
  { kind: "KART_ODEMESI", bank: null, description: "YAPI KREDI kart asgarisi", eventDate: "2026-10-30", outflowTry: 1000, isSettled: false },
];
assert.equal(nextScheduledPayment(sch, { kind: "KREDI_TAKSITI", bank: "Ziraat", expectedTry: 29750 })?.date.toISOString().slice(0, 10), "2026-11-10", "tutar iki Ziraat kredisini ayırır; ödenmiş satır sayılmaz");
assert.equal(nextScheduledPayment(sch, { kind: "KREDI_TAKSITI", bank: "Ziraat", expectedTry: 51587.41 })?.amountTry, 51587);
assert.equal(nextScheduledPayment(sch, { kind: "KREDI_TAKSITI", bank: "Ziraat", expectedTry: null })?.date.toISOString().slice(0, 10), "2026-10-21");
assert.equal(nextScheduledPayment(sch, { kind: "KREDI_TAKSITI", bank: "Fibabanka", expectedTry: 32793 }), null, "takvimde yok");
assert.equal(nextScheduledPayment(sch, { kind: "KART_ODEMESI", bank: "Yapı Kredi" })?.amountTry, 1000, "Türkçe I/ı katlanır, açıklamadan eşleşir");
assert.equal(sameBank({ bank: "Garanti", description: null }, ""), false);

const dead = evaluateCfoAlarms(base({ sources: [{ name: "XML", lastAt: h(30), maxAgeHours: 26 }, { name: "Trendyol", lastAt: null, maxAgeHours: 26 }, fresh[2]],
  staleBankAccounts: ["Ziraat USD"] }));
assert.deepEqual(dead.map(a => a.key), ["source_dead:XML", "source_dead:Trendyol", "source_dead:banka"]);
assert.match(dead[1].message, /hiç gelmedi/);

// Kapasite (Cowork CFO 2026-10-08): pozisyonun eksisi şirket KMH kapasitesini (genel + amaca bağlı) ilk aştığı gün ve tutar.
// Üretim 08.10: 09.10 −1.768.612 (genel 1.809.300 içinde, 40.688 boşluk), 21.10 −2.924.473 → genel+amaçlı 2.559.300'ü 365.173 aşıyor.
const path = [{ date: "2026-10-09", position: -1768612 }, { date: "2026-10-20", position: -1554437 }, { date: "2026-10-21", position: -2924473 }, { date: "2026-12-01", position: -3593003 }];
const cap = (o: Partial<NonNullable<AlarmInput["capacity"]>> = {}) => evaluateCfoAlarms(base({ capacity: { generalTry: 1809300, customsTry: 750000, personalTry: 1100000, path, ...o } }));
const c1 = cap();
assert.deepEqual(c1.map(a => a.key), ["capacity_breach:company"]);
assert.equal(c1[0].message, "Nakit pozisyonu 2026-10-21'de -2.924.473 TL — şirket KMH kapasitesini (genel 1.809.300 TL + amaca bağlı 750.000 TL) 365.173 TL aşıyor; şahsi hesaplar (1.100.000 TL) gerekiyor");
assert.match(cap({ personalTry: 1000000 })[0].message, /şahsi hesaplar \(1\.000\.000 TL\) dahil FONLANAMIYOR \(en kötü gün 2026-12-01: 33\.703 TL açık\)/);
assert.match(cap({ personalTry: null })[0].message, /şahsi kapasite bilinmiyor/);
// yalnız genel aşılıyorsa: amaca bağlı limit koşullu (gümrük Ziraat'ten ödenirse)
const g1 = cap({ path: [{ date: "2026-10-21", position: -2000000 }] });
assert.deepEqual(g1.map(a => a.key), ["capacity_breach:general"]);
assert.match(g1[0].message, /genel KMH'yi \(1\.809\.300 TL\) 190\.700 TL aşıyor; yalnız gümrük Ziraat'ten ödenirse/);
assert.deepEqual(cap({ path: [{ date: "2026-10-09", position: -1768612 }] }), [], "kapasite içinde: alarm yok");
assert.deepEqual(codes(base({ capacity: null })), [], "kapasite verisi yoksa değerlendirilmez");

// Bildirim: arıza her zaman; yeni alarm; süregelen alarm her koşuda e-posta üretmez; sabah koşusunda (06–10 TR) günlük hatırlatma
const f = evaluateCfoAlarms(base({ minPosition: { valueTry: -3379787, date: "2026-12-01" } }));
assert.equal(shouldNotify([], null, 9), false);
assert.equal(shouldNotify(f, null, 13), true, "ilk kez görülen alarm");
assert.equal(shouldNotify(f, ["floor_breach"], 13), false, "süregelen taban alarmı: e-posta yok (cfo_gun_ozeti'nde görünür)");
assert.equal(shouldNotify(f, ["floor_breach"], 7), true, "07:17 TR sabah koşusu hatırlatır");
assert.equal(shouldNotify(f, ["floor_breach"], 10), true, "gecikmeli sabah koşusu da hatırlatır");
assert.equal(shouldNotify(f, ["floor_breach"], 12), false, "öğle koşusu hatırlatmaz");
assert.equal(shouldNotify(f, ["floor_breach"], 16), false, "akşam koşusu hatırlatmaz");
assert.equal(shouldNotify([...f, ...pay], ["floor_breach"], 13), true, "yeni ödeme alarmı");
assert.equal(shouldNotify(evaluateCfoAlarms(base({ runs: [] })), ["engine_stale"], 13), true, "motor arızası her saat bildirilir");
// SQL (CFO-010 kısım 2): ödeme alarmı yalnız takvimden; defter satırının "ODENDI"si alarmı ne susturur ne de çift alarm üretir.
async function sql() {
  const pg = new PGlite();
  await pg.exec(`create table cfo_cash_event (id text, kind text, bank text, description text, "eventDate" timestamptz, "outflowTry" numeric, "isSettled" boolean);
    create table cfo_loan (bank text, name text, status text, "monthlyPaymentTry" numeric, "nextPaymentDate" timestamptz, "lastInstallmentDate" timestamptz, "currentMonthState" text);
    create table cfo_credit_card (bank text, holder text, "isActive" boolean, "totalDebtTry" numeric, "nextDueDate" timestamptz, "currentMonthState" text);
    insert into cfo_cash_event values
      ('1','KREDI_TAKSITI','Garanti','Garanti ticari kredi taksiti — ODENDI','2026-09-16',129202,true),
      ('2','KREDI_TAKSITI','Garanti','Garanti ticari kredi taksiti (TAHMINI 137.314)','2026-10-16',137314,false),
      ('3','KREDI_TAKSITI','Ziraat','Ziraat KGF taksiti','2026-10-21',51587,false),
      ('4','KREDI_TAKSITI','Ziraat','Ziraat Kredi 2 taksiti — ODENDI','2026-10-06',29750,true),
      ('5','KREDI_TAKSITI','Yapı Kredi','Yapı Kredi kredi taksiti — ayin 25i','2026-10-25',33112,false),
      ('5b','KREDI_TAKSITI','Yapı Kredi','Yapı Kredi kredi taksiti — ayin 25i','2026-11-25',33112,false),
      ('5c','KREDI_TAKSITI','Yapı Kredi','Yapı Kredi taksiti','2026-11-28',33277,false),
      ('6','KART_ODEMESI','Akbank','Akbank Axess ekstre asgarisi','2026-10-22',95510,false),
      ('7','KART_ODEMESI','Enpara','Enpara kart ASGARI — ODENDI','2026-10-02',45014,true),
      ('8','SABIT_GIDER',null,'Kira','2026-10-08',40000,false),
      ('9','TAHSILAT',null,'Trendyol hakedis','2026-10-07',0,false);
    insert into cfo_loan values
      ('Garanti','Ticari kredi','AKTIF',137313.81,'2026-10-16',null,'ODENDI'),
      ('Ziraat','Ziraat KGF / TOBB Nefes Kredisi','AKTIF',51587.41,'2026-10-21',null,'ODENDI'),
      ('Ziraat','Ziraat Kredi 2','AKTIF',29750,'2026-11-10',null,'ODENDI'),
      ('Yapı Kredi','Ticari kredi','AKTIF',33112.46,'2026-10-25',null,'ODENDI'),
      ('Fibabanka','Eski kredi','KAPANDI',10000,'2026-05-01',null,'ODENDI'),
      ('Fibabanka','Bitmiş kredi','AKTIF',10000,'2026-09-01','2026-09-01','ODENDI'),
      ('QNB','Oranı/taksiti bilinmeyen','AKTIF',null,null,null,'TEYIT_EDILMELI');
    insert into cfo_credit_card values
      ('Akbank','Alp',true,397925,'2026-10-22','ODENDI'),
      ('Enpara','Şirket',true,581296,'2026-11-06','ODENDI'),
      ('Garanti','Alp',true,0,'2026-10-15','ODENDI');`);
  const rows = async (q: string) => (await pg.query<{ label: string; due: string | null }>(q)).rows.map(r => `${r.label}|${r.due ?? ""}`);
  // 08.10 sabah: vadesi geçmiş işaretlenmemiş kira; bugün vadeli yok; tahsilat (çıkış 0) sayılmaz; "ODENDI" defter satırları hiç okunmaz
  assert.deepEqual(await rows(unmarkedPaymentsSql("2026-10-09", false)), ["Kira|2026-10-08"]);
  // 16.10 öğleden sonra: Garanti taksiti takvimde bekliyor → tek alarm (defter satırından ikinci alarm yok)
  assert.deepEqual(await rows(unmarkedPaymentsSql("2026-10-16", true)), ["Kira|2026-10-08", "Garanti ticari kredi taksiti (TAHMINI 137.314)|2026-10-16"]);
  assert.deepEqual(await rows(unmarkedPaymentsSql("2026-10-16", false)), ["Kira|2026-10-08"], "bugün vadeli sabah alarm değil");
  // Boşluk: Ziraat Kredi 2'nin bekleyen taksiti yok (KGF satırı tutarla ayrışır); Enpara kartının bekleyen ödemesi yok;
  // QNB taksiti bilinmiyor + takvimde yok. Kapanmış / bitmiş kredi ve borcu 0 kart dışarıda; "Yapı Kredi" (ı) eşleşir.
  assert.deepEqual(await rows(ledgerGapSql("2026-10-09")), ["Enpara Şirket kart|2026-11-06", "QNB — Oranı/taksiti bilinmeyen|", "Ziraat — Ziraat Kredi 2|2026-11-10"]);
  await pg.exec(`insert into cfo_cash_event values ('10','KREDI_TAKSITI','Ziraat',null,'2026-11-10',29750,false)`);
  assert.ok(!(await rows(ledgerGapSql("2026-10-09"))).some(r => r.startsWith("Ziraat")), "taksit takvime girince boşluk kapanır (yapısal bank sütunu, açıklama boş)");
  // Mükerrer: Yapı Kredi Kasım'da 2 satır / 1 kredi; Ziraat Kasım'da 1 satır / 2 kredi (eksik ≠ mükerrer); ufuk dışı sayılmaz
  const dups = (await pg.query<{ bank: string; month: string; count: number; expected: number; rows: string }>(scheduleDuplicateSql("2026-10-09"))).rows;
  assert.deepEqual(dups, [{ bank: "Yapı Kredi", month: "2026-11", count: 2, expected: 1, rows: "2026-11-25 33112, 2026-11-28 33277" }]);
  assert.deepEqual((await pg.query(scheduleDuplicateSql("2026-12-01"))).rows, [], "geçmiş ay ufuk dışında");
  assert.throws(() => ledgerGapSql("2026-10-09'; drop table x; --"), /YYYY-MM-DD/);
  await pg.close();
}

console.log("CFO alarms: engine stale, consecutive failures, floor breach, unmarked payment, dead sources, KMH capacity breach, notify-on-change + morning-slot reminder passed");
sql().then(() => console.log("CFO alarms SQL: payments only from the schedule (no double alarm, ODENDI ignored), ledger↔schedule gaps, duplicate installments passed"),
  e => { console.error(e); process.exit(1); });
