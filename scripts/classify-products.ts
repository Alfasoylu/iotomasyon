/**
 * Product Classification Script
 *
 * 1283 ürünü ithalat/GTİP mantığına uygun kategorilere ayırır.
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/classify-products.ts            # dry-run
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/classify-products.ts --apply    # apply changes
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: cs! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

// ── Turkish-aware ASCII normalization ───────────────────────────────────
const TR_MAP: Record<string, string> = {
  "ş": "s", "Ş": "s",
  "ğ": "g", "Ğ": "g",
  "ç": "c", "Ç": "c",
  "ü": "u", "Ü": "u",
  "ö": "o", "Ö": "o",
  "ı": "i", "İ": "i",
};
function normalize(s: string): string {
  return s.replace(/[şŞğĞçÇüÜöÖıİ]/g, (c) => TR_MAP[c] ?? c).toLowerCase();
}

// ── Category taxonomy ──────────────────────────────────────────────────────
type Cat = { slug: string; name: string; description: string };
const CATEGORIES: Cat[] = [
  {
    slug: "cctv-kamera-sistemleri",
    name: "CCTV & Kamera Sistemleri",
    description:
      "IP/AHD/PTZ güvenlik kameraları, çoklu kamera setleri, NVR kayıt cihazları, PoE switch/splitter/extender altyapısı ve kamera montaj/koruma aksesuarları. GTİP 8525.81-89 (video kayıt kameraları), 8517.62 (network anahtarlama).",
  },
  {
    slug: "akilli-ev-iot-otomasyon",
    name: "Akıllı Ev & IoT Otomasyon",
    description:
      "WiFi/Zigbee akıllı anahtar, priz, sensör (PIR/hareket/gaz/su/kapı), akıllı kapı kilidi, akıllı ampul kontrolü, termostat, IR universal kumanda merkezi. GTİP 8536/8537/8543.70.",
  },
  {
    slug: "elektronik-modul-gelistirme",
    name: "Elektronik Modül & Geliştirme Kartı",
    description:
      "MCU geliştirme kartı (Arduino/ESP32/ESP8266/STM/Raspberry Pi/PIC), sensör modülleri, sürücü modülleri (TP4056/LM2596/L298N/L298P), PLC kartları, programlayıcı (USBASP/ST-Link/EZP/Xilinx), LCD/OLED display modül, RF/Bluetooth/Zigbee modül, SDR/HackRF, termal kamera modülü, peltier soğutucu. GTİP 8543.70 / 8542 / 8537.10.",
  },
  {
    slug: "olcum-test-cihazlari",
    name: "Ölçüm & Test Cihazları",
    description:
      "Multimetre, pensampermetre, osiloskop, sinyal jeneratörü, anemometre, lüksmetre, pH metre, dB ölçer, refraktometre, termometre, lazer mesafe, kaliper, mikrometre, USB test, network kablo test, frekans sayacı, VNA, voltaj kalemi. GTİP 9030 / 9025 / 9027 / 9015.",
  },
  {
    slug: "metal-dedektoru",
    name: "Metal Dedektörü & Güvenlik Tarama",
    description:
      "Pinpointer, profesyonel altın/hazine dedektörleri (MD-3010, MD-4030, MD4060, GR-1000, TX-950), üst arama el dedektörü, su geçirmez yer altı dedektörü, anti-spy/casus sinyal dedektörü, GPS sinyal engelleyici. GTİP 9015.40 / 8531.10.",
  },
  {
    slug: "guc-kaynagi-donusturucu",
    name: "Güç Kaynağı & DC-DC Dönüştürücü",
    description:
      "DC-DC buck/boost regülatör, programlanabilir laboratuvar güç kaynağı (Riden/DPS), lityum BMS koruma kartları, inverter, frekans dönüştürücü, solar şarj kontrol, transformatör, voltaj regülatörü, süperkapasitör, üniversal şarj adaptörü. GTİP 8504 / 8506-8507.",
  },
  {
    slug: "motor-rc-surucu",
    name: "Motor, Servo & RC Sürücü",
    description:
      "Step motor ve sürücü, dijital servo motor, BLDC/fırçasız motor sürücü, RC ESC fırçasız hız kontrol, RC motor, drone batarya ve LiPo şarj cihazı, RC uçak, DC mini motor. GTİP 8501 / 8504.40.",
  },
  {
    slug: "cnc-lazer-3d-printer",
    name: "CNC, Lazer & 3D Printer",
    description:
      "CNC hareket kontrol kartı (Mach3/NVEM/DDCS/EDG/LF77), el çarkı (MPG), lazer kesim/gravür makineleri (NEJE), CO2 lazer optik aksesuar, 3D printer anakart (SKR/MKS/TFT/Ender3), 3D printer bileşeni (heatbed, extruder, 3D touch), plotter bıçağı, vinil kesici, CNC tutucu pens, ahşap torna makinası. GTİP 8456-8463 / 8466 / 8479.50.",
  },
  {
    slug: "bilgisayar-cevre-baglanti",
    name: "Bilgisayar Çevre Birimi & Bağlantı",
    description:
      "USB hub/çoklayıcı, kart okuyucu, HDMI/DisplayPort/VGA/DVI çevirici-adaptör, USB-Ethernet adaptör, WiFi/Bluetooth dongle, KVM switch, HDMI splitter/switch, video capture, video wall controller, Cat5/6 ve fiber optik kablo, SFP modül, harici SSD/HDD kasası, DVD sürücü, PCIe extender/riser, USB flash bellek, lightning HDMI adaptör. GTİP 8471.80 / 8544 / 8517.62.",
  },
  {
    slug: "bilgisayar-donanim-sogutucu",
    name: "Bilgisayar Donanım & Soğutucu",
    description:
      "Ekran kartı (NVIDIA/AMD), SSD/HDD ve depolama (Samsung/SanDisk/Kingston), RAM (DDR3/DDR4), mining anakart, PC kasa, telefon/laptop soğutucu fan, laptop stand. GTİP 8471 ailesi.",
  },
  {
    slug: "telefon-tablet-aksesuar",
    name: "Telefon & Tablet Aksesuar",
    description:
      "Type-C/Lightning şarj kabloları, hızlı şarj adaptörü ve istasyonu, telefon/tablet kılıf, tripod ve selfie çubuğu, telefon lens, stylus/çizim kalemi, Apple Watch kordon, Bluetooth uzaktan fotoğraf kumandası, dünya seyahat adaptörü. GTİP 8517.71 / 8504.40 / 4202.",
  },
  {
    slug: "gaming-konsol-aksesuar",
    name: "Gaming & Konsol Aksesuarı",
    description:
      "Gaming mouse ve klavye, joystick/gamepad, yarış direksiyon seti, retro oyun konsolu (Atari/Data Frog), Android TV box (MXQ/VONTAR), Air Mouse smart TV klavye. GTİP 9504.50 / 8528.71.",
  },
  {
    slug: "audio-amfi-hoparlor",
    name: "Audio, Amfi & Hoparlör",
    description:
      "Stereo amplifikatör devresi (TDA7297/TPA3116/PAM8610), Bluetooth ses alıcı-verici, DAC ve 5.1 ses kod çözücü, hoparlör ve karaoke mikrofonu, KZ kulaklık, frekans bölücü, MP3 ses kayıt modülü, kablosuz gitar sistemi. GTİP 8518 / 8543.70.",
  },
  {
    slug: "aydinlatma-led",
    name: "Aydınlatma & LED",
    description:
      "LED ampul (E27/RGB/akıllı), LED şerit (neon/RGB/COB grow), LED projektör/floodlight, solar bahçe lambası, stüdyo ring light, kristal dokunmatik anahtar paneli, UV/blacklight/UVB el feneri, araç içi dekoratif LED. GTİP 9405 / 8513 / 8536.61.",
  },
  {
    slug: "banyo-mutfak-bataryasi",
    name: "Banyo & Mutfak Bataryası (Armatür)",
    description:
      "Banyo lavabo bataryası (çanak/tezgah üstü/antika/retro), mutfak eviye bataryası (spiralli/fiskiyeli/yaylı), duş seti ve ankastre duş sistemleri, sensörlü ve LED ışıklı bataryalar, klozet taharet musluğu, akıllı eviye/smart sink. GTİP 8481.80 (sıhhi armatür).",
  },
  {
    slug: "su-aritma-pompa-akvaryum",
    name: "Su Arıtma, Pompa & Akvaryum",
    description:
      "Ev tipi su arıtma cihazı, akvaryum/bahçe/dalgıç mini su pompası, hidrofor ve hava kompresörü pompa, ozon jeneratörü ve hava temizleyici, akvaryum aksesuarı, su seviye sensörü/şamandıra, vakum hava pompası motoru. GTİP 8413 / 8421 / 8414.80.",
  },
  {
    slug: "el-aleti-lehim",
    name: "El Aleti & Lehim",
    description:
      "Dijital havya ve lehim potası, nokta kaynak makinesi, RJ45/krone sıkma pensesi, IDC patch panel delme aleti, yan keski, kablo soyucu makas, dijital mikrometre/kaliper, boya tabancası, matkap fırça aksesuar, sac kesici, büyüteçli havya sehpası. GTİP 8205-8207 / 8515.",
  },
  {
    slug: "tesettur-kadin-giyim",
    name: "Tesettür & Kadın Giyim",
    description:
      "Armine ve Armine Trend tesettür tunik/hırka/kap/ceket/etek/mont, AlinModest elbise ve pijama, kadın çantası, oversize gömlek. GTİP 6201-6217 (giyim) / 4202.22 (çanta).",
  },
  {
    slug: "spor-fitness",
    name: "Spor & Fitness Ekipmanı",
    description:
      "AB roller/mekik aleti, barfiks/dips, dambıl/kettlebell/el yayı, boks torbası ve eldiveni, kondisyon bisikleti/koşu bandı/hidrolik kürek, hula hoop, step, yoga/pilates foam roller, direnç bandı, kelebek aleti, hidrolik twister, şınav tahtası. GTİP 9506.",
  },
  {
    slug: "kisisel-bakim-saglik",
    name: "Kişisel Bakım, Güzellik & Sağlık",
    description:
      "Dermapen/plazma pen/derma roller, ağız duşu, ultrasonik diş temizleyici, tıraş makinesi yedek, manikür-pedikür törpü, vakumlu yüz temizleyici, saç bakım masaj tarağı, pulse oksimetre, termometre, işitme cihazı, Bluetooth akıllı tartı, beyaz gürültü bebek ses cihazı. GTİP 8509 / 9018-9019 / 9021.",
  },
  {
    slug: "kamp-outdoor-mobilite",
    name: "Kamp, Outdoor & Mobilite",
    description:
      "Kamp giyinme/duş çadırı, taşınabilir mangal/barbekü (Flextail Memphis), sonar balık bulucu, solar fıskiye, köpek eğitim tasması, bisiklet stop/sele, motosiklet alarm/interkom, GPS modülü. GTİP 6306 / 7321 / 9504.90 / 8531.90.",
  },
  {
    slug: "telsiz-haberlesme",
    name: "Telsiz & Haberleşme",
    description:
      "Baofeng/Boafeng/BF el telsizleri, 433MHz RF kumanda alıcı/verici, 4G/5G GSM sinyal güçlendirici, uydu yön bulucu (V8/V9 Finder), DJI anten yükseltici, MAGBOX WiFi anten. GTİP 8525.60 / 8526 / 8517.62.",
  },
  {
    slug: "arac-diagnostik-aksesuar",
    name: "Araç Diagnostik & Aksesuar",
    description:
      "OBD2/ELM327 araç arıza tespit cihazları, BMW/Mercedes/VW/Audi/Toyota diagnostik, akü/pil ölçüm, park sensörü, TPMS, Apple CarPlay adaptörü, araç DVR/dashcam, araç şarj aleti, teyp Aux/USB dönüştürücü, xenon ampul, sticker düğme set. GTİP 8708 / 9031 / 8512.",
  },
  {
    slug: "ev-esyasi-kirtasiye-dekoratif",
    name: "Ev Eşyası, Kırtasiye & Dekoratif",
    description:
      "Mini buzdolabı, patates/sebze doğrayıcı, dikiş makinesi, mini terazi, klozet fırçası ve banyo aksesuar, ambalajlama makinesi, saman kağıt, giyotin kağıt kesme, kesme matı, LCD yazı tableti, grafik tablet, sunum kumandası, reklam oynatıcı, yarışma butonu, gece projeksiyon lambası, gizli kasa, 3D Pen, el terminali, mikroskop seti, masa saati, TV kumandası. GTİP 4823 / 8472 / 9504.50 / 9405.",
  },
  {
    slug: "pil-aku",
    name: "Pil & Akü",
    description:
      "AA/AAA karbon-alkalin kalem pil, 9V GP pil, 18650 lityum hücre. GTİP 8506 / 8507.",
  },
  {
    slug: "diger",
    name: "Diğer",
    description:
      "Sınıflandırma için yeterli bilgi içermeyen veya net bir aileye girmeyen ürünler. Manuel inceleme gerektirir.",
  },
];

// ── Classifier rules (patterns will be Turkish-normalized at startup) ──
type Rule = {
  slug: string;
  // Match logic: brand AND patterns (if both set). If only one set, that one must match.
  brand?: RegExp;
  patterns?: RegExp[];
  not?: RegExp[];
  // brandAlone: if true, brand match alone is enough (patterns optional);
  // useful when brand is a perfect indicator
  brandAlone?: boolean;
};

// Helper: write patterns in ASCII (post-normalization). Turkish chars in source
// will be normalized at startup; using ASCII keeps things explicit.
const RULES_RAW: Rule[] = [
  // ════════════════════════════════════════════════════════════════════════
  // Brand-only short-circuits (highest signal)
  { slug: "tesettur-kadin-giyim", brand: /^(armine|armine trend|armin|alinmodest)$/i, brandAlone: true },
  { slug: "olcum-test-cihazlari", brand: /^(aneng|fluke|habotest)$/i, brandAlone: true },
  { slug: "cctv-kamera-sistemleri", brand: /^hikvision$/i, brandAlone: true },
  { slug: "telsiz-haberlesme", brand: /^(baofeng|boafeng)$/i, brandAlone: true },
  { slug: "akilli-ev-iot-otomasyon", brand: /^(ttlock|aqara)$/i, brandAlone: true },

  // Flextail brand exceptions (gamepad, kamp)
  {
    slug: "gaming-konsol-aksesuar",
    brand: /^flextail$/i,
    patterns: [/c8s wireless|gamepad|joystick/i],
  },
  {
    slug: "kamp-outdoor-mobilite",
    brand: /^flextail$/i,
    patterns: [/giyinme cadir|kamp cadir|memphis|mangal|firinli|barbeku/i],
  },

  // ════════════════════════════════════════════════════════════════════════
  // TESETTÜR & KADIN GİYİM — name-based fallback
  {
    slug: "tesettur-kadin-giyim",
    patterns: [
      /\btesettur\b/i,
      /(tunik|hirka|ferace|pardesu|kapitone kap|trend kap|trend tunik|trend yelek|trend ceket)/i,
      /\b(elbise|etek|gomlek|yelek|mont|bluz|sweetshirt)\b.{0,40}\b(armine|kadin|tesettur)\b/i,
      /kadin.{0,30}\b(canta|elbise|tunik|hirka|ferace|kap|etek|takim|pijama|gomlek)\b/i,
      /\bferace\b/i,
      /alinmodest/i,
      /\bbel cantasi\b/i,
      /oversize.{0,15}gomlek/i,
      /pijama takim/i,
      /\bcitcitli etek\b/i,
      /poliviskon kumas/i,
      /\barmine\b/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // CCTV & KAMERA SİSTEMLERİ
  {
    slug: "cctv-kamera-sistemleri",
    patterns: [
      /\d+'?\s?(li|lu).{0,40}(ip kamera|kamera seti)/i,
      /(ip kamera seti|kamerali.{0,30}set|kamera set\b|guvenlik kamera sistemi seti)/i,
      /\bip kamera\b/i,
      /\bptz\b/i,
      /v380/i,
      /bullet kamera/i,
      /dome (ip )?kamera/i,
      /hikvision/i,
      /\bnvr\b/i,
      /(kamera|guvenlik) kayit cihazi/i,
      /poe (switch|splitter|injector|extender|repeater|repeat|tekrarlayici)/i,
      /\bpoe.{0,30}(switch|extender|splitter|repeater|injector|tekrarlayici)/i,
      /poe.{0,30}gigabit/i,
      /\bcat6.{0,30}(kamera|ip)/i,
      /kamera (ayagi|montaj|braketi|siperligi|kutusu|golgelik|buati|elektrik)/i,
      /video balun/i,
      /guvenlik kamerasi/i,
      /(gorunt|wifi).{0,40}kapi zili/i,
      /kapi zili.{0,40}(wifi|gorunt|akilli|kablosuz)/i,
      /bebek (kamerasi|izleme)/i,
      /(ip ampul|ptz.{0,15}ampul|bulb.{0,15}ip|wifi kamera|solar kamera|sim solar|sim kart.{0,15}(kamera|solar))/i,
      /uyari bu bina 24 saat kamera/i,
      /(bnc|rj45).{0,30}video balun/i,
      /balun.{0,30}(bnc|cat5|cat6|rj45)/i,
      /\bahd kamera\b|ahd video balun/i,
      /(4 mp|4mp|5mp).{0,40}guvenlik kamera/i,
      /4 lu guvenlik kamera/i,
      /ptz.*alarm.*akilli/i,
      /\bonvif\b/i,
      /(rfid|fotokapan) kamera|fotokapan kamuflaj/i,
      /ekranli goruntulu gorus.*akilli kamera/i,
      /goruntulu gorus.*kamera/i,
      /(akilli|smart) kamera.*(ev|isyeri|ofis|bebek|hasta)/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // METAL DEDEKTÖRÜ
  {
    slug: "metal-dedektoru",
    patterns: [
      /pinpointer/i,
      /\bmetal dedektor/i,
      /\baltin.{0,15}dedektor/i,
      /\bmd[-_\s]?\d{3,4}\b/i,
      /md-?\s?(3010|3040|4030|4060|1008|3003b1)/i,
      /tx-?950/i,
      /gr-?1000/i,
      /ust arama/i,
      /super scanner/i,
      /scuba.{0,30}(dedektor|maden|bulucu|altin)/i,
      /\bhazine bulucu\b/i,
      /casus.{0,20}dedektor/i,
      /anti-?casus.{0,15}sinyal/i,
      /\bcc308\b/i,
      /gps.*sinyal.*(engelleyici|girisim)/i,
      /hawkeye/i,
      /yeralti.*(altin|maden|hazine|metal)/i,
      /duvar tarayici/i,
      /duvar metal dedektor/i,
      /lw10.{0,15}dedektor/i,
      /(pointer|dedektor) altin metal/i,
      /\banunnaki pointer\b/i,
      /pinpointer pil/i,
      /vibratorlu maden/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // TELSİZ & HABERLEŞME
  {
    slug: "telsiz-haberlesme",
    patterns: [
      /\bbaofeng\b/i,
      /\bboafeng\b/i,
      /\bbf-?h5\b/i,
      /\buv-?(82|9r|s9|13|5r|32)\b/i,
      /el telsiz/i,
      /\btelsiz\b/i,
      /sinyal guclendirici/i,
      /(4g|5g|gsm).{0,30}(guclendirici|tekrarlayici|sinyal)/i,
      /(uydu|sat).{0,15}(yon bulucu|finder)/i,
      /\b(v8|v9)[ -]?finder\b/i,
      /dvb-s2/i,
      /dji anten/i,
      /magbox.*wifi.*anten/i,
      /433mhz.*(kumanda|rf|kablosuz)/i,
      /\brf kumanda\b/i,
      /(uzaktan kumanda|kablosuz).*(garaj|kepenk|alarm kilit)/i,
      /\bb1 b3 b8\b/i,
      /sinyal arttirici.*anten/i,
      /telefon sinyal guclendirici/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // AKILLI EV & IOT OTOMASYON
  {
    slug: "akilli-ev-iot-otomasyon",
    patterns: [
      /\bttlock\b/i,
      /akilli (kapi kilit|kapi kolu|kilit|kapi)/i,
      /smart lock/i,
      /parmak izli.{0,30}(kapi|kilit|asma|silindir)/i,
      /parmak izi okuyuculu.{0,30}kapi/i,
      /\baqara\b/i,
      /\bbroadlink\b/i,
      /\bsonoff\b/i,
      /\bzigbee\b.*(gateway|kumanda|smart|sensor|dedektor|akilli|hareket|gateway|wifi|tuya)/i,
      /tuya.*(wifi|smart|app|zigbee|sensor|alarm|dedektor|kumanda|priz)/i,
      /smart life/i,
      /(akilli|smart).{0,15}(anahtar|priz|ampul|bulb|switch|role|termostat|sensor|kilit|hub|asma)/i,
      /wifi.{0,15}(akilli|smart|kumanda|switch|priz|anahtar|merkez|panjur|kombi|termostat|dimmer|sulama)/i,
      /(wifi|wi-?fi|zigbee).{0,15}(hareket|pir|kapi|pencere|gaz|su|alarm).{0,15}(sensor|dedektor)/i,
      /(pir|hareket|kapi|pencere|gaz|su)\s*sensor.*(wifi|tuya|smart|akilli|zigbee)/i,
      /dokunmatik.{0,15}(anahtar|priz|duvar|isik)/i,
      /(xtouch|x ?touch).*(beyaz|gold|siyah|kristal|panel)/i,
      /alfa.*xtouch/i,
      /broadlink rm pro/i,
      /\bbroadlink rm\b/i,
      /tuya app/i,
      /smart.*(home|ev otomasyonu|akilli ev)/i,
      /(akilli|smart) ev otomasy/i,
      /termostatik vana.{0,15}(wifi|tuya|zigbee|akilli)/i,
      /termostat.{0,20}(wifi|akilli|smart|kombi|kuluc)/i,
      /merkez kumandasi.*(wifi|tuya|smart|akilli|ir)/i,
      /infrared.*el sensor/i,
      /el sensor.*(temassiz|otomatik|infrared|kizilotesi)/i,
      /\bs06 mini akilli/i,
      /s26.*priz/i,
      /\bsonoff (4ch|basic|mini|s26|sv|th16|pir|rf|dualr3)/i,
      /\bog-?001\b/i,
      /smart finger/i,
      /uzaktan kumanda.*\b(zigbee|tuya|wifi)\b/i,
      /xiaomi (mi box|otomatik|akilli)/i,
      /\bxiaomi mi box.{0,15}kumanda/i,
      /dijital.*kapi zili/i,
      /(akilli|smart) (ampul|bulb).*(wifi|rgb|app|ios|android|kontrol|ev)/i,
      /\brf bridge\b.*(wifi|kontrol|kablosuz|kopru)/i,
      /soylu elektronik.*wifi.*akilli/i,
      /(otomasyon|otomatik kapi|el sensoru).*\b(temassiz|kizilotesi|sensor)\b/i,
      /no.?touch.*(buton|sensor|exit)/i,
      /rfid.*kapi.*kilid/i,
      /kapi pencere dedektoru alarm/i,
      /pir.*ev hareket.*akilli/i,
      /\bg30 akilli uzaktan kumanda\b/i,
      /alfa wifi.*touch/i,
      /smart.*(asma kilit|finger|bluetooth.*kilit)/i,
      /(akilli|smart).{0,20}termostat/i,
      /broadlink rm/i,
      /(parmak izli|parmak izi).{0,40}(akilli|silindir|kart|sifre|asma|kapi|kilit)/i,
      /\bttlock.{0,10}(silver|siyah)/i,
      /kablosuz.*dokunmatik.*isik anahtari/i,
      /1xtouch|2xtouch|3xtouch/i,
      /wifi.*kablosuz.*dokunmatik/i,
      /alfa wifi.*kristal/i,
      /\bsifreli kartli telefon/i,
      /(akilli|smart).{0,20}(kapi zili|gateway|hub)/i,
      /tuya wifi.*sensor/i,
      /ir kumanda kopyala|kumanda kopyalayici/i,
      /akilli telefon ir kumanda/i,
      /infrared.*klima.*kontrol|klima.*tv.*kumanda/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // BANYO & MUTFAK BATARYASI (pattern-only — covers all brands)
  {
    slug: "banyo-mutfak-bataryasi",
    patterns: [
      /\bbatarya\b.{0,40}(banyo|lavabo|mutfak|eviye|evye|canak|musluk|sicak|soguk|tezgah)/i,
      /(banyo|lavabo|mutfak|eviye|evye|canak|tezgah ustu|tezgah).{0,40}\bbatarya/i,
      /\b(dus seti|ankastre dus|dus bataryasi|tepe dus|yagmurlama|fonksiyonlu dus|dus sistemi)\b/i,
      /(banyo|mutfak|eviye).*musluk/i,
      /\bmusluk bataryasi/i,
      /selale.{0,15}(banyo|lavabo|musluk|eviye|evye|bataryas|havzasi|havza|cikis)/i,
      /(antik|antika|vintage|retro|nostaljik).{0,40}(banyo|musluk|lavabo|batarya|eviye|evye|selale|carsaf)/i,
      /(akrobat|spiralli|fiskiyeli|yayli|robot|kugu|cek birak).{0,30}(banyo|mutfak|lavabo|musluk|eviye|evye|batarya|yagmurlama)/i,
      /robot tepe dus/i,
      /klozet|taharet|tuvalet duşu|tuvalet dusu|tuvalet temizleyici/i,
      /\bbide\b/i,
      /smart eviye|akilli eviye|akilli evye|dijital tasarimli akilli/i,
      /(piyano gri|mat gold|mat siyah|gumus|gold|krom|altin).{0,40}(dus|tepe|banyo|lavabo|musluk|batarya|eviye|evye|selale)/i,
      /lavabo bataryasi/i,
      /eviye bataryasi|evye bataryasi/i,
      /mutfak (lavabo|evye|eviye)/i,
      /\bflextail\b/i,
      /mat siyah.{0,40}(musluk|selale|mutfak|lavabo|tezgah|batarya|tepe)/i,
      /modern (mat|gri|black|krom).{0,40}(lavabo|musluk|batarya|tezgah|banyo)/i,
      /banyo lavabo selale/i,
      /\bmusluk\b.{0,40}(altin|gold|siyah|paslanmaz|krom|kugu|selale|antik|pirinc)/i,
      /\bcanak (lavabo|antik|selale|tezgah)/i,
      /loft musluk/i,
      /(flex hortum|flex hortumu).{0,20}(mat|sicak|soguk|paslanmaz)/i,
      /banyo.*musluk batarya/i,
      /\bdus basligi|dus kolu seti/i,
      /\bguverte monte/i,
      /dokunmatik.{0,15}musluk/i,
      /led isikli musluk/i,
      /fotoselli lavabo/i,
      /\bbanyo bataryasi\b/i,
      /\bmutfak bataryasi\b/i,
      /sensorlu.{0,30}mutfak/i,
      /pirinc (mutfak|lavabo|banyo|batarya|cesme)/i,
      /siyah\s+yayli\s+(mutfak|oynar|fiskiyeli)/i,
      /9 fonksiyonlu selale evye/i,
      /(banyo|mutfak).*(akilli|dijital).*evye/i,
      /lavabo (musluk|musluk[gn])/i,
      /antik vintage banyo/i,
      /klozet.{0,30}(temizleme|temizleyici|fiskiye|hijyen|firca)/i,
      /(banyo|mutfak).*sicak.*soguk/i,
      /retro aritma/i,
      /\bbeyza mix\b/i,
      /\bmix banyo\b/i,
      /\bcanak\b.{0,15}(lavabo|sela|tezgah|musluk)/i,
      /(altin|gold) (kr|mut|banyo|spiralli)/i,
      /(siyah|altin).{0,15}gold.{0,20}(banyo|musluk|lavabo|selale)/i,
      /\beviye\b|\bevye\b/i,
      /(tencere doldurma|katlanabilir|tahalrey).{0,20}mutfak/i,
      /antik rustik mutfak/i,
      /piyano gri robot tepe/i,
      /mutfak (eviye|evye|cesme)/i,
      /lavabo musluk/i,
      /(banyo|sicak|soguk).{0,30}sprey dus/i,
      /(retro|antika|rustik) (eviye|musluk|pirinc|cesme|batarya)/i,
      /(magic brush|kuvet temizleme|3 baslikli.*mutfak)/i,
      /3 parca.*lavabo.*musluk|cift sapli.*banyo lavabo/i,
      /(led|isikli) musluk basligi/i,
      /led sicaklik monitorlu.*musluk/i,
    ],
  },
  // Flextail brand fallback → batarya (if didn't match gaming/kamp above)
  { slug: "banyo-mutfak-bataryasi", brand: /^flextail$/i, brandAlone: true },

  // ════════════════════════════════════════════════════════════════════════
  // SU ARITMA, POMPA & AKVARYUM
  {
    slug: "su-aritma-pompa-akvaryum",
    patterns: [
      /\bsu aritma\b/i,
      /\bro aritma\b/i,
      /\bdeposuz su aritma\b/i,
      /\bakvaryum\b/i,
      /(akvaryum|dalgic|santrifuj|akulu|mini|bahce).{0,15}(su pompasi|pompa)/i,
      /\bhidrofor\b/i,
      /(damacana|sarjli).{0,10}(su pompasi|pompa)/i,
      /vakum.{0,10}su pompasi/i,
      /yuksek basin[cs].{0,30}(pompa|su)/i,
      /vakumlu pompa|vakum pompasi|vakum.{0,15}hava pompa|vakumlu hava pompa/i,
      /diyafram (pompa|hava pompa)/i,
      /hava kompresoru pompa/i,
      /vakum hava pompasi/i,
      /\bozon (jenerator|generator)/i,
      /hava temizleyici.*(jenerator|ozon|koku|ev)/i,
      /(mini )?koku giderici.*hava/i,
      /sis yapici|nem nozulu|soguk buhar/i,
      /samandira anahtar|sivi seviye/i,
      /su (kacak|akis|sivi seviye).{0,10}(sensor|dedektor|kontrol|sensoru)/i,
      /solar fiskiye/i,
      /(akvaryum|golet) (su|ozon|hava)/i,
      /\bsu pompasi motoru\b/i,
      /\b(dc|12v|24v|220v).{0,10}(su pompasi|dalgic|fircasiz.{0,10}pompa)/i,
      /mini su pompa/i,
      /erkek (duz )?agiz/i,
      /vakum hava pompasi motoru/i,
      /elektrikli mikro vakum hava pompasi/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // ARAÇ DIAGNOSTİK & AKSESUAR
  {
    slug: "arac-diagnostik-aksesuar",
    patterns: [
      /\bobd2?\b/i,
      /elm.?327/i,
      /\bariza tespit cihazi\b/i,
      /arac (ariza|tarayici|tarama|teyp|teshis|onarim)/i,
      /\b(bmw|mercedes|audi|skoda|seat|vw|toyota).{0,30}(kapi|kilit|teyp|ariza|icom|enet|bimmercode|kapagi|carplay|kapi kapagi|amg|gla|cla)/i,
      /(vagcom|vag com|hex v2)/i,
      /carplay/i,
      /araç içi dvr|araç dvr|dashcam|gpsli.*araç/i,
      /araç i?ci dvr/i,
      /arac ici dvr/i,
      /\bgpsli.*araç\b/i,
      /park sensoru/i,
      /lastik basin[cs].{0,15}(sensor|monitor|dedektor|tpms)/i,
      /\btpms\b/i,
      /arac (sarj|hizli sarj|telefon tutucu|holder)/i,
      /(60w|qc 3\.0).*arac/i,
      /arac pil/i,
      /arac telefon tutucu/i,
      /sigara cakmak/i,
      /aux bluetooth arac/i,
      /\bcarlife\b/i,
      /\b(elm327|maxicom|launch|vlinker|icar pro|bm2|mk808|crp3001)\b/i,
      /vag.{0,5}com/i,
      /\btoyota corolla\b|\byaris\b.*teyp/i,
      /arac bluetooth/i,
      /\bdvr\b.{0,20}(arac|car|dash|kamera)/i,
      /ksenon|xenon (far|ampul|d1s)/i,
      /arac pencere|arac dugme set/i,
      /android ve apple carplay/i,
      /arac.*guclendirici/i,
      /amg kapi kilidi/i,
      /sticker.*mercedes|sticker.*merdeces/i,
      /motosiklet (alarm|interkom|tpms|tasma|disk kilit)/i,
      /\b110 db.*disk kilid/i,
      /\bmoto.{0,5}alarm/i,
      /mercedes amg kapi kilidi/i,
      /arac otomatik pencere/i,
      /merdeces.*sticker|sticker.*merdeces/i,
      /\bgla\b.*amg|\bcla\b.*amg/i,
      /super vision xenon/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // GAMING & KONSOL (before bilgisayar/audio to catch direksiyon/joystick)
  {
    slug: "gaming-konsol-aksesuar",
    patterns: [
      /(direksiyon seti|direksiyon ps|driving spor|racing wheel|yarış direksiyon|yaris direksiyon)/i,
      /(pxn|doyo|drk|v900|r270|r900|v10|g30|v9).{0,20}direksiyon/i,
      /(joystick|gamepad)/i,
      /oyun (kolu|kol konsol)/i,
      /\bxbox\b/i,
      /(retro|nostaljik|vintage|atari).{0,20}(oyun|konsol|gaming|tv atari|gamestick)/i,
      /retro oyun konsol/i,
      /\b(data frog|sf2000|gamestick)\b/i,
      /\batari\b/i,
      /android tv box/i,
      /\btv box\b/i,
      /\bvontar\b/i,
      /mxq pro|mxq /i,
      /gaming mouse|gaming keyboard|gamer mouse/i,
      /\bdeathadder\b/i,
      /\brazer\b/i,
      /optik gaming mouse/i,
      /\bgaming\s+(bos|kasa|temperli)/i,
      /arcade usb kontrol/i,
      /c8s wireless/i,
      /\bi9x\b|imice/i,
      /soyunkolu|doubleshock/i,
      /soylu .{0,20}gaming/i,
      /\bsoylu elektronik\b.{0,30}gaming/i,
      /(ipad|iphone).*(gamepad|kablosuz gamepad|oyun kol)/i,
      /(ios|ipad iphone).{0,30}gamepad/i,
      /samsung galaxy tab.*klavye/i,
      /samsung galaxy.*klavye/i,
      /\bgalaxy tab.*klavye/i,
      /ipad.*klavyeli/i,
      /vintage gaming atari/i,
      /gaming.*kasa temperli/i,
      /mx3 air mouse.*klavye/i,
      /air mouse.*smart tv/i,
      /(klavyeli|klavye).{0,20}(tv|televizyon|mini)/i,
      /kablosuz mini klavye tv/i,
      /ataris(i)? oyun/i,
      /20000 oyunlu|gaming atari/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // CNC, LAZER & 3D PRINTER
  {
    slug: "cnc-lazer-3d-printer",
    patterns: [
      /\bcnc\b/i,
      /lazer (kesim|gravur|oyma|kazima|reflektor|yansit|odak|kafa|lens)/i,
      /\bmach3\b/i,
      /\b(nvem|ddcs|edg\d|lf77|akz250)\b/i,
      /\bneje\b/i,
      /co2 lazer/i,
      /odak lens|odaklama lens/i,
      /3d print|3d yazici|3dprinter/i,
      /(skr|mks|tft\d{2}|btt skr|btt tf)/i,
      /heatbed mosfet|extruder|3d touch.*sensor|3d touch.*kalibrasyon/i,
      /ender3|ender-3/i,
      /plotter bicagi|roland.*bicak|summa.*bicak/i,
      /vinil kesici/i,
      /(er32|er\s?\d{2}).{0,15}(cnc|tutucu|pens|makina)/i,
      /makey makey/i,
      /joystick.*potansiyometre.*cnc/i,
      /at0821/i,
      /\bdkv?[-_ ]?(8|81)?kz/i,
      /\b\d{4}mw.*lazer|lazer.*\d{2,4}mw/i,
      /lazer gravur makin/i,
      /\b(stb5100|mpg|el carki)\b/i,
      /vinil kesici|tt-?450/i,
      /mietubl|ekran koruyucu makin/i,
      /punta nokta kaynak/i,
      /(150w|96w) mini.{0,5}(odun )?torna/i,
      /odun torna makin/i,
      /ahsap torna/i,
      /(mini )?odun torna/i,
      /(3000mw|cnc gravur|cnc lazer)/i,
      /cnc usb mach3/i,
      /servo motor mks/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // EL ALETİ & LEHİM
  {
    slug: "el-aleti-lehim",
    patterns: [
      /\bhavya\b/i,
      /lehim (makin|potasi|sicaklik|kalem|sehpa|seti|kalemi)/i,
      /soldering/i,
      /\bts101\b.*havya/i,
      /(rj45|krone|ez).{0,30}(pense|kesme|sikma)/i,
      /yan keski|elektronikci.*keski/i,
      /telefon irtibat.*pense/i,
      /matkap (firca|ucu|aksesuar)/i,
      /tornavida (kit|set|seti)/i,
      /soyucu makas|kablo soyucu/i,
      /boya tabancasi/i,
      /nibber sac kesici|nibble.*kesici/i,
      /buyutec.*havya/i,
      /buyutec.{0,15}(led|yasli|okuma|cocuk|ledli)/i,
      /(buyut|zoom).{0,5}buyutmeli.*led isikli/i,
      /idc patch panel.*delme/i,
      /\b110 idc\b/i,
      /punta.*lehim/i,
      /ez rj45 rj11/i,
      /rj45 ez rj11/i,
      /80w dijital lcd.*havya/i,
      /(lehim|havya).{0,15}makin|havya kalem/i,
      /yan keski|elektronikci.*yankeski/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // MOTOR & RC SÜRÜCÜ
  {
    slug: "motor-rc-surucu",
    patterns: [
      /servo motor/i,
      /(ds3218|ds3235|mg996|an5160|an8120)/i,
      /step motor/i,
      /\bnema\s?(17|23|34)\b/i,
      /tb6600/i,
      /\b(dm556|dm806|dm860|hbs57|hbs86)\b/i,
      /bldc.*motor surucu/i,
      /fircasiz motor.*surucu/i,
      /(dc motor|fircasiz.*motor) (hiz|surucu|kontrol)/i,
      /\besc\b.*\b(rc|drone|motor|fircasiz)/i,
      /simonk \d+a/i,
      /\b(rs2205|xxd a2212|rc 2440|an2212|a2212)\b/i,
      /rc.{0,15}(motor|motoru|esc|fircasiz)/i,
      /rc planor|rc-?801/i,
      /drone.{0,15}(batarya|pil|lipo|sarj|motor)/i,
      /(lipo|li-?po).*(sarj|pil|batarya)/i,
      /imax b3|imax b6/i,
      /h36 \d+mah/i,
      /step motor pca9685|tb6612.*motor/i,
      /motor hiz.*kontrol/i,
      /3 fazli.*motor hiz/i,
      /(60a|30a|10a).*pwm.*motor/i,
      /lcd 60a pwm.*motor/i,
      /servo (surucu|servo motor surucu)/i,
      /step motor surucu kart/i,
      /\bl298n\b|\bl298p\b.*motor/i,
      /motor surucu shield/i,
      /400w hiz kontrol regulator.*motor/i,
      /dc motor degistirme/i,
      /(dc 12v|24v) motor.{0,15}(hiz|surucu|kontrol|regulator)/i,
      /servo motor sehpa/i,
      /\bdc motor\b/i,
      /plastik tekerlek.*mini dc motor/i,
      /mini dc motor/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // PİL & AKÜ (primer)
  {
    slug: "pil-aku",
    patterns: [
      /\b(aa|aaa) (toptan|carbon|alkalin|kalem|pil)/i,
      /super carbon kalem pil/i,
      /\b9v\b.{0,20}pil/i,
      /gp .{0,15}pil/i,
      /6f22/i,
      /\b18650\b\s*(li-?ion|lityum|pil|hucre|sarj.{0,5}cihaz|sarj edilebilir)/i,
    ],
    not: [/18650.*test|18650 lcd|pil kapasite test/i],
  },

  // ════════════════════════════════════════════════════════════════════════
  // ÖLÇÜM & TEST CİHAZLARI
  {
    slug: "olcum-test-cihazlari",
    patterns: [
      /multimetre/i,
      /pensampermetre|kelepce (voltaj|amper)|pens metre/i,
      /\bvoltmetre\b/i,
      /\bampermetre\b/i,
      /\bwattmetre\b/i,
      /\bohmmetre\b/i,
      /\bosiloskop\b/i,
      /sinyal jeneratoru|signal generator|fonksiyon (sinyal|jenerator)/i,
      /(dijital|akilli).{0,10}(multi|tester|test cihazi)/i,
      /\baneng\b/i,
      /\bfluke\b/i,
      /\bhabotest\b/i,
      /\bmestek\b/i,
      /\bfnirsi\b.{0,40}(osilo|usb|test|multi|kalem|sinyal|jenera|tab|tc2|c1|hs01|fnb)/i,
      /\bfnirsi\b/i,
      /usb test cihazi|usb tester/i,
      /\bfnb\d+/i,
      /usb.{0,15}volt.{0,5}amper/i,
      /usb dijital.*test/i,
      /\bnanovna\b|vektor ag analizor|anten analizor/i,
      /lazer.{0,10}metre|lazer mesafe olcer|lazermetre/i,
      /dijital (mikrometre|kaliper|cetvel)/i,
      /(egim|aci) olc/i,
      /\btakometre\b|rpm test|motor hiz olc/i,
      /\banemometre\b|ruzgar (hiz|olc|olcer)/i,
      /\bdesibel\b|ses (seviye|kalite) olc|gurultu olc/i,
      /(ph metre|ph olc|ph kalibr)/i,
      /(luksmetre|luks olc|isik olc|lux meter|pozometre)/i,
      /(toprak nem|higrometre|odun nem|nem olc|kereste test|ahsap nem)/i,
      /(termometre|sicaklik olc).{0,30}(prob|infrared|temassiz|dijital|lcd|isi)/i,
      /temassiz ates olcer|isi olcer.*termometre/i,
      /refraktometre|brix (olc|portatif|seker)/i,
      /elmas.*(seçici|secici|test cihazi)|mucevher olc/i,
      /pil (kapasite|olcum|test).{0,15}(cihazi|olcer|aleti|olc)/i,
      /(transistor|diyot|triyot|kapasitor|kondansator|lcr|esr).{0,15}test/i,
      /(ahsap|kereste|odun) nem olc/i,
      /emf.*elektromanyetik|radyasyon test/i,
      /\bco (sensor|sireni|gaz)\b|karbon ?monoksit/i,
      /gaz (analiz|kacak|dedektor|el dedektor)/i,
      /(deprem|hava kalitesi|formaldehit) (dedektor|alarm)/i,
      /pm2\.?5.*hava (dedektor|kalite)/i,
      /pulse oksimetre|oksimetre/i,
      /(usb|qc4|pd3).*test/i,
      /\bkalinlik olc\b/i,
      /(network|rj45|kablo) test cihazi/i,
      /endoskop.*kamera/i,
      /\biking 750\b|maden bulucu vibrator/i,
      /(swr|frekans sayaci|frekans olc|sw-?\d+|frekansi).*(olc|sayaci|metre)/i,
      /\bvhf uhf\b/i,
      /lojik analizor/i,
      /lcd.*lityum.*pil/i,
      /18650.*test/i,
      /smart sensor (as|ar|st)\d/i,
      /jenerator kontrolor.*dijital metre/i,
      /\bgn\d{3,4}\b/i,
      /sinyal (uretec|simulator)/i,
      /dijital.{0,10}(voltaj.*sinyal|akim simulat)/i,
      /sw-?102-?uv/i,
      /pwm sinyal jenerat/i,
      /guc analizor.*watt metre/i,
      /pH olcum/i,
      /mt\d{2,3}.{0,15}(luks|nem|ahsap|metre)/i,
      /uydu sinyal olc/i,
      /\bdebimetre\b|debi olcer|akis turbini/i,
      /(temassiz|kontrol) kalemi (voltaj|ac|dedektor|gerilim|ac gerilim)/i,
      /(dedektorlu|isikli) kablo voltaj test/i,
      /dijital elektrik kontrol kalemi/i,
      /\bht\d{3}\b/i,
      /\bbt168\b|\bbt-?168\b/i,
      /\bttp223\b.*sensor/i,
      /touch sensor.*ttp/i,
      /dijital dokunma sensor/i,
      /pc-?101.*klor.*ph/i,
      /(klor|ph) su kalitesi olcum/i,
      /transistor test cihazi/i,
      /max1268|max31865 termokupl/i,
      /\bxr2206\b.*sinyal/i,
      /(stp|kalinlik|ultrasonik kalinlik) olc/i,
      /smart sensor as.{0,5}\d/i,
      /lcd co sensor.*sireni/i,
      /atc.{0,15}refraktometre/i,
      /(brix|seker yogunluk) olc/i,
    ],
    not: [
      /uydu yon bulucu|sat finder|finder.*uydu|sinyal guclendirici/i,
      /sinyal dedektor.*cc308|anti.?casus/i,
      /metal dedektor|altin dedektor|md-?\d{3,4}|pinpointer/i,
      /park sensoru|tpms|lastik basin[cs]/i,
      /soket test cihazi.*akilli/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // AUDIO / AMFI / HOPARLÖR
  {
    slug: "audio-amfi-hoparlor",
    patterns: [
      /amplifikator|amfi/i,
      /(tda7297|tda7498|tda7492|tpa3110|tpa3116|tpa3110|pam8610|xh-?m314|xh-?m543|zk-?mt21|zk-?502c|vhm-?\d+|m28 ble)/i,
      /\bdac\b/i,
      /(5\.1|2\.1|2\.0).{0,5}kanal.{0,30}(amfi|amplif|kod cozucu|ses|dolby)/i,
      /(stereo|hifi|hi-?fi).{0,15}(amfi|amplifikat|receiver|ses|module)/i,
      /(bluetooth|kablosuz|kablolu).{0,50}(amfi|ses alic|hoparlor|mikrofon|alici verici|verici alici|gitar|anfi)/i,
      /(handsfree|hands free)/i,
      /\bhoparlor\b/i,
      /mikrofon.*(usb|karaoke|bluetooth|rgb)/i,
      /karaoke mikrofon/i,
      /\bkulaklik\b/i,
      /(kz atr|kz )/i,
      /ses kod cozucu/i,
      /frekans bolucu|crossover/i,
      /spdif|toslink|optik ses/i,
      /audio (alici|verici|extractor)/i,
      /spektrum analizor/i,
      /mp3 ses.{0,15}modul/i,
      /ses (alici|verici|kayit|calma|kart).{0,15}(modul|bluetooth|kablosuz)/i,
      /ses bombasi/i,
      /aux bluetooth/i,
      /apple carplay ses|tv hoparlor/i,
      /\bbluetooth\b.{0,15}(stereo|alici|verici|amfi|receiver)/i,
      /(bluetooth|kablosuz) (gitar|alici|verici)/i,
      /a9 .*gitar|gitar.*sistem.*alici/i,
      /gitar irig/i,
      /sinyal.{0,5}bolu|hoparlor.*filtre/i,
      /sarjli.*gitar.*anfi/i,
      /gitar anfi ses aktarici/i,
      /(\b3 ?yollu|2 ?yollu|3 yollu) hoparlor/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // AYDINLATMA & LED
  {
    slug: "aydinlatma-led",
    patterns: [
      /\bled\b.{0,15}(ampul|serit|spot|projektor|flood|panel|studyo|cob|neon|rgb|grow|backlight|usb serit|isikl|spot led|spotlight)/i,
      /\bampul\b/i,
      /\bampul\b/i,
      /led serit/i,
      /(neon|rgb).{0,10}led/i,
      /e27.*led|e27.*ampul/i,
      /\bgrow (light|lamp)\b/i,
      /(uv|blacklight|ultraviyole|uvb|uvc).{0,15}(ampul|fener|cubuk|lamba|el feneri|isik)/i,
      /(308nm).*el feneri.*uv/i,
      /spektrum lamba|bitki yetistirme/i,
      /(led|akilli) projektor|flood ?light/i,
      /\bprojektor led\b/i,
      /\bled projektor\b/i,
      /solar (bahce|dis mekan|aydinlatma|led|garden|dekor|sensor)/i,
      /solar dis mekan.*led/i,
      /\bring light\b|ring isik|studyo (isigi|isigi)/i,
      /selfie (led|isik|lamba)|youtuber.*isik/i,
      /(kristal led panel|dokunmatik (anahtar|panel|isik)|x ?touch.*kristal)/i,
      /kristal panel.{0,15}(tus|dokunmatik)/i,
      /dokunmatik (duvar|isik).*(anahtar|priz|komutator)/i,
      /komutator/i,
      /led serit tv|backlight|tv arka.*led/i,
      /(arac ici|koltuk alti|ayak alti).{0,15}led/i,
      /avize.*kumand|fan kumand|pervane.*kumand/i,
      /led serit grow/i,
      /(ari|bahce|park).{0,15}(led|aydinlat)/i,
      /yildiz (projeksiyon|projektor|isik)|gece lambasi.*yildiz/i,
      /led.*lamba.*(siyah|sarjli|tasinabilir)/i,
      /\b3lu.*spot|spot led/i,
      /\b3lu spot/i,
      /sarjli.{0,5}led lambasi/i,
      /(15w|50w|10w|72 ?led).*led/i,
      /\bsarjli led\b/i,
      /(rgb|neon).{0,15}serit/i,
      /(5 metre|5m).*led.*(12v|rgb|neon|bluetooth)/i,
      /(bluetooth|app|kontrol).*serit led/i,
      /(bluetoothlu|kablosuz) rgb serit led/i,
      /rgb \+ beyaz kumandali ampul/i,
      /led.*kumandali ampul/i,
      /ultraviyole cubugu/i,
      /\b\d+w led\b.*(beyaz|geçirmez|projektor)/i,
    ],
    not: [
      /xh-?m314|xh-?m543|xh-?m603|bluetooth.*amfi|amfi modulu|amplifikat/i,
      /(akilli|smart|wifi|zigbee|tuya).{0,15}(ampul|serit.*tuya|panel|anahtar|priz|dimmer)/i,
      /isikli kontrol kalem|isikli tester|isikli multimetre/i,
      /sonoff/i,
      /broadlink/i,
      /wifi.*kristal/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // GÜÇ KAYNAĞI & DC-DC
  {
    slug: "guc-kaynagi-donusturucu",
    patterns: [
      /\bdc-?dc\b/i,
      /\bbuck (cevirici|converter|donusturucu)\b/i,
      /(step.?down|step.?up|boost|voltaj yukseltici|voltaj dusurucu)/i,
      /\b(lm2596|lm2965|xl4016|xl4015)\b/i,
      /\bdps\d+/i,
      /\briden\b/i,
      /\b(rd6006|rd6012|dps5020|dps3005)/i,
      /guc (kaynagi|modulu) (modul|programlanabilir|wifi|bluetooth|usb)/i,
      /programlanabilir.{0,15}guc/i,
      /(bms|batarya koruma|li-?ion pil koruma|lityum.{0,10}koruma)/i,
      /\b(2s|3s|4s|5s|6s).{0,10}(10a|20a|40a|100a).*(lityum|li-?ion|batarya|pil)/i,
      /sarj kontrol devre/i,
      /\binverter\b/i,
      /frekans donusturucu.*motor hiz/i,
      /(solar sarj|solar regulat|solar kontrol|gunes.{0,10}sarj)/i,
      /\bpwm\b.*(solar|sarj)/i,
      /transformator/i,
      /super.?kondansator|superkapasitor|super kapasitor/i,
      /(scr|tristor).{0,15}(voltaj|hiz|guc)/i,
      /guc regulator|guc kontrol kart/i,
      /(voltaj|gerilim) regulator/i,
      /xh-m603|hcw-?m\d+/i,
      /power supply|guc kaynagi/i,
      /atx guc kaynagi.*\b24\s?pin\b/i,
      /guc kablosu.*pci-?e|pci.?express.*guc/i,
      /elektronik transformat/i,
      /atx dual psu coklayici|dual psu/i,
      /(8a|10a|15a|20a|30a|60a|200w|300w|400w|500w|1200w|1800w|6000w).*(buck|boost|step|voltaj|amper)/i,
      /aku sarj/i,
      /(li-?po|lipo).*(sarj|denge|balans)/i,
      /(tp4056|sarj|sarj.{0,5}modul).*(18650|li-?ion|lityum)/i,
      /guc kaynagi denetleyici/i,
      /power.{0,5}supply.{0,5}modul/i,
      /breakout port.*guc/i,
      /(12 port|17 port).*guc kayn/i,
      /\bbreakout.*port\b/i,
      /(6 pin|8 pin).{0,15}pci.?e.{0,15}guc kablosu/i,
      /gpu mining guc kablosu/i,
      /ruzgar turbini.*regulator/i,
      /jenerator kontrol cihazi/i,
      /universal sarj.*adaptor/i,
      /kademeli universal sarj/i,
      /\b\d+v-\d+v.*\d+\s?amper.*sarj/i,
      /5 amper kademeli universal/i,
      /mikro usb 3\.7v.*5v.*lityum sarj/i,
      /lityum batarya sarj cihazi.*powerbank/i,
      /\bpowerbank\b.*modul/i,
      /(6 pin|8 pin) pci/i,
      /(6\+2|8 pin).{0,15}pci-?e/i,
    ],
    not: [/(rs2205|xxd a2212|rc 2440|an2212|a2212|rc planor|rc fircasiz)/i],
  },

  // ════════════════════════════════════════════════════════════════════════
  // ELEKTRONİK MODÜL & GELİŞTİRME KARTI
  {
    slug: "elektronik-modul-gelistirme",
    patterns: [
      /\barduino\b/i,
      /\b(uno|mega 2560|nano|pro mini|esplora|attiny|atmega)\b/i,
      /\besp32\b/i,
      /\besp8266\b/i,
      /\b(d1 mini|d1 ch340|nodemcu)\b/i,
      /\b(stm32|cortex-m|m0\+)/i,
      /raspberry pi/i,
      /\bpic\b.{0,15}(programla|k150|microchip)/i,
      /pickit\d/i,
      /msp430|launchpad/i,
      /\b(plc|fx1n|fx3u|s7-?200|s7-?2000|s7-?300|s7-?400)\b/i,
      /(usb.?ppi|mitsubishi).*plc/i,
      /\bsiemens\b/i,
      /amsamotion/i,
      /\bds18b20\b/i,
      /\bpt100\b/i,
      /\bmax\d{4,5}\b/i,
      /\bmpu\d{4}\b/i,
      /\bicm-?\d+/i,
      /\bfpm10a\b|parmak izi okuyucu sensor/i,
      /(tp4056|lm2596|l298n|l298p|tda74\d{2}|pam8610|pca9685|tb6612|max31865|mg996|mg90).*modul/i,
      /\b(mq-?\d+|dht11|dht22)\b/i,
      /\boled\b.{0,15}(ekran|display|grafik)/i,
      /(grafik|monokrom).?lcd.{0,15}ekran/i,
      /\blcd.{0,5}(0\.96|1\.3|1\.4|0,96|grafik|ekran kontrol)/i,
      /\b(usbasp|st-?link|j-?link|stm8|stm32 programlayici)\b/i,
      /(ezp\d+|t48|tl866|atmel|avr).{0,15}(program|flash|eeprom)/i,
      /(cc2531|zigbee.*sniffer|cc debugger|hackrf|portapack)/i,
      /(sdr|software defined radio)/i,
      /1\.4.*lcd akilli/i,
      /(rfid) kart.{0,15}(okuyucu|klonl|kopyalama|yazici)/i,
      /125khz.*rfid/i,
      /(hc-?05|hc-?08|hm-?10|nrf24).*modul|bluetooth modul/i,
      /servo (motor )?tower pro/i,
      /grafik (ekran|lcd) (kit|modul|kontrol)/i,
      /\b(stm32f4|stm32f407|stm32f401|stm32f1|f407vet)/i,
      /\bcc2540\b|\bcc2541\b/i,
      /(plc programla|plc kablo|s7-?200 300|plc adaptor)/i,
      /(plc kart|plc pano|plc regulator)/i,
      /(gelistirme kart|modul).*(wifi|bluetooth|usb|micro)/i,
      /\bbreakout panosu\b/i,
      /\b(spi|i2c|uart)\b.{0,15}(programlayici|adaptor)/i,
      /(amsamotion|6es7|6gk1).*plc/i,
      /(eeprom|flash).{0,15}(yuksek hiz|programlayici)/i,
      /\b(38\d{2}|atmega\d{3}).*cip/i,
      /joystick potansiyometre/i,
      /servo modu/i,
      /servo surucu modu/i,
      /(grafik|oled|monokrom)\s?lcd/i,
      /(ekran modul|lcd modu)/i,
      /grafik (12864|128x64)/i,
      /modul.*(arduino|esp|stm|gelistirme)/i,
      /pcb kart|baskili devre kart/i,
      /\bcanbus.*shield\b/i,
      /\bft232rl\b/i,
      /\batmel\b/i,
      /(ppi|mpi).{0,15}(donusturucu|kablo|adaptor)/i,
      /enkoder.*(modul|potansiyometre)/i,
      /role (shield|kart|modul).*(arduino|esp|wifi|5v)/i,
      /(wifi.{0,5}role|esp.*role).{0,15}(modul|kart)/i,
      /baskili devre kartı/i,
      /\bgps\b.*(neo|modul|antenli)/i,
      /raspberry pi.*kamera/i,
      /(sarj|charge).*kart.*(18650|li-?ion|powerbank)/i,
      /sicaklik kontrol devre/i,
      /sicaklik nem kontrol cihazi/i,
      /termostat.*ntc/i,
      /\bstc-?3028\b/i,
      /\bw1209\b/i,
      /elektronik bilesen.*transistor/i,
      /transistor.{0,5}2sa\d/i,
      /pci.{0,5}express.{0,15}(usb|hub|fan)/i,
      /esp32cam/i,
      /lcd ekranli pil kapasitesi.{0,30}dahili direnc/i,
      /(8 giris|14 giris|24 giris).*role cikis/i,
      /\bttp223\b/i,
      /digital touch sensor/i,
      /\bttp223b\b/i,
      /\bmlx906\d+\b/i,
      /ir dizi termal/i,
      /termal goruntuleme.*kamera.*pixel/i,
      /\bkllisre\b|kllisre.*ddr/i,
      /(ddr3|ddr4) \d+gb.*ram/i,
      /lilygo lora/i,
      /\blora32\b/i,
      /sx1276/i,
      /omron tl-?q5mc/i,
      /proximity anahtari.*endüktif/i,
      /\bproximity\b.*sensor/i,
      /endektif sensor/i,
      /(hareket sensoru|pir).*(dc 12v|24v|hareket sensorlu)/i,
      /hareket sensoru dc.*pir/i,
      /pir kizilotesi.{0,15}(180 derece|enerji|kolay)/i,
      /omron.*sensor/i,
      /omron tl-?q/i,
      /\bcc2531\b|\bcc2540\b|\bcc2541\b/i,
      /tec1-?12706|tec1-?12708|peltier sogut/i,
      /termoelektrik sogut|peltier/i,
      /xilinx|xilinx platform/i,
      /\bcpld\b|\bfpga\b/i,
      /(uctus|uçuş) kontrol/i,
      /uçuş kontrol kart|uctus kontrol kart/i,
      /\bf405-?wing\b/i,
      /matesys/i,
      /(usbasp|stm32 programlayici|atmel programlayici)/i,
      /elektronik tip mini yan keski/i,
      /xinlinx|fpga cpld|dlc9lp/i,
      /ps4 analog thumb.*sensor.*potansiyometre/i,
      /analog thumb cubuklari/i,
      /lcd.*otomatik.*bahce sulama/i,
      /bahce sulama (zamanlayici|sistemi).*kontrol/i,
      /schumann.*rezonans.*jenerator/i,
      /ses rezonator/i,
      /(7\.83hz|ultra dusuk).*frekans.*darbe/i,
      /(charge|sarj).*module.*(18650|li-?ion|powerbank|micro|cift)/i,
      /joystick.*potansiyometre.*5k/i,
      /5 metre.*hd 15 pin/i,
      /5 metre.{0,15}kablo.{0,30}hd 15 pin/i,
      /\b3d printer\b/i,
      /pcb 12v.*nokta kaynak/i,
      /motor pca9685.*step/i,
      /1\.4 128x64 lcd akilli/i,
      /\b3d touch\b.*sensor/i,
    ],
    not: [
      /3d (yazici|touch sensor)|skr|mks|tft\d{2}/i,
      /(cnc|mach3|nvem|ddcs|edg\d|lf77|akz250|neje)/i,
      /(riser).*(009|010|mining|x16)/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // TELEFON & TABLET AKSESUAR
  {
    slug: "telefon-tablet-aksesuar",
    patterns: [
      /(sarj|charge) kablo/i,
      /type-?c (sarj|kablo|kablosu)/i,
      /(usb-?c|type-?c).{0,15}sarj kablosu/i,
      /lightning.{0,15}(kablo|sarj|adaptor|to)/i,
      /(60w|100w|pd).{0,15}(sarj|kablo|adaptor|hizli sarj|charging|istasyon)/i,
      /sarj istasyonu/i,
      /(iphone|ipad|samsung galaxy|huawei|xiaomi).{0,40}(kilif|magsafe|kordon|kapak|tablet|silikon)/i,
      /(magsafe|kilif|kapak).{0,15}(iphone|ipad|tablet|telefon)/i,
      /\biphone\b.{0,30}(kilif|kapak|magsafe|silikon|lansman)/i,
      /apple watch.*kordon/i,
      /\bpaslanmaz.*kordon\b/i,
      /tripod.*(selfie|telefon|kamera|gopro|studyo)/i,
      /\bselfie cubugu\b/i,
      /telefon tutucu/i,
      /ahtapot tripod/i,
      /telefon (lens|buyutec|kamera|zoom)/i,
      /balik goz lens|fish eye/i,
      /\b\d+x optik (zoom|buyutme).{0,15}(telefon|kamera|mobil)/i,
      /stylus|tablet kalem|cizim kalem.*dokunmatik/i,
      /seyahat adaptor|dunya adaptor/i,
      /(lightning|micro usb|type-?c).{0,15}(adaptor|donustur|cevirici)/i,
      /telefon ekran yansitma type-?c/i,
      /apple uyumlu lightning to/i,
      /(stylus|kalem).{0,30}(dokunmatik|cizim|disk uclu)/i,
      /bluetooth uzaktan fotograf.*kumanda/i,
      /uzaktan kumandali (fotograf|video cekme)/i,
      /sarj kablosu.{0,5}\d+m/i,
      /\b\d+m.*(sarj kablosu|type.?c|usb-?c).*sarj/i,
      /(android|ios|iphone).{0,15}sarj kablosu/i,
      /520w.*sarj istasyon/i,
      /(usb 3\.0|type-?c).*sarj istasyon/i,
      /sarjli.*hava pompasi.*(giysi|vakum|tiny|sisirme)/i,
    ],
    not: [
      /(lightning|type-?c).*hdm/i,
      /samsung 870|sandisk ultra 3d|kingston kc600/i,
      /samsung galaxy tab.*klavye|ipad.*klavyel/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // BİLGİSAYAR DONANIM (RTX, SSD, RAM ...)
  {
    slug: "bilgisayar-donanim-sogutucu",
    patterns: [
      /(rtx|gtx|geforce|radeon|gddr\d|ekran karti.{0,20}gaming)/i,
      /\bssd\b/i,
      /\b(2\.5|m\.2).*ssd\b/i,
      /ssd kutu|external ssd|harici ssd/i,
      /\b(ddr3|ddr4)\b.{0,15}(8gb|16gb|ram|3200|2400|mhz)/i,
      /\bram\b.{0,15}(8gb|16gb|3200|2400|ddr)/i,
      /mining anakart|btc-?t37|bcm.*mining/i,
      /bilgisayar kasasi/i,
      /gaming.*kasa.*temperli/i,
      /(macbook|laptop|notebook).{0,15}(stand|standi|tutucu|ayarli)/i,
      /pc sogutma|telefon sogutucu|cep telefon.*radyator|telefon (vakum|radyator|fan|sogut)/i,
      /(rgb|manyetik) telefon sogutucu/i,
      /dl0\d.*telefon sogutma/i,
      /x42 telefon tablet.*sogutucu/i,
      /\b(cx07|telefon|cep) sogut/i,
      /(samsung 870 evo|sandisk ultra 3d|kingston kc600)/i,
      /ngff to pcie.*ssd/i,
      /(asus|msi|gigabyte|inno3d).{0,20}(rtx|gtx)/i,
      /(samsung|sandisk|kingston) .{0,20}(\d+gb|\d+tb)/i,
      /plastik alasim ayarli laptop/i,
      /sas sata sunucu sabit disk.*kizagi/i,
      /sff sas sata/i,
      /sunucu sabit disk/i,
      /sas sata.{0,15}(kizagi|tepsi)/i,
    ],
    not: [
      /samsung (aa59|bn59|kumanda)/i,
      /samsung tablet|samsung galaxy tab/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // BİLGİSAYAR ÇEVRE BİRİMİ & BAĞLANTI
  {
    slug: "bilgisayar-cevre-baglanti",
    patterns: [
      /usb hub/i,
      /(usb|type-?c) (coklayici|hub|cogaltici)/i,
      /(\d+ in 1|11.?in.?1|7.?in.?1|8.?in.?1|13.?in.?1|5.?in.?3).*(type-?c|usb|hub|adaptor|cevirici)/i,
      /\b(hdmi|displayport|dp|vga|dvi|scart)\b.{0,80}(cevirici|donusturucu|adaptor|kablo|splitter|switch|distributor|hub|ayirici|ekran)/i,
      /(hdmi|vga|dvi|dp|displayport).{0,15}(cevirici|adaptor|donusturucu|kablo)/i,
      /(scart).{0,15}(cevirici|adaptor|hdmi)/i,
      /4k.*type-?c/i,
      /type-?c.{0,30}(hdmi|vga|rj45|ethernet|sd|tf|kart|hub|otg|adaptor)/i,
      /(otg|kart okuyucu)/i,
      /(sd|tf|microsd|mikro sd|cf|m2|xd).{0,15}kart okuyucu/i,
      /sd.{0,15}kart.{0,15}okuyucu/i,
      /kart okuyucu.{0,15}(usb|otg|type-?c|micro)/i,
      /video (capture|yakalama)/i,
      /(kvm|video wall) (switch|controller|extender)/i,
      /4kvm421|kvm switch 2x1/i,
      /\bkvm\b.{0,15}(usb )?extender/i,
      /video duvar (kontrol|controller|genislet|ekran)/i,
      /video wall controller/i,
      /4k.*video duvar/i,
      /\b\dx\d (video|duvar|wall|hdmi)/i,
      /hdmi (splitter|switch|coklayici|cogaltici|dagitici|birlestirici|bolucu|anahtar)/i,
      /(rj45|cat5|cat6|ethernet).{0,15}(kablo|coupler|extender|splitter|adaptor|cevirici|coklayici)/i,
      /ethernet.{0,15}(cevirici|adaptor|coupler|splitter|kart|dongle|kablo|cogaltici)/i,
      /usb (to|3\.0|2\.0).{0,15}(sata|rj45|ethernet|lan|hdmi)/i,
      /(usb-?ethernet|usb to ethernet|usb-rj45)/i,
      /\b2\.5g\b.*(ethernet|rj45|lan|adaptor)/i,
      /pcie.{0,5}(lan|wi-?fi|ethernet|wifi|2\.5g|6e|5400)/i,
      /(wifi|wi-?fi).{0,15}(adaptor|dongle|kart|usb antenli|adapter)/i,
      /bluetooth.{0,15}(adaptor|dongle|aparat|alici verici)/i,
      /(magbox|wireless adaptor.*150 mbps|wifi.*1300\s?mbps|usb wifi)/i,
      /(sfp|sfp\+|sfp\b).{0,15}fiber/i,
      /(sc apc|sc\/?apc|fc.?to.?st|fiber optik (patch|adaptor|kablo|modul|splitter|konnektor))/i,
      /fiber optik/i,
      /\bftth\b/i,
      /fiber.*medya donus/i,
      /(cd|dvd) surucu/i,
      /harici (dvd|cd|hdd|ssd) (surucu|kutu|kasasi)/i,
      /(hdd|ssd) kasa/i,
      /(sata|nvme|ngff|m\.2).{0,15}(kasa|kutu|adaptor|donusturme|to usb)/i,
      /(usb 3\.0|usb 3\.1|usb-c).{0,15}(sata|hdd|ssd|hub|harici|external)/i,
      /(hdmi.*ses ayirici|hdmi extractor)/i,
      /4k.{0,15}capture/i,
      /(arc 2\.1|spdif|optik stereo).{0,15}(hdmi|toslink)/i,
      /(av to hdmi|hdmi to av|scart to hdmi|rca to hdmi)/i,
      /\bps2 to hdmi\b/i,
      /(playstation|ps[234]).*hdmi/i,
      /(wii hdmi|wii2hdmi)/i,
      /kablosuz.*hdmi/i,
      /android tv.*klavye/i,
      /(grafik tablet|huion|wacom)/i,
      /(rs485 ppi|usb to ppi|usb to rs485 plc|usb-rs485)/i,
      /(pci.?e|pci.?express).{0,15}(adaptor|m\.2|nvme|ssd|x4|x16)/i,
      /pcie.{0,5}m-?key/i,
      /(riser).*(009|010|mining|x16|x1|x4)/i,
      /\bnvme\b.{0,15}(adaptor|kasa|donustur)/i,
      /\bpoe.*\b(usb|type-?c|5v|12v)\b.*donus/i,
      /web kamera|webkam/i,
      /(usb|type-?c|otg).{0,15}flash bellek/i,
      /(otg|usb).{0,15}flash/i,
      /microsd kart hafiza/i,
      /512gb microsd|256gb microsd|128gb microsd/i,
      /(usb 3\.0|usb-c).*(2\.5g|gigabit|rj45)/i,
      /\bot[gj].{0,5}adaptor\b/i,
      /(lightning|type-?c).*hdmi.*aktar/i,
      /(scart|av|rca).{0,15}(hdmi|tv)/i,
      /\bsplitter\b/i,
      /\bhdmi 2\.0\b/i,
      /(rj45|cat5|cat6|fiber).{0,15}(extender|coupler|splitter|repeater|injector)/i,
      /grafik cizim tablet|huion 420/i,
      /(lan|ethernet).{0,15}(splitter|coupler|extender|repeater|injector)/i,
      /\b(ngff|nvme|m\.2).{0,15}(adaptor|to usb|to pci|to pcie|harici|kasa|kutu)/i,
      /(canli yayin|live).{0,30}(usb|capture|kayit|capture)/i,
      /(2pin|2 pin|4-pin|atx).*pc anakart acma kapama/i,
      /acma.{0,3}kapama (butonlu )?guc anahtari/i,
      /atx guc anahtari/i,
      /\bsata fan cogaltici\b/i,
      /(ide|sata).*fan.{0,5}(cogaltici|hub)/i,
      /pci.?e.*x4.*adaptor/i,
      /(usb)\s*to\s*(sata|rj45|hdmi|vga|dvi|ethernet)/i,
      /li kasa.*ssd|harddisk kutusu|harddisk hdd kutu/i,
      /(harddisk|sabit disk).{0,10}kutu/i,
      /(2\.5g|gigabit).{0,15}(adaptor|ethernet|usb)/i,
      /apple iphone\/ipad lightning to ethernet/i,
      /(scart-kablo|scart kablo).*hd/i,
      /telefon.{0,15}sd.*kart okuyucu/i,
      /(usb 3\.0|usb-c).{0,5}sata/i,
      /m\.2 nvme.*adaptor/i,
      /(anycast|m9 plus).*kablosuz hdmi/i,
      /kablosuz hdmi.*alici verici/i,
      /anunnaki.{0,15}(hdmi|hdm)/i,
      /(rca|av).{0,30}(hdmi|hdm).*cevirici/i,
      /mini pci-?e.*ekran karti.*aparati/i,
      /3in1 lightning micro usb/i,
      /3 in 1 type-?c/i,
      /pci express coklayici/i,
      /pcie.{0,15}coklayici/i,
      /(5 metre|5m).*(15 pin|vga|hd kablo)/i,
      /15 pin.{0,15}(5 metre|5m).*kablo/i,
      /sata sunucu sabit disk/i,
      /512gb microsd.{0,15}hafiza/i,
      /lcd 800.{0,5}480.*hdmi/i,
      /5 inch hdmi lcd ekran/i,
      /(hdmi.*l tip|hdmi l tip|hdmi 90 derece)/i,
      /3in1 lightning|3in1 type-?c/i,
      /usb3\.0 card okuyucu/i,
      /(ez |easy |kolay )rj45/i,
      /idc patch panel.*rj45/i,
      /poe repeater.*coklayici/i,
      /poe.*5 port.{0,5}extender/i,
      /lan.*splitter.*4 port|ethernet splitter 1x4/i,
      /mouse jiggler/i,
      /fare imlec tasiyici/i,
      /mouse imlec oynatici/i,
      /hareket cihazi.*fare/i,
      /(usb|type-?c) bellek/i,
      /32 gb usb bellek/i,
      /usb (3\.0|3\.1|2\.0).*bellek/i,
      /usb-?c.*micro sd kart/i,
      /android.{0,5}iphone.{0,15}hafiza karti okuyucu/i,
      /(displayport|dp).{0,30}(hdmi|hdm)/i,
      /dp.*hdmi.*4k/i,
      /4k destekli.*displayport/i,
      /dvi to hdmi/i,
      /24\+1 dvi/i,
      /turkcell sim/i,
    ],
    not: [
      /grafik tablet huion 420|huion 420/i,
      /(samsung galaxy tab|ipad).{0,30}(klavye|klavyel)/i,
      /samsung 870 evo|sandisk ultra 3d|kingston kc600/i,
      /broadlink|sonoff|tuya|smart life|zigbee|aqara|akilli (anahtar|priz)/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // KAMP, OUTDOOR & MOBİLİTE
  {
    slug: "kamp-outdoor-mobilite",
    patterns: [
      /kamp.{0,15}(cadir|dus|giyinme|alan|plaj|wc)/i,
      /giyinme cadir/i,
      /(mangal|barbekü|barbeque|komurlu)/i,
      /flextail memphis/i,
      /sonar balik bulucu|fish finder|balik bulucu/i,
      /kopek (egitim|tasma)/i,
      /bisiklet (stop|sele|airzone|selesi|arka stop|sele diregi)/i,
      /motosiklet (alarm|interkom|disk kilid|tasma|tpms|bluetooth interkom)/i,
      /\bgy-?neo6m\b/i,
      /\b110 db.*alarm disk kilid/i,
      /motoalarm/i,
      /pencereli cadir|otomatik giyinme/i,
      /(120x120x190|portatif cadir)/i,
      /\bsolar fiskiye\b/i,
    ],
    not: [/gpsli.{0,15}arac|arac ici dvr/i],
  },

  // ════════════════════════════════════════════════════════════════════════
  // SPOR & FITNESS
  {
    slug: "spor-fitness",
    patterns: [
      /\bab roller\b/i,
      /(barfiks|dips|barfix|pull up)/i,
      /\b(dambil|dumble|dumbbell|kettlebell)\b/i,
      /\bel yayi\b/i,
      /(boks|kick.?boks|boxing) (torbasi|eldiveni|seti|hedef|aleti)/i,
      /kondisyon (bisiklet|kurek|kureg|aleti)/i,
      /kosu bandi/i,
      /\bhula hoop\b/i,
      /step makin|cross step|stepper.*lcd|crosstep/i,
      /yoga|pilates|foam roller|kopuk rulo/i,
      /direnc (bandi|lastigi)/i,
      /kelebek (kol|bacak).*calistir/i,
      /sinav (tahta|tahtasi|aleti|aparat|bar)/i,
      /push.?up (bar|stand)/i,
      /spin bike|bisiklet.*fitness/i,
      /hidrolik (kurek|twister|guc twister)/i,
      /\bsehpa\b.{0,15}(fitness|spor|sehpah|setup output)/i,
      /(situp|sit up).*output/i,
      /\b\d+kg agirlik dambil/i,
      /smart hula hoop/i,
      /el ayak.{0,15}(silikon|agirlik|bilek)/i,
      /silikon bilek agirligi/i,
      /spor ekipman|fitness ekipman/i,
      /fitness kurek|fitness kureg|hidrolik (kurek|kureg)/i,
      /14in1 dijital sayacli sinav/i,
      /push up.{0,15}stand/i,
      /spor (egzersiz|aleti|bilek)/i,
      /(bilek|kol|baca) guc(lendir|lendirici)/i,
      /amorti(sorlu)?.*kurek|hidrolik.*kurek/i,
      /\bspor.{0,10}eg(zersiz|sersiz)/i,
      /\bplank\b/i,
      /sinav cekme/i,
      /\bbarbansiz\b/i,
      /el ve ayak mini egzersiz/i,
      /pedal egzersiz/i,
      /\b\d+kg.{0,5}(dambil|dumble|kettlebell)/i,
      /\b5-60 ?kg.*el yay/i,
      /sayacli.*el yayi/i,
      /(el|bilek|kas) guclendirme/i,
      /metal push up stand/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // KİŞİSEL BAKIM, GÜZELLİK & SAĞLIK
  {
    slug: "kisisel-bakim-saglik",
    patterns: [
      /(dermapen|derma pen|dr pen|derma roller)/i,
      /plazma (pen|kalem).*akne|plasma pen plexr|plasma mole/i,
      /(akne|ben|sigil|leke).*cikar/i,
      /agiz dusu|water ?pulse|flosser/i,
      /ultrasonik (dis|temizleyici|tartar|yikama)/i,
      /(tiras|sakal|epilasyon|sac bakim|sac duzlestir|sac firca)/i,
      /braun.*tiras/i,
      /(manikur|pedikur|torpu|kalici oje|tirnak)/i,
      /protez tirnak/i,
      /vakumlu yuz.*temizle|yuz vakum/i,
      /\bgozenek\b/i,
      /(cilt sikilastir|germ|iz leke|yuz utusu|hifu|dermapen)/i,
      /pulse oksimetre|oksimetre/i,
      /isitme cihaz/i,
      /\bbluetooth.{0,5}tarti\b|baskul.{0,15}bluetooth/i,
      /(akilli|bluetooth).{0,15}(tarti|baskul)/i,
      /vucut kitle endeks/i,
      /beyaz gurultu.*(bebek|ses|ninni|uyku)/i,
      /(kolik|uyku|ninni).{0,15}(makine|cihaz|bebek)/i,
      /6 in 1 derma roller/i,
      /yuz vakum/i,
      /(yuz|cilt).*temizle.*(akne|gozenek|vakum)/i,
      /silikon sac derisi masaj/i,
      /sac bakim.*tarak/i,
      /mijia eraclean ultrasonik|ultrasonik yikama temizleme/i,
      /strong 210 manikur/i,
      /titanyum uclu.*dermaroller/i,
      /vakumlu akne/i,
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // EV EŞYASI, KIRTASİYE & DEKORATİF
  {
    slug: "ev-esyasi-kirtasiye-dekoratif",
    patterns: [
      /\ba4 saman kagit|kraft.*saman kagit/i,
      /\bgiyotin\b.*(kagit|kesme)/i,
      /(metal kollu|surgulu|tablali).*giyotin/i,
      /\bkesme mati|cutting mat|kesim mati/i,
      /lcd yazi tablet|grafik not yazma|cizim resim tablet/i,
      /(huion|wacom|grafik tablet)/i,
      /huion 420/i,
      /\br400\b.*sunum|powerpoint presenter/i,
      /reklam oynat/i,
      /yaris(ma)? soru cevap|bilgi yarismasi (zil|buton)/i,
      /yarisma soru.*butonu/i,
      /soru cevap yanit butonu/i,
      /el terminali/i,
      /(starmaster|yildiz.*projeksi|gece lambasi.*yildiz)/i,
      /(ugur|tilbe home)/i,
      /\bkaktus\b.*(sarki|dans|ses taklit)/i,
      /(kitap|sozluk) (sekl|kasasi|kumbara)/i,
      /3d pen|3d yazici kalem|3 boyutlu yazici kalem/i,
      /patates sogan|sebze dograyici|patates.*dograyici/i,
      /dikis makin/i,
      /mini buzdolab|mobicool/i,
      /klozet (firca|firçasi|firca seti)/i,
      /klozet firca/i,
      /matkap ucuna takilan temizlik firca/i,
      /(kuyumcu|mutfak|hassas).{0,15}(terazi|tarti|10kg|1gr hassasiyet)/i,
      /\b(sf400|mini lcd buyuk ekran).*(terazi|tarti)/i,
      /buyutec.{0,15}(led|yasli|okuma|cocuk)/i,
      /(zoom buyut|buyutmeli.*led isikli|buyutec.*led)/i,
      /mucevher mikrometre/i,
      /\b3d pen\b/i,
      /naylon poset (kapatma|yapistir)/i,
      /(fs200|fs300).*naylon poset/i,
      /ambalajlama makin/i,
      /sise agzi.*kapatma/i,
      /(uzaktan kumandali|uzaktan kontrol).{0,15}(buton|tek tus|kapi zili|melodi)/i,
      /melodili.*kapi zili/i,
      /kup alarmli|takvim termometre.*masa saat/i,
      /(7 renk|xxl) dijital lcd.{0,15}masa|masa saat/i,
      /esnek ahtapot tripod/i,
      /tilbe home|wc firca/i,
      /\bsoylu .*samsung.*kumand|samsung uyumlu kumanda|samsung tv kumand/i,
      /samsung (aa59|bn59|hd 4k smart tv kumand)/i,
      /sarjli.{0,5}supurge|elektrik supurge/i,
      /reklam (oynatici|tanit)/i,
      /isletme tanitim/i,
      /matkap.*temizlik firca/i,
      /elektronik.{0,5}sarjli.*hava pompasi.*(giysi|sisirme|vakum|tiny pump)/i,
      /sisirme.*vakumlama aleti/i,
      /tiny pump/i,
      /esnek.{0,5}ahtapot/i,
      /\bnaylon poset/i,
      /\bdikis\b/i,
      /\bsewing\b/i,
      /\bsoylu.*samsung.*kumand/i,
      /lcd grafik.{0,5}not yazma/i,
      /(8\.5 ?inç?|8\.5 ?in[cç]) lcd grafik/i,
      /lcd ?grafik ?not ?yazma/i,
      /(mikroskop|biyolojik mikroskop) seti/i,
      /mikroskop 2.li set cocuk/i,
      /(durbun|dürbün|teleskop|monocular).{0,15}(zoom|optik|hd|el)/i,
      /\bmonocular\b/i,
      /\b60x60 durbun\b/i,
      /(ozel|otel) tasarim banyo bataryasi/i,
      /robotik bahce sulama/i,
      /klozet firca.*silikonlu/i,
      /(ucuz )?dijital mutfak gida termometr/i,
      /yemek isi sicaklik olcer prob/i,
      /samsung aa59.*kumanda|samsung bn59.*kumanda/i,
      /samsung uyumlu kumanda/i,
      /pateş soğan|patates sogan sebze/i,
      /\bisletme tanitim ekrani\b/i,
      /\b3 baslikli.*kuvet temizleme/i,
      /\b8\s?in[cç]?\b.{0,5}lcd grafik/i,
      /\bsarki soyleyen kaktus\b/i,
      /(klor|ph) yogunluk/i,
      /\b(mavi|pembe).*gece lambasi.*yildiz/i,
      /\bturkcell\b.*sim/i,
      /turkcel.*1yil.*sim/i,
      /\bsimkart\b|sim kart.*yil/i,
      /\b\d+gb\d+yil\b/i,
      /(uzaktan kumandali|kablosuz).*spot.*led.*lamba/i,
      /3lü spot led/i,
      /(uzaktan kumandali|wireless ppt) (sunum|kumandasi|powerpoint|presenter)/i,
    ],
    not: [
      /\b3d touch sensor\b|\b3d printer\b|\bender3\b/i,
      /sonoff.*pir2/i,
      /(akilli|smart) kapi kilid|akilli kilit|ttlock/i,
    ],
  },
];

// Pre-normalize all rule pattern sources to ASCII so they match normalized input
const RULES: Rule[] = RULES_RAW.map((r) => ({
  ...r,
  patterns: r.patterns?.map((p) => new RegExp(normalize(p.source), p.flags)),
  not: r.not?.map((p) => new RegExp(normalize(p.source), p.flags)),
  brand: r.brand ? new RegExp(normalize(r.brand.source), r.brand.flags) : undefined,
}));

// ── Classification logic ──────────────────────────────────────────────────
function classify(name: string, brand: string | null): string {
  const n = normalize(name);
  const b = normalize(brand ?? "");
  for (const rule of RULES) {
    // brand-alone rules: brand match is enough
    if (rule.brandAlone && rule.brand) {
      if (rule.brand.test(b)) {
        if (rule.not && rule.not.some((p) => p.test(n))) continue;
        return rule.slug;
      }
      continue;
    }
    // Brand + patterns: both must match
    if (rule.brand && !rule.brand.test(b)) continue;
    if (rule.patterns) {
      const matches = rule.patterns.some((p) => p.test(n));
      if (!matches) continue;
    } else if (!rule.brand) {
      continue;
    }
    if (rule.not && rule.not.some((p) => p.test(n))) continue;
    return rule.slug;
  }
  return "diger";
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, brand: true, categoryId: true },
  });

  const buckets: Record<string, typeof products> = {};
  for (const p of products) {
    const slug = classify(p.name, p.brand);
    (buckets[slug] = buckets[slug] || []).push(p);
  }

  // Summary
  console.log("\n═══ Sınıflandırma Özeti ═══");
  const catBySlug = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));
  for (const c of CATEGORIES) {
    const count = buckets[c.slug]?.length ?? 0;
    console.log(`  ${count.toString().padStart(5)} | ${c.name} (${c.slug})`);
  }
  console.log("");

  // Show Diğer detail
  const diger = buckets["diger"] ?? [];
  if (diger.length > 0) {
    console.log(`\n═══ "Diğer" Kategorisindeki Ürünler (${diger.length}) ═══`);
    for (const p of diger.slice(0, 250)) {
      console.log(`  [${p.brand ?? "?"}] ${p.name}`);
    }
    if (diger.length > 250) console.log(`  ... ve ${diger.length - 250} ürün daha`);
  }

  if (!APPLY) {
    console.log("\n⚠ Dry-run mode. Kategorileri oluşturmak ve atamayı uygulamak için --apply ekleyin.");
    return;
  }

  console.log("\n═══ Kategoriler upsert ediliyor... ═══");
  const slugToId: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const cat = await prisma.productCategory.upsert({
      where: { slug: c.slug },
      create: { name: c.name, slug: c.slug, description: c.description },
      update: { name: c.name, description: c.description },
    });
    slugToId[c.slug] = cat.id;
    console.log(`  ✓ ${c.name}`);
  }

  console.log("\n═══ Ürünler kategorilere atanıyor... ═══");
  let updated = 0;
  for (const [slug, prods] of Object.entries(buckets)) {
    const catId = slugToId[slug];
    if (!catId) continue;
    const ids = prods.map((p) => p.id);
    const result = await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { categoryId: catId },
    });
    updated += result.count;
    console.log(`  ✓ ${prods.length} ürün → ${catBySlug[slug].name}`);
  }
  console.log(`\n✅ Toplam ${updated} ürün güncellendi.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
