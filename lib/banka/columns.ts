/**
 * Banka ekstresi sütun eşlemesi — sabit sütun adı VARSAYILMAZ.
 *
 * Her banka farklı başlık kullanıyor (Enpara "İşlem Tarihi", Garanti "Tarih"…),
 * bu yüzden başlıklar adaylardan eşlenir. Eşleşme büyük/küçük harf ve Türkçe
 * karakter FARKETMEKSİZİN yapılır — `normalizeHeader` ikisini de sildiği için
 * "İşlem Tarihi", "islem tarihi" ve "İŞLEM TARİHİ" aynı adaya düşer.
 *
 * ⚠️ Türkçe 'İ/I' tuzağı (bkz. lib/entegra/import.ts → iadeMi): ham
 * `toLowerCase()` "İ"yi "i̇" (noktalı, 2 karakter) yapar ve eşleşme kaçırılır.
 * Burada NFD ile aksan ayrıştırılıp atılıyor, ardından harfler elle ASCII'ye
 * indiriliyor — yerel ayarlı `toLocaleLowerCase` kullanılmıyor (sunucu
 * ortamının varsayılan locale'i Türkçe olmayabilir).
 */

export type BankaAlan =
  | "tarih"
  | "valor"
  | "aciklama"
  | "tutar"
  | "borc"
  | "alacak"
  | "bakiye"
  | "karsiTaraf"
  | "refNo"
  | "hesap";

export const ALAN_ADAYLARI: Record<BankaAlan, string[]> = {
  // ⚠️ "Valör" BİLEREK tarih adayı: görev tanımı §3 tarihi
  // `Tarih, İşlem Tarihi, Valör, Date` olarak listeliyor — bazı ekstrelerde
  // TEK tarih sütunu Valör'dür. Ama Valör GÜÇLÜ bir tarih adayı DEĞİL:
  // `otomatikEsle` önce Tarih/İşlem Tarihi/Date'i arar, yalnız hiçbiri yoksa
  // Valör'e düşer — aksi hâlde ikisi de olan bir dosyada (işlem tarihiyle
  // valör farklı gün olabilir) Valör tarihi çalar ve gerçek valör sütunu
  // (aşağıdaki `valor` alanı) hiç dolmazdı.
  tarih: ["Tarih", "İşlem Tarihi", "Valör", "Date"],
  valor: ["Valör", "Valör Tarihi", "Valor Tarihi", "Value Date"],
  aciklama: ["Açıklama", "İşlem Açıklaması", "Detay", "Açıklaması"],
  tutar: ["Tutar", "İşlem Tutarı", "İşlem Tutarı (TL)", "Tutar (TL)"],
  borc: ["Borç", "Borc", "Çıkış", "Debit"],
  alacak: ["Alacak", "Giriş", "Credit"],
  bakiye: ["Bakiye (TL)", "Bakiye", "Kalan Bakiye", "Yürüyen Bakiye", "Bakiyesi"],
  karsiTaraf: ["Gönderen/Alıcı", "Ünvan", "Karşı Hesap", "Gönderen / Alıcı", "Karşı Taraf"],
  refNo: ["Referans", "Dekont No", "Sorgu No", "Referans No"],
  hesap: ["Hesap No", "Hesap", "IBAN", "Hesap Numarası"],
};

export const ALAN_ETIKET: Record<BankaAlan, string> = {
  tarih: "Tarih",
  valor: "Valör",
  aciklama: "Açıklama",
  tutar: "Tutar (tek sütun)",
  borc: "Borç (çıkış)",
  alacak: "Alacak (giriş)",
  bakiye: "Bakiye",
  karsiTaraf: "Karşı taraf",
  refNo: "Referans no",
  hesap: "Hesap / IBAN",
};

