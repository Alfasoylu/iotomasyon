/**
 * PDKS kritik mantık testleri (backlog C5). Ağ/DB GEREKTİRMEZ.
 * Çalıştır: npm run check:pdks
 *
 * Kapsam: saat dilimi · geofence · otomatik çıkış · izin çakışması.
 *
 * NEDEN BU DÖRDÜ: hepsi sessiz hata üretir ve hepsi PARAYA dokunur.
 * Saat kayması puantajı, otomatik çıkış çalışılan saati, geofence giriş
 * hakkını, izin çakışması izin bakiyesini bozar — hiçbiri ekrana hata
 * basmaz, aylar sonra bordroda fark edilir.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { distanceMeters, workDateTR, currentTimeTR } from "@/lib/pdks/geo";
import { toMinutes, trTimeOnDateToUtc, TR_OFFSET_MIN } from "@/lib/pdks/tr-time";
import { geofenceVerdict, nearestSite, isAbnormalCheckInHour } from "@/lib/pdks/geofence";
import { checkoutAction, AUTO_CHECKOUT_DELAY_MIN } from "@/lib/pdks/checkout-rules";
import { rangesOverlap, findOverlappingLeave } from "@/lib/pdks/leave-overlap";
import {
  DEFAULT_WEEK_SCHEDULE,
  parseWeekSchedule,
  resolveExpected,
  isValidWeekSchedule,
} from "@/lib/pdks/schedule";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  OK   ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.message : e}`);
  }
}
const gun = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

console.log("\nPDKS kritik mantık testleri (C5)\n");
console.log("— Saat dilimi (TR = UTC+3, yaz saati yok) —");

check("workDateTR: TR günü UTC gününden ileri olabilir", () => {
  // 21:30 UTC = 00:30 TR (ertesi gün). Gün yanlış seçilirse giriş/çıkış
  // YANLIŞ GÜNE yazılır ve o günün puantajı boş görünür.
  assert.equal(workDateTR(new Date("2026-09-17T21:30:00Z")).toISOString(), "2026-09-18T00:00:00.000Z");
  assert.equal(workDateTR(new Date("2026-09-17T20:59:59Z")).toISOString(), "2026-09-17T00:00:00.000Z");
  assert.equal(workDateTR(new Date("2026-09-17T21:00:00Z")).toISOString(), "2026-09-18T00:00:00.000Z");
});

check("workDateTR: her zaman UTC gece-yarısı (@db.Date ile eşleşir)", () => {
  for (const t of ["2026-01-01T03:00:00Z", "2026-06-30T12:34:56Z", "2026-12-31T23:59:59Z"]) {
    const d = workDateTR(new Date(t));
    assert.equal(d.getUTCHours(), 0, t);
    assert.equal(d.getUTCMinutes(), 0, t);
    assert.equal(d.getUTCSeconds(), 0, t);
  }
});

check("currentTimeTR: 24 saat biçimi, gece yarısı 00:xx (24:xx DEĞİL)", () => {
  // "24:30" dönerse toMinutes null verir ve hatırlatma/otomatik çıkış O TURDA
  // HİÇ çalışmaz — sessizce. (Aynı tuzağa WhatsApp zamanlayıcısında düşülmüştü.)
  assert.equal(currentTimeTR(new Date("2026-09-17T21:30:00Z")), "00:30");
  assert.equal(currentTimeTR(new Date("2026-09-17T21:00:00Z")), "00:00");
  assert.equal(currentTimeTR(new Date("2026-09-17T06:30:00Z")), "09:30");
  assert.notEqual(currentTimeTR(new Date("2026-09-17T21:00:00Z")).slice(0, 2), "24");
});

check("yaz saati YOK: Ocak ve Temmuz aynı kaydırmayı verir", () => {
  // TR 2016'dan beri sabit UTC+3. Bir gün yaz saati geri gelirse bu test
  // kırılır ve TR_OFFSET_MIN sabiti gözden geçirilir.
  assert.equal(currentTimeTR(new Date("2026-01-15T09:00:00Z")), "12:00");
  assert.equal(currentTimeTR(new Date("2026-07-15T09:00:00Z")), "12:00");
  assert.equal(TR_OFFSET_MIN, 180);
});

check("trTimeOnDateToUtc: TR yerel saat → doğru UTC instant", () => {
  // 18:30 TR = 15:30 UTC. Kaydırma ters uygulanırsa çıkış 3 saat kayar,
  // yani her kayıtta 6 saatlik fark: doğrudan maaş hatası.
  assert.equal(trTimeOnDateToUtc(gun("2026-09-17"), "18:30")!.toISOString(), "2026-09-17T15:30:00.000Z");
  assert.equal(trTimeOnDateToUtc(gun("2026-09-17"), "08:30")!.toISOString(), "2026-09-17T05:30:00.000Z");
  // Gece yarısından önceki saatler önceki UTC gününe düşer — beklenen davranış.
  assert.equal(trTimeOnDateToUtc(gun("2026-09-17"), "01:00")!.toISOString(), "2026-09-16T22:00:00.000Z");
});

check("toMinutes: geçersiz saat REDDEDİLİR (eski kopya '25:99'u kabul ediyordu)", () => {
  assert.equal(toMinutes("08:30"), 510);
  assert.equal(toMinutes("8:30"), 510);
  assert.equal(toMinutes("00:00"), 0);
  assert.equal(toMinutes("23:59"), 1439);
  for (const bad of ["25:00", "12:60", "24:00", "abc", "", null, undefined, "12:5", "1230"]) {
    assert.equal(toMinutes(bad as string), null, `girdi: ${String(bad)}`);
  }
});

console.log("\n— Geofence (karar DAİMA sunucuda) —");

const SANTIYE = {
  id: "s1",
  name: "Merkez",
  latitude: 41.0082,
  longitude: 28.9784,
  radiusMeters: 150,
  maxAccuracyMeters: 50,
};

check("distanceMeters: bilinen mesafe (İstanbul–Ankara ≈ 350 km)", () => {
  const d = distanceMeters(41.0082, 28.9784, 39.9334, 32.8597);
  assert.ok(d > 340_000 && d < 360_000, `${Math.round(d)} m`);
  assert.equal(Math.round(distanceMeters(41.0082, 28.9784, 41.0082, 28.9784)), 0);
  // Simetrik olmalı — değilse hangi noktanın şantiye olduğu sonucu değiştirir.
  assert.equal(
    Math.round(distanceMeters(41.0082, 28.9784, 39.9334, 32.8597)),
    Math.round(distanceMeters(39.9334, 32.8597, 41.0082, 28.9784))
  );
});

check("distanceMeters: küçük mesafede makul (~100 m)", () => {
  // 0.0009° enlem ≈ 100 m. Yarıçap kararı bu ölçekte veriliyor.
  const d = distanceMeters(41.0082, 28.9784, 41.0091, 28.9784);
  assert.ok(d > 90 && d < 110, `${Math.round(d)} m`);
});

check("nearestSite: EN YAKIN şantiye seçilir (ilk değil)", () => {
  const uzak = { ...SANTIYE, id: "uzak", latitude: 39.9334, longitude: 32.8597 };
  const r = nearestSite(41.0083, 28.9785, [uzak, SANTIYE])!;
  assert.equal(r.site.id, "s1", "listenin ilk elemanı seçildi → yanlış şantiyenin yarıçapı uygulanır");
});

check("şantiyeye atanmamış personel reddedilir", () => {
  const v = geofenceVerdict({ lat: 41.0082, lng: 28.9784, accuracy: 10, sites: [] });
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.reason, "santiye-yok");
});

check("DOĞRULUK kapısı mesafeden ÖNCE uygulanır", () => {
  // Tam şantiyede ama accuracy 500 m: konum güvenilmez.
  const icinde = geofenceVerdict({ lat: 41.0082, lng: 28.9784, accuracy: 500, sites: [SANTIYE] });
  assert.equal(icinde.ok === false && icinde.reason, "dogruluk-yetersiz");

  // ⚠️ SIRAYI GERÇEKTEN sınayan durum: İKİSİ de başarısız (hem uzak hem
  // doğruluğu kötü). Yalnız şantiyenin üstündeki noktayla test etmek yetmiyor
  // — orada mesafe kapısı zaten geçtiği için sıra değişse de sonuç aynı çıkıyor
  // ve test mutasyonu kaçırıyordu (bu tam olarak yaşandı).
  const hem = geofenceVerdict({ lat: 41.05, lng: 28.9784, accuracy: 500, sites: [SANTIYE] });
  assert.equal(
    hem.ok === false && hem.reason,
    "dogruluk-yetersiz",
    "mesafe kapısı önce çalışıyor: ±500 m hatayla gelen konum 'uzakta' diye " +
      "reddediliyor, ama asıl sebep konumun güvenilmez olması — kullanıcıya " +
      "yanlış yönlendirme gider ('yaklaşın' yerine 'açık alana çıkın' denmeli)"
  );
});

check("yarıçap sınırı: içeride kabul, dışarıda ret", () => {
  const icinde = geofenceVerdict({ lat: 41.0091, lng: 28.9784, accuracy: 10, sites: [SANTIYE] }); // ~100 m
  assert.equal(icinde.ok, true);
  const disinda = geofenceVerdict({ lat: 41.0100, lng: 28.9784, accuracy: 10, sites: [SANTIYE] }); // ~200 m
  assert.equal(disinda.ok === false && disinda.reason, "uzakta");
});

check("accuracy bildirilmezse doğruluk kapısı uygulanmaz, mesafe yine bakılır", () => {
  const v = geofenceVerdict({ lat: 41.0082, lng: 28.9784, accuracy: null, sites: [SANTIYE] });
  assert.equal(v.ok, true);
  const u = geofenceVerdict({ lat: 41.05, lng: 28.9784, accuracy: undefined, sites: [SANTIYE] });
  assert.equal(u.ok === false && u.reason, "uzakta");
});

check("eşik değerleri: tam sınır KABUL edilir", () => {
  // accuracy == maxAccuracy ve mesafe == radius sınırda kabul (">" kullanılıyor).
  const v = geofenceVerdict({ lat: 41.0082, lng: 28.9784, accuracy: 50, sites: [SANTIYE] });
  assert.equal(v.ok, true, "accuracy tam eşikte reddediliyor");
});

check("olağandışı giriş saati: 18:00–05:00", () => {
  for (const t of ["18:00", "21:30", "00:30", "04:59"]) {
    assert.equal(isAbnormalCheckInHour(t), true, t);
  }
  for (const t of ["05:00", "08:30", "17:59"]) {
    assert.equal(isAbnormalCheckInHour(t), false, t);
  }
});

console.log("\n— Otomatik çıkış —");

const bugun = gun("2026-09-17"); // Perşembe
const CIKIS = 18 * 60 + 30; // 18:30

check("çıkış saati gelmeden dokunulmaz", () => {
  assert.equal(
    checkoutAction({ workDate: bugun, today: bugun, expectedOutMin: CIKIS, nowMinTR: CIKIS - 1, reminded: false }),
    "bekle"
  );
});

check("çıkış geçti + süre dolmadı → tek sefer hatırlat", () => {
  assert.equal(
    checkoutAction({ workDate: bugun, today: bugun, expectedOutMin: CIKIS, nowMinTR: CIKIS + 1, reminded: false }),
    "hatirlat"
  );
  // Zaten hatırlatıldıysa TEKRAR gönderilmez — her 5 dakikada bildirim spam'i olurdu.
  assert.equal(
    checkoutAction({ workDate: bugun, today: bugun, expectedOutMin: CIKIS, nowMinTR: CIKIS + 1, reminded: true }),
    "hatirlatildi"
  );
});

check(`süre dolunca (+${AUTO_CHECKOUT_DELAY_MIN} dk) otomatik çıkış`, () => {
  assert.equal(AUTO_CHECKOUT_DELAY_MIN, 15);
  // Tam eşikte kapanır: 14 dk hatırlat, 15 dk kapat.
  assert.equal(
    checkoutAction({ workDate: bugun, today: bugun, expectedOutMin: CIKIS, nowMinTR: CIKIS + 14, reminded: true }),
    "hatirlatildi"
  );
  assert.equal(
    checkoutAction({ workDate: bugun, today: bugun, expectedOutMin: CIKIS, nowMinTR: CIKIS + 15, reminded: true }),
    "otomatik-cikis"
  );
});

check("geçmiş güne ait açık kayıt sessizce kapatılır", () => {
  // "Şu an"la kıyaslamak yanlış: dünün 18:30'u bugünün dakikasıyla
  // karşılaştırılırsa sabah 09:00'da "henüz çıkış saati gelmedi" denir ve
  // kayıt sonsuza dek açık kalır.
  assert.equal(
    checkoutAction({ workDate: gun("2026-09-16"), today: bugun, expectedOutMin: CIKIS, nowMinTR: 9 * 60, reminded: false }),
    "gecmis-gun-kapat"
  );
});

check("tatil günü: sistem karışmaz (hangi saate kapatacağı bilinemez)", () => {
  assert.equal(
    checkoutAction({ workDate: bugun, today: bugun, expectedOutMin: null, nowMinTR: 23 * 60, reminded: false }),
    "tatil"
  );
  // Geçmiş gün + tatil de kapatılmaz: beklenen çıkış yok.
  assert.equal(
    checkoutAction({ workDate: gun("2026-09-13"), today: bugun, expectedOutMin: null, nowMinTR: 600, reminded: false }),
    "tatil"
  );
});

console.log("\n— Haftalık program —");

check("Pazar tatil, Cumartesi yarım gün", () => {
  assert.equal(resolveExpected(DEFAULT_WEEK_SCHEDULE, gun("2026-09-20")), null); // Pazar
  assert.deepEqual(resolveExpected(DEFAULT_WEEK_SCHEDULE, gun("2026-09-19")), { in: "08:30", out: "13:00" }); // Cumartesi
  assert.deepEqual(resolveExpected(DEFAULT_WEEK_SCHEDULE, gun("2026-09-17")), { in: "08:30", out: "18:30" }); // Perşembe
});

check("personel override programı ezer; resmi tatil her şeyi ezer", () => {
  assert.deepEqual(resolveExpected(DEFAULT_WEEK_SCHEDULE, gun("2026-09-17"), "09:00", "19:00"), {
    in: "09:00",
    out: "19:00",
  });
  // Boş string override SAYILMAZ (programa düşer) — aksi hâlde beklenen saat
  // boşalır ve otomatik çıkış hiç çalışmaz.
  assert.deepEqual(resolveExpected(DEFAULT_WEEK_SCHEDULE, gun("2026-09-17"), "", ""), {
    in: "08:30",
    out: "18:30",
  });
  const tatil = new Set(["2026-09-17"]);
  assert.equal(resolveExpected(DEFAULT_WEEK_SCHEDULE, gun("2026-09-17"), "09:00", "19:00", tatil), null);
});

check("bozuk program JSON varsayılana düşer (çökmez)", () => {
  assert.deepEqual(parseWeekSchedule("{bozuk"), DEFAULT_WEEK_SCHEDULE);
  assert.deepEqual(parseWeekSchedule(null), DEFAULT_WEEK_SCHEDULE);
  assert.deepEqual(parseWeekSchedule("[]"), DEFAULT_WEEK_SCHEDULE); // 7 eleman değil
  assert.equal(isValidWeekSchedule([null, null, null, null, null, null, null]), true);
  assert.equal(isValidWeekSchedule([{ in: "25:00", out: "18:30" }, null, null, null, null, null, null]), false);
});

console.log("\n— İzin çakışması —");

const izin = (s: string, e: string, status = "approved", id = s) => ({
  id,
  startDate: gun(s),
  endDate: gun(e),
  status,
});

check("uç uca değen aralıklar ÇAKIŞIR (aynı gün iki izin olamaz)", () => {
  assert.equal(rangesOverlap(gun("2026-09-10"), gun("2026-09-12"), gun("2026-09-12"), gun("2026-09-14")), true);
  assert.equal(rangesOverlap(gun("2026-09-10"), gun("2026-09-12"), gun("2026-09-13"), gun("2026-09-14")), false);
});

check("içine alan / içinde kalan / kısmi kesişen aralıklar yakalanır", () => {
  const mevcut = [izin("2026-09-10", "2026-09-20")];
  for (const [s, e] of [
    ["2026-09-12", "2026-09-15"], // içinde
    ["2026-09-05", "2026-09-25"], // kapsıyor
    ["2026-09-08", "2026-09-11"], // baştan kesişiyor
    ["2026-09-19", "2026-09-22"], // sondan kesişiyor
  ]) {
    assert.ok(
      findOverlappingLeave(mevcut, { startDate: gun(s), endDate: gun(e) }),
      `${s}–${e} çakışması kaçtı`
    );
  }
  assert.equal(findOverlappingLeave(mevcut, { startDate: gun("2026-09-21"), endDate: gun("2026-09-22") }), null);
});

check("bekleyen izin de ENGELLER; reddedilen/iptal engellemez", () => {
  const aday = { startDate: gun("2026-09-12"), endDate: gun("2026-09-13") };
  assert.ok(findOverlappingLeave([izin("2026-09-10", "2026-09-14", "pending")], aday));
  assert.equal(findOverlappingLeave([izin("2026-09-10", "2026-09-14", "rejected")], aday), null);
  assert.equal(findOverlappingLeave([izin("2026-09-10", "2026-09-14", "cancelled")], aday), null);
  // Durum büyük harfle gelirse de engellemeli (veri kaynağı karışık olabilir).
  assert.ok(findOverlappingLeave([izin("2026-09-10", "2026-09-14", "APPROVED")], aday));
});

check("düzenlemede kayıt KENDİSİYLE çakışmaz", () => {
  const mevcut = [izin("2026-09-10", "2026-09-14", "approved", "L1")];
  assert.ok(findOverlappingLeave(mevcut, { startDate: gun("2026-09-11"), endDate: gun("2026-09-13") }));
  assert.equal(
    findOverlappingLeave(mevcut, { startDate: gun("2026-09-11"), endDate: gun("2026-09-13") }, "L1"),
    null
  );
});

console.log("\n— Bağlar: uçlar bu mantığı GERÇEKTEN kullanıyor mu —");

const oku = (p: string) => readFileSync(p, "utf8");

check("check-in ve check-out AYNI geofence kararını kullanıyor", () => {
  for (const p of ["app/api/pdks/check-in/route.ts", "app/api/pdks/check-out/route.ts"]) {
    assert.match(oku(p), /geofenceVerdict\(/, `${p}: kural yerinde kopyalanmış`);
  }
});

check("cron otomatik çıkış kararını lib'den alıyor", () => {
  const s = oku("app/api/pdks/cron/reminders/route.ts");
  assert.match(s, /checkoutAction\(/, "karar yine route içinde gömülü (test edilemez)");
  assert.doesNotMatch(s, /const AUTO_CHECKOUT_DELAY_MIN = /, "eşik iki yerde tanımlı");
});

check("izin çakışması İKİ yolda da kontrol ediliyor (personel + admin)", () => {
  for (const p of ["app/api/pdks/leave/route.ts", "lib/actions/pdks-admin-actions.ts"]) {
    assert.match(oku(p), /findOverlappingLeave\(/, `${p}: çakışma kontrolü yok`);
  }
});

check("saf modüllere prisma/server-only SIZMAMIŞ (yoksa test edilemez olurlar)", () => {
  for (const p of [
    "lib/pdks/tr-time.ts",
    "lib/pdks/geofence.ts",
    "lib/pdks/checkout-rules.ts",
    "lib/pdks/leave-overlap.ts",
    "lib/pdks/schedule.ts",
    "lib/pdks/geo.ts",
  ]) {
    const s = oku(p);
    assert.doesNotMatch(s, /^import "server-only"/m, `${p}: server-only eklenmiş → testler patlar`);
    assert.doesNotMatch(s, /from "\.\/prisma"|@\/lib\/prisma/, `${p}: DB erişimi eklenmiş → saf değil`);
  }
});

console.log(failed === 0 ? "\n✅ PDKS mantık testleri gecti\n" : `\n❌ ${failed} test BASARISIZ\n`);
process.exit(failed === 0 ? 0 : 1);
