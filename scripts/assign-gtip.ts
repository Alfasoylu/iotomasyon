/**
 * GTİP otomatik atama scripti
 *
 * Her ürüne 1-3 muhtemel GTİP kodu atar. Strateji:
 *   1) Kategori bazlı varsayılan GTİP seti (en yaygın fasıl/pozisyon)
 *   2) Ürün adı regex'i ile spesifikleştirme (override)
 *   3) Eksik kalan slot'lar null
 *
 * Atamalar "muhtemel" — gümrük müşaviriyle kesinleşmeli. Format: XX.XX.XX.XX.XX
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/assign-gtip.ts          # dry-run
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/assign-gtip.ts --apply
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: cs! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

const TR_MAP: Record<string, string> = {
  "ş":"s","Ş":"s","ğ":"g","Ğ":"g","ç":"c","Ç":"c",
  "ü":"u","Ü":"u","ö":"o","Ö":"o","ı":"i","İ":"i",
};
function normalize(s: string): string {
  return s.replace(/[şŞğĞçÇüÜöÖıİ]/g, (c) => TR_MAP[c] ?? c).toLowerCase();
}

type GtipSet = [string, string?, string?];

const CATEGORY_DEFAULTS: Record<string, GtipSet> = {
  "cctv-kamera-sistemleri":       ["85.25.81.99.00", "85.25.89.00.00", "85.17.62.00.00"],
  "akilli-ev-iot-otomasyon":      ["85.36.50.19.00", "85.31.10.95.00", "83.01.40.90.00"],
  "elektronik-modul-gelistirme":  ["85.43.70.90.00", "85.42.31.90.00", "85.37.10.99.00"],
  "olcum-test-cihazlari":         ["90.30.33.00.00", "90.30.20.00.00", "90.25.80.40.00"],
  "metal-dedektoru":              ["90.15.80.91.00", "85.31.10.95.00"],
  "guc-kaynagi-donusturucu":      ["85.04.40.55.00", "85.04.40.30.00", "85.04.40.84.00"],
  "motor-rc-surucu":              ["85.01.10.99.00", "85.04.40.84.00", "85.01.31.00.00"],
  "cnc-lazer-3d-printer":         ["84.79.89.97.00", "84.66.93.60.00", "84.85.10.00.00"],
  "bilgisayar-cevre-baglanti":    ["84.71.80.00.00", "85.44.42.90.00", "85.17.62.00.00"],
  "bilgisayar-donanim-sogutucu":  ["84.71.70.50.00", "84.71.30.00.00", "84.73.30.20.00"],
  "telefon-tablet-aksesuar":      ["85.17.71.00.00", "85.04.40.84.00", "39.26.90.97.00"],
  "gaming-konsol-aksesuar":       ["95.04.50.00.00", "85.28.71.19.00", "84.71.60.70.00"],
  "audio-amfi-hoparlor":          ["85.18.40.30.00", "85.18.22.90.00", "85.18.30.20.00"],
  "aydinlatma-led":               ["94.05.42.31.00", "85.39.52.00.00", "94.05.10.40.00"],
  "banyo-mutfak-bataryasi":       ["84.81.80.11.00", "73.24.10.00.00", "84.81.80.19.00"],
  "su-aritma-pompa-akvaryum":     ["84.13.70.81.00", "84.21.21.00.00", "84.14.80.80.00"],
  "el-aleti-lehim":               ["85.15.11.00.00", "82.05.59.80.00", "82.03.20.00.00"],
  "tesettur-kadin-giyim":         ["62.04.43.00.00", "62.06.40.00.00", "42.02.22.10.00"],
  "spor-fitness":                 ["95.06.91.90.00", "95.06.99.90.00", "95.06.62.00.00"],
  "kisisel-bakim-saglik":         ["85.10.10.00.00", "90.19.10.10.00", "84.24.89.00.00"],
  "kamp-outdoor-mobilite":        ["63.06.22.00.00", "87.14.95.00.00", "73.21.11.10.00"],
  "telsiz-haberlesme":            ["85.25.60.00.00", "85.26.91.20.00", "85.17.62.00.00"],
  "arac-diagnostik-aksesuar":     ["90.31.80.34.00", "85.12.30.10.00", "87.08.99.97.00"],
  "ev-esyasi-kirtasiye-dekoratif":["84.52.10.19.00", "48.23.90.85.00", "94.05.10.40.00"],
  "pil-aku":                      ["85.06.10.18.00", "85.07.60.00.00", "85.06.50.10.00"],
};

interface NameRule { pattern: RegExp; gtips: GtipSet }

// Patterns ASCII-normalized (input is also normalized)
const NAME_RULES: NameRule[] = [
  { pattern: /\b(multimetre|pensampermetre|voltmetre|ampermetre|wattmetre)\b/, gtips: ["90.30.33.20.00", "90.30.33.00.00"] },
  { pattern: /\bosiloskop\b/, gtips: ["90.30.20.00.00"] },
  { pattern: /sinyal jenerator|fonksiyon (sinyal|jenerator)/, gtips: ["90.30.84.00.00"] },
  { pattern: /\banemometre\b|ruzgar (hiz|olc)/, gtips: ["90.15.80.91.00"] },
  { pattern: /(luksmetre|isik olc|lux meter|pozometre)/, gtips: ["90.27.50.00.00"] },
  { pattern: /(ph metre|ph olc)/, gtips: ["90.27.80.05.00"] },
  { pattern: /refraktometre|brix (olc|portatif)/, gtips: ["90.27.50.00.00"] },
  { pattern: /(termometre|sicaklik olc)/, gtips: ["90.25.19.20.00", "90.25.80.40.00"] },
  { pattern: /(higrometre|nem olc|odun nem|ahsap nem)/, gtips: ["90.25.80.20.00"] },
  { pattern: /lazer (metre|mesafe)|lazermetre/, gtips: ["90.15.10.00.00"] },
  { pattern: /(kaliper|mikrometre)/, gtips: ["90.17.30.10.00"] },
  { pattern: /(desibel|gurultu olc|ses seviye)/, gtips: ["90.27.80.05.00"] },
  { pattern: /pulse oksimetre|oksimetre/, gtips: ["90.18.19.10.00"] },
  { pattern: /pinpointer|metal dedektor|altin dedektor/, gtips: ["90.15.80.91.00", "85.31.10.95.00"] },
  { pattern: /ip kamera|guvenlik kamera|nvr|dvr.*kamera/, gtips: ["85.25.81.99.00", "85.25.89.00.00"] },
  { pattern: /poe (switch|injector|extender|splitter|repeater)/, gtips: ["85.17.62.00.00"] },
  { pattern: /\b(baofeng|boafeng|telsiz|uv-?\d+|el telsizi)\b/, gtips: ["85.25.60.00.00"] },
  { pattern: /(uydu|sat).{0,15}(yon bulucu|finder)/, gtips: ["85.26.91.20.00"] },
  { pattern: /(4g|5g|gsm).*(guclend|tekrar)/, gtips: ["85.17.69.39.00"] },
  { pattern: /\b(ttlock|smart lock|akilli kapi kilid|parmak izi.*kilid)\b/, gtips: ["83.01.40.90.00"] },
  { pattern: /(akilli|smart) (anahtar|priz|switch)|tuya wifi/, gtips: ["85.36.50.19.00", "85.36.69.90.00"] },
  { pattern: /(akilli|smart|wifi).*(ampul|bulb)/, gtips: ["85.39.52.00.00"] },
  { pattern: /(pir|hareket|sensor|dedektor).*(wifi|tuya|zigbee|smart)/, gtips: ["85.31.10.95.00"] },
  { pattern: /(akilli|smart).*termostat/, gtips: ["90.32.10.81.00"] },
  { pattern: /usb hub|usb (coklayici|cogaltici)/, gtips: ["85.36.69.90.00", "84.71.80.00.00"] },
  { pattern: /(hdmi|displayport|dp|vga|dvi|scart).*(cevirici|adaptor|donusturucu|kablo)/, gtips: ["85.44.42.90.00", "85.43.70.90.00"] },
  { pattern: /(kart okuyucu|sd.*kart|microsd.*kart)/, gtips: ["84.71.80.00.00"] },
  { pattern: /video (capture|yakalama)/, gtips: ["85.43.70.90.00"] },
  { pattern: /kvm.*switch|hdmi splitter/, gtips: ["85.36.50.19.00", "85.43.70.90.00"] },
  { pattern: /(rj45|cat5|cat6|ethernet).*(kablo|cevirici|coupler)/, gtips: ["85.44.42.90.00"] },
  { pattern: /fiber optik|sfp|ftth/, gtips: ["90.01.10.90.00", "85.44.70.00.00"] },
  { pattern: /(usb|type-?c).{0,15}flash bellek/, gtips: ["85.23.51.10.00"] },
  { pattern: /\bssd\b/, gtips: ["84.71.70.50.00"] },
  { pattern: /(rtx|gtx|geforce|radeon).*ekran kart/, gtips: ["84.71.80.00.00", "85.43.70.90.00"] },
  { pattern: /(ddr3|ddr4).*ram/, gtips: ["84.73.30.20.00"] },
  { pattern: /(sarj|type-?c|lightning) kablo/, gtips: ["85.44.42.90.00"] },
  { pattern: /(sarj|hizli sarj).*(adaptor|istasyon)/, gtips: ["85.04.40.84.00"] },
  { pattern: /(magsafe|kilif|kapak)/, gtips: ["39.26.90.97.00", "42.02.99.00.00"] },
  { pattern: /(selfie|tripod|telefon tutucu)/, gtips: ["90.06.30.00.00", "85.17.71.00.00"] },
  { pattern: /apple watch.*kordon/, gtips: ["91.13.20.00.00"] },
  { pattern: /(direksiyon seti|joystick|gamepad|oyun kolu)/, gtips: ["95.04.50.00.00"] },
  { pattern: /android tv box|mxq pro|vontar/, gtips: ["85.28.71.19.00"] },
  { pattern: /retro oyun konsol|atari/, gtips: ["95.04.50.00.00"] },
  { pattern: /gaming mouse|gaming keyboard|optik gaming/, gtips: ["84.71.60.70.00"] },
  { pattern: /amfi|amplifikator|tda74|tpa311|pam861/, gtips: ["85.18.40.30.00"] },
  { pattern: /(bluetooth|kablosuz) (ses alic|hoparlor)/, gtips: ["85.18.22.90.00"] },
  { pattern: /\bkulaklik\b/, gtips: ["85.18.30.20.00"] },
  { pattern: /karaoke mikrofon|usb mikrofon/, gtips: ["85.18.10.95.00"] },
  { pattern: /led ampul|e27.*ampul|akilli ampul/, gtips: ["85.39.52.00.00"] },
  { pattern: /led serit|neon led|rgb led|grow light/, gtips: ["94.05.42.31.00"] },
  { pattern: /led projektor|flood ?light|projektor led/, gtips: ["94.05.40.99.00"] },
  { pattern: /solar (bahce|dis mekan|aydinlatma|led)/, gtips: ["94.05.40.99.00", "85.41.42.00.00"] },
  { pattern: /ring light|studyo isig|selfie led/, gtips: ["94.05.40.99.00"] },
  { pattern: /(lavabo|eviye|evye|mutfak|banyo).*batarya|musluk bataryasi/, gtips: ["84.81.80.11.00", "84.81.80.19.00"] },
  { pattern: /dus seti|ankastre dus|tepe dus/, gtips: ["84.81.80.19.00", "73.24.90.00.00"] },
  { pattern: /klozet|taharet|tuvalet dusu/, gtips: ["84.81.80.61.00"] },
  { pattern: /selale.*(banyo|lavabo|musluk|eviye|evye)/, gtips: ["84.81.80.11.00"] },
  { pattern: /\bsu aritma\b|ro aritma|deposuz/, gtips: ["84.21.21.00.00"] },
  { pattern: /(akvaryum|dalgic|santrifuj).*pompa|su pompasi|hidrofor/, gtips: ["84.13.70.81.00", "84.13.81.00.00"] },
  { pattern: /\bozon (jenerator|generator)/, gtips: ["84.21.39.20.00"] },
  { pattern: /hava temizleyici/, gtips: ["84.21.39.20.00", "85.09.80.00.00"] },
  { pattern: /vakumlu (pompa|hava pompa|sis)/, gtips: ["84.14.10.89.00"] },
  { pattern: /\bhavya\b|lehim potasi|lehim kalemi|soldering/, gtips: ["85.15.11.00.00"] },
  { pattern: /punta.*kaynak|nokta kaynak/, gtips: ["85.15.21.00.00"] },
  { pattern: /(rj45|krone|ez).*(pense|kesme|sikma)/, gtips: ["82.03.20.00.00"] },
  { pattern: /yan keski|elektronikci.*keski/, gtips: ["82.03.20.00.00"] },
  { pattern: /\bcnc\b.*(kart|kontrol|el carki|mach3|nvem)/, gtips: ["85.37.10.99.00"] },
  { pattern: /lazer (kesim|gravur|oyma|kazima).*makin|neje/, gtips: ["84.56.11.10.00", "84.79.89.97.00"] },
  { pattern: /co2 lazer (lens|odak|kafa|ayna)/, gtips: ["90.01.90.00.00", "90.02.90.00.00"] },
  { pattern: /3d (printer|yazici)|skr.*mks|tft\d+.*ekran|3d touch/, gtips: ["84.85.10.00.00", "84.79.89.97.00"] },
  { pattern: /(step motor|servo motor)/, gtips: ["85.01.10.99.00"] },
  { pattern: /bldc.*motor|fircasiz motor.*(surucu|kontrol)/, gtips: ["85.04.40.84.00", "85.01.10.99.00"] },
  { pattern: /\besc\b.*(rc|drone|motor)/, gtips: ["85.04.40.84.00"] },
  { pattern: /(lipo|li-?po).*(sarj|pil|batarya)/, gtips: ["85.07.60.00.00"] },
  { pattern: /drone (motor|fircasiz)/, gtips: ["85.01.10.99.00"] },
  { pattern: /\bdc-?dc\b|buck (cevirici|donusturucu)|voltaj (yukseltici|dusurucu)/, gtips: ["85.04.40.55.00"] },
  { pattern: /\briden\b|dps\d+|programlanabilir.*guc/, gtips: ["85.04.40.84.00"] },
  { pattern: /(bms|batarya koruma|lityum.*koruma)/, gtips: ["85.07.90.30.00"] },
  { pattern: /\binverter\b|frekans donusturucu/, gtips: ["85.04.40.84.00"] },
  { pattern: /(solar sarj|gunes.*sarj)/, gtips: ["85.04.40.84.00"] },
  { pattern: /\b(usbasp|st-?link|ezp|tl866|atmel|avr).*(program|flash)/, gtips: ["85.43.70.90.00"] },
  { pattern: /\barduino\b|\besp32\b|\besp8266\b|nodemcu|raspberry pi|stm32/, gtips: ["85.43.70.90.00"] },
  { pattern: /\bplc\b|(s7-?\d+|fx1n|fx3u|amsamotion)/, gtips: ["85.37.10.99.00"] },
  { pattern: /(rfid|125khz).*kart.*okuyucu/, gtips: ["85.43.70.90.00"] },
  { pattern: /\bcc2531\b|zigbee.*sniffer|hackrf|portapack|sdr/, gtips: ["85.25.50.00.00"] },
  { pattern: /\boled\b.*(ekran|display)|grafik lcd/, gtips: ["85.31.20.20.00"] },
  { pattern: /\btesettur\b|tunik|ferace|pardesu/, gtips: ["62.04.43.00.00"] },
  { pattern: /elbise.*kadin|kadin.*elbise/, gtips: ["62.04.43.00.00"] },
  { pattern: /tesettur (hirka|trend|tunik)|alinmodest/, gtips: ["62.04.43.00.00", "62.04.62.00.00"] },
  { pattern: /(canta|cantasi).*kadin|bel cantasi/, gtips: ["42.02.22.10.00"] },
  { pattern: /pijama takim/, gtips: ["62.08.21.00.00"] },
  { pattern: /(armine|armine trend)/, gtips: ["62.04.43.00.00"] },
  { pattern: /(ab roller|sinav (tahta|aleti)|push.?up bar)/, gtips: ["95.06.91.90.00"] },
  { pattern: /(barfiks|dips|barfix)/, gtips: ["95.06.91.90.00"] },
  { pattern: /(dambil|dumble|dumbbell|kettlebell|el yayi)/, gtips: ["95.06.91.10.00"] },
  { pattern: /(boks|boxing) (torbasi|eldiveni|seti)/, gtips: ["95.06.99.90.00"] },
  { pattern: /kondisyon (bisiklet|kurek|aleti)|kosu bandi|spin bike/, gtips: ["95.06.91.90.00"] },
  { pattern: /yoga|pilates|foam roller|direnc (bandi|lastigi)/, gtips: ["95.06.91.90.00"] },
  { pattern: /hula hoop|step makin|crosstep/, gtips: ["95.06.91.90.00"] },
  { pattern: /(dermapen|derma pen|derma roller|plazma pen)/, gtips: ["85.10.10.00.00", "90.18.90.84.00"] },
  { pattern: /agiz dusu|water ?pulse|flosser|ultrasonik dis/, gtips: ["84.24.89.00.00", "85.09.80.00.00"] },
  { pattern: /tiras (makin|edili)|sakal/, gtips: ["85.10.10.00.00"] },
  { pattern: /(manikur|pedikur|torpu|protez tirnak)/, gtips: ["85.10.30.00.00"] },
  { pattern: /vakumlu yuz|yuz vakum|cilt sikilastir/, gtips: ["85.09.80.00.00"] },
  { pattern: /isitme cihaz/, gtips: ["90.21.40.00.00"] },
  { pattern: /(akilli|bluetooth) tarti|baskul/, gtips: ["84.23.10.10.00"] },
  { pattern: /kamp.*cadir|giyinme cadir/, gtips: ["63.06.22.00.00"] },
  { pattern: /(mangal|barbeku|barbeque|komurlu)/, gtips: ["73.21.11.10.00"] },
  { pattern: /sonar balik bulucu|fish finder|balik bulucu/, gtips: ["90.14.80.00.00"] },
  { pattern: /bisiklet (stop|sele|airzone)/, gtips: ["87.14.95.00.00"] },
  { pattern: /motosiklet (alarm|interkom|disk kilid|tasma|tpms)/, gtips: ["87.14.10.90.00"] },
  { pattern: /\bobd2?\b|elm.?327|ariza tespit cihazi/, gtips: ["90.31.80.34.00"] },
  { pattern: /park sensoru|tpms|lastik basinc/, gtips: ["90.31.80.34.00", "85.12.30.10.00"] },
  { pattern: /arac dvr|dashcam/, gtips: ["85.25.83.00.00"] },
  { pattern: /(60w|qc 3\.0).*arac|arac sarj/, gtips: ["85.04.40.84.00"] },
  { pattern: /ksenon|xenon (far|ampul|d1s)/, gtips: ["85.39.50.00.00"] },
  { pattern: /mini buzdolab|mobicool/, gtips: ["84.18.21.51.00"] },
  { pattern: /sebze dograyici|patates dograyici/, gtips: ["82.10.00.00.00"] },
  { pattern: /dikis makin/, gtips: ["84.52.10.19.00"] },
  { pattern: /klozet firca|wc firca/, gtips: ["96.03.90.91.00"] },
  { pattern: /a4 saman kagit|kraft.*saman kagit/, gtips: ["48.05.91.00.00"] },
  { pattern: /giyotin.*kagit|kesme mati/, gtips: ["82.14.10.00.00"] },
  { pattern: /lcd yazi tablet|grafik tablet|huion/, gtips: ["84.71.80.00.00"] },
  { pattern: /reklam oynat/, gtips: ["85.28.59.40.00"] },
  { pattern: /\b(aa|aaa) (toptan|carbon|alkalin|kalem|pil)/, gtips: ["85.06.10.18.00"] },
  { pattern: /\b9v\b.*pil/, gtips: ["85.06.10.18.00"] },
  { pattern: /\b18650\b.*(lityum|li-?ion|pil)/, gtips: ["85.07.60.00.00"] },
];

function resolveGtip(name: string, categorySlug: string | null): { gtip1: string | null; gtip2: string | null; gtip3: string | null } {
  const n = normalize(name);

  for (const rule of NAME_RULES) {
    if (rule.pattern.test(n)) {
      const [g1, g2, g3] = rule.gtips;
      const defaults = categorySlug ? CATEGORY_DEFAULTS[categorySlug] : undefined;
      return {
        gtip1: g1 ?? defaults?.[0] ?? null,
        gtip2: g2 ?? defaults?.[1] ?? null,
        gtip3: g3 ?? defaults?.[2] ?? null,
      };
    }
  }

  if (categorySlug) {
    const defaults = CATEGORY_DEFAULTS[categorySlug];
    if (defaults) {
      return {
        gtip1: defaults[0] ?? null,
        gtip2: defaults[1] ?? null,
        gtip3: defaults[2] ?? null,
      };
    }
  }

  return { gtip1: null, gtip2: null, gtip3: null };
}

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, sku: true, brand: true,
      productCategory: { select: { slug: true, name: true } },
    },
  });

  console.log(`\n═══ ${products.length} aktif ürün GTİP ataması ═══\n`);

  const stats: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const updates: { id: string; gtip1: string | null; gtip2: string | null; gtip3: string | null }[] = [];
  for (const p of products) {
    const { gtip1, gtip2, gtip3 } = resolveGtip(p.name, p.productCategory?.slug ?? null);
    const count = [gtip1, gtip2, gtip3].filter((x) => x != null).length;
    stats[count]++;
    updates.push({ id: p.id, gtip1, gtip2, gtip3 });
  }

  console.log("GTİP slot dolum oranı:");
  console.log(`  3 GTİP atanan:  ${stats[3]} ürün`);
  console.log(`  2 GTİP atanan:  ${stats[2]} ürün`);
  console.log(`  1 GTİP atanan:  ${stats[1]} ürün`);
  console.log(`  0 GTİP atanan:  ${stats[0]} ürün`);

  console.log("\n10 örnek atama:");
  for (const u of updates.slice(0, 10)) {
    const p = products.find((x) => x.id === u.id)!;
    console.log(`  [${u.gtip1 ?? "—"}, ${u.gtip2 ?? "—"}, ${u.gtip3 ?? "—"}] ${p.name.slice(0, 80)}`);
  }

  if (!APPLY) {
    console.log("\n⚠ Dry-run. --apply ekleyerek uygula.");
    return;
  }

  console.log("\n═══ Atamalar uygulanıyor... ═══");
  let done = 0;
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(batch.map((u) =>
      prisma.product.update({
        where: { id: u.id },
        data: { gtip1: u.gtip1, gtip2: u.gtip2, gtip3: u.gtip3 },
      })
    ));
    done += batch.length;
    process.stdout.write(`\r  ${done}/${updates.length}`);
  }
  console.log(`\n✅ Toplam ${done} ürün güncellendi.`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