export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // aksanlar
    .replace(/ı/g, "i") // noktasız ı
    .replace(/[İI]/g, "i")
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Aday listesinden normalize edilmiş arama tablosu — her alan için bir kez kurulur. */
const NORM_ADAYLARI: Record<BankaAlan, Set<string>> = Object.fromEntries(
  (Object.keys(ALAN_ADAYLARI) as BankaAlan[]).map((alan) => [
    alan,
    new Set(ALAN_ADAYLARI[alan].map(normalizeHeader)),
  ])
) as Record<BankaAlan, Set<string>>;

export interface SutunEslemesi {
  /** alan → dosyadaki başlık metni (kullanıcı elle seçtiyse de aynı biçimde). */
  eslesen: Partial<Record<BankaAlan, string>>;
  /** dosyada olup hiçbir alana düşmeyen başlıklar. */
  eslesmeyenSutunlar: string[];
  /** tarih/açıklama/tutar(veya borç+alacak) alanlarından eksik olanlar. */
  eksikZorunlu: BankaAlan[];
}

/** "Valör" hariç güçlü tarih adayları — sırası ÖNEMLİ DEĞİL, tüm başlıklarda aranır. */
const TARIH_GUCLU_ADAYLAR = new Set(["Tarih", "İşlem Tarihi", "Date"].map(normalizeHeader));

/**
 * Başlık satırındaki her hücreyi adaylarla karşılaştırıp otomatik eşler.
 * Bir alan birden fazla başlıkla eşleşirse İLK bulunan kazanır (dosyadaki sütun
 * sırası korunur); aynı başlık iki alana ASLA atanmaz.
 *
 * Tarih İKİ AŞAMADA çözülür (bkz. ALAN_ADAYLARI.tarih yorumu): önce güçlü
 * adaylar (Valör hariç) TÜM başlıklarda aranır; yalnız hiçbiri yoksa ve bir
 * "Valör" sütunu bulunduysa (aşağıdaki normal geçişte `valor` alanına düşer)
 * o sütun tarih için de kullanılır.
 */
export function otomatikEsle(basliklar: string[]): SutunEslemesi {
  const eslesen: Partial<Record<BankaAlan, string>> = {};
  const eslesmeyenSutunlar: string[] = [];

  for (const baslik of basliklar) {
    if (TARIH_GUCLU_ADAYLAR.has(normalizeHeader(baslik))) {
      eslesen.tarih = baslik;
      break;
    }
  }

  for (const baslik of basliklar) {
    if (baslik === eslesen.tarih) continue; // 1. aşamada karar verildi
    const norm = normalizeHeader(baslik);
    if (!norm) continue;
    let bulundu = false;
    for (const alan of Object.keys(ALAN_ADAYLARI) as BankaAlan[]) {
      if (alan === "tarih") continue; // yalnız 1. aşamada dolar
      if (eslesen[alan]) continue; // bu alan zaten dolu
      if (NORM_ADAYLARI[alan].has(norm)) {
        eslesen[alan] = baslik;
        bulundu = true;
        break;
      }
    }
    if (!bulundu) eslesmeyenSutunlar.push(baslik);
  }

  // Tek tarih sütunu Valör olduğu durum: 1. aşamada boş kaldı, 2. aşamada
  // `valor` alanına düştü — aynı sütunu tarih için de kullan.
  if (!eslesen.tarih && eslesen.valor) {
    eslesen.tarih = eslesen.valor;
  }

  const eksikZorunlu = zorunluEksik(eslesen);
  return { eslesen, eslesmeyenSutunlar, eksikZorunlu };
}

/** tarih + açıklama + (tutar YA DA borç+alacak birlikte) yoksa eksik sayılır. */
export function zorunluEksik(eslesen: Partial<Record<BankaAlan, string>>): BankaAlan[] {
  const eksik: BankaAlan[] = [];
  if (!eslesen.tarih) eksik.push("tarih");
  if (!eslesen.aciklama) eksik.push("aciklama");
  const tutarVar = Boolean(eslesen.tutar);
  const borcAlacakVar = Boolean(eslesen.borc) && Boolean(eslesen.alacak);
  if (!tutarVar && !borcAlacakVar) eksik.push("tutar");
  return eksik;
}

