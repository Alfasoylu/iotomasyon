/**
 * WhatsApp numara normalleştirme — TEK KAYNAK.
 *
 * Meta yalnız ülke kodlu, rakam-only numara kabul eder. En sık hata baştaki
 * `0`'ın atılmaması: `0532…` olduğu gibi gönderilirse mesaj SESSİZCE hiç
 * ulaşmaz, hata bile dönmez.
 *
 * Not: alfashome backend'inde aynı mantık var (`src/lib/whatsapp-notify.ts`).
 * İki ayrı uygulama olduğu için kod paylaşılmıyor; kural değişirse İKİSİ
 * birden güncellenmeli.
 */

/**
 * E.164 üst sınırı: ülke kodu dahil en fazla 15 hane. Bundan uzun bir dizi
 * numara DEĞİLDİR — iki numaranın yanlışlıkla birleşmesidir (bkz.
 * `parseRecipients`). Sınır olmasaydı böyle bir dizi "geçerli" sayılır ve
 * mesaj var olmayan bir numaraya gider; Meta hata döndürmez, kimse fark etmez.
 */
export const MAX_PHONE_DIGITS = 15;

/** `+90 532 123 45 67` → `905321234567`. Geçersizse boş string. */
export function normalizePhone(raw: string, defaultCountry = "90"): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = defaultCountry + d.slice(1);
  else if (d.length === 10 && !d.startsWith(defaultCountry)) d = defaultCountry + d;
  return d.length >= 10 && d.length <= MAX_PHONE_DIGITS ? d : "";
}

/**
 * Virgül / noktalı virgül / satır sonu ile ayrılmış listeyi ayrıştırır,
 * normalleştirir, mükerrerleri eler. Aynı numarayı iki kez yazmak iki mesaj +
 * iki ücret demek.
 *
 * ⚠️ BOŞLUK AYIRICI DEĞİLDİR. Türkiye'de numara `0532 111 22 33` diye yazılır;
 * boşlukta bölmek bunu dört parçaya ayırır ve dördü de elenir — liste SESSİZCE
 * boşalır, hiç mesaj gitmez. Ayırıcı yerine numaranın içi temizlenir
 * (`normalizePhone` rakam dışını atar).
 *
 * Boşlukla ayrılmış iki numara ("9053… 9053…") da çalışır: parçanın tamamı
 * tek numara olarak geçmezse (yapışınca 15 haneyi aşar ve elenir) boşluktan
 * bölünüp yeniden denenir. Yani ayırıcı olarak boşluk yalnız BAŞKA TÜRLÜ
 * OKUNAMADIĞINDA devreye girer.
 */
export function parseRecipients(raw: string): string[] {
  const out: string[] = [];
  for (const parca of (raw ?? "").split(/[,;\n\r]+/)) {
    // ÖNCE parçanın TAMAMI denenir — "0532 111 22 33" tek numaradır.
    const tek = normalizePhone(parca);
    if (tek) {
      out.push(tek);
      continue;
    }
    // Tek numara olarak geçerli değil: ya çöp, ya boşlukla ayrılmış birden
    // fazla numara (yapıştıklarında 15 haneyi aşıp elenirler). İkincisini
    // kurtarmak için boşluktan bölüp yeniden dene.
    for (const p of parca.split(/\s+/)) {
      const n = normalizePhone(p);
      if (n) out.push(n);
    }
  }
  return Array.from(new Set(out));
}

/**
 * Şablon parametresi temizliği — Meta'nın SESSİZ reddi (132000) buradan gelir.
 * Parametre değeri satır sonu, sekme veya 4+ ardışık boşluk içeremez.
 */
export function cleanParam(v: unknown, max = 200): string {
  return String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim()
    .slice(0, max);
}

/** Serbest metin penceresi: karşı taraf yazdıktan sonra 24 saat açık kalır. */
export const WINDOW_HOURS = 24;

export function windowOpen(lastInboundAt: Date | null | undefined, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < WINDOW_HOURS * 3600_000;
}
