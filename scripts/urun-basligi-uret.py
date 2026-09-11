# -*- coding: utf-8 -*-
"""Fatura adından pazaryeri başlığı üretir — v2.

v1'de yakalanan ve burada düzeltilen kusurlar:
  1. `İ`.lower() Python'da "i" + U+0307 veriyor → "Evi̇ye", "Si̇yah". Türkçeye
     duyarlı kücuk()/buyuk() yazıldı.
  2. Caps düzeltmesi tüm başlığın %75'i büyükse çalışıyordu; "Alfas BEYAZ ŞELALE
     Lavabo" gibi karışık yazımlar eşiğin altında kalıp caps olarak geçiyordu.
     Artık KELİME BAZINDA: tek başına tamamı büyük olan her kelime düzeltilir.
  3. Not ayracı yalnız çift boşluk/" // " idi; tek boşluklu "//cj" kaçıyor ve
     cümle bölmesi TÜM metni siliyordu. Ayraç artık `//` (boşluktan bağımsız).
  4. Notu cümlenin içinde arayıp tüm parçaları atmak, "… ödendi 1688" gibi
     kuyruklarda başlığın tamamını siliyordu. Artık not kuyruğu SONDAN kelime
     kelime kırpılıyor; gövde korunuyor.
  5. Kırpma MAX'ta kelime ortasından kesiyordu ("… Duvara Monte,") ve iki renk
     varyantını AYNI başlığa düşürüyordu. Artık önce virgülden kırpılıyor,
     kalan kuyruktaki bağlaç/noktalama temizleniyor.
  6. Renk/malzeme bilgisi 2. satırda olunca kayboluyordu (3 CSF satırı aynı
     başlığa düşmüştü). Sonraki satırlardaki AYIRT EDİCİ nitelik kelimeleri
     (renk/malzeme/fonksiyon) başlığa ekleniyor — not olanlar değil.
  7. Paketleme ölçüsü (41.5*21.5*5.5 650g) başlığa sızmıştı; `*`'lı ölçü
     grupları atılıyor. Ürün ölçüsü `x` ile yazıldığı için (75x45 cm) korunur.

Uydurma yok: hiçbir bilgi faturada yoksa başlığa girmez; veri yoksa None döner.
"""
import re, json

BRAND = "Alfas"
MAX = 120

# --- Türkçe duyarlı harf dönüşümü ------------------------------------------
# Python'un varsayılanı Türkçeyi bilmez: "İ".lower() → "i̇" (birleşik
# nokta), "I".lower() → "i" (oysa "ı" olmalı).
# DİKKAT: İ→i (noktalı), I→ı (noktasız). Ters yazılırsa "ANTRASİT"→"Antrasıt".
_KUCUK = str.maketrans("İIÇĞÖŞÜ", "iıçğöşü")
_BUYUK = str.maketrans("iıçğöşü", "İIÇĞÖŞÜ")

def kucuk(s):
    return s.translate(_KUCUK).lower().replace("̇", "")

def buyuk(s):
    return s.translate(_BUYUK).upper()

# Faturada İngilizce ya da çok kısa yazılmış olanların karşılıkları. Elle, tek tek
# yazıldı — makine çevirisi değil; hiçbiri fatura dışından bilgi içermez.
CEVIRI = {
    '426M-426282927334': 'Alfas Siyah 3 Fonksiyonlu Mutfak Eviye Bataryası Zamak Gövde',
    '426M-4267192047364': 'Alfas 3 Modlu Mutfak Eviye Bataryası',
    '426M-445501038461': 'Alfas Siyah Çekmeli Spiralli Mutfak Eviye Bataryası',
    '426M-TE-7888G': 'Alfas Gold 304 Paslanmaz Çelik Mutfak Eviyesi',
    '470764214647': 'Alfas Klozet ve Banyo Taharet Musluğu Spiralli Bide Bataryası',
    '474758852': 'Alfas A3 Yağmurlama Duş Başlığı ve Batarya Seti',
    '4902837173724': 'Alfas Dijital Akıllı Eviye Seti 75x45 cm 304 Paslanmaz Çelik',
    'MB- 433504971595': 'Alfas Gold Banyo Lavabo Bataryası TE-3350',
    'MB- 433504972606': 'Alfas Beyaz Banyo Lavabo Bataryası',
    'MB- TE-964CANAK': 'Alfas Çanak Lavabo Bataryası',
    'MB- Xr0150b': 'Alfas Siyah Lavabo Bataryası Sıcak Soğuk',
    'MB- xr0150w': 'Alfas Beyaz Lavabo Bataryası Sıcak Soğuk',
    'MB-40980962195': 'Alfas Antik Küvet Bataryası',
    'MB-423897451542': 'Alfas Gold Kuğu Lavabo Bataryası Sıcak Soğuk',
    'MB-43219371038': 'Alfas Krom Lavabo Bataryası Banyo Musluğu',
    'MB-43267804521': 'Alfas Gold Lavabo Bataryası Banyo Musluğu',
    'MB-4327048156': 'Alfas Mat Siyah Lavabo Bataryası Banyo Musluğu',
    'MB-432730003273': 'Alfas Pirinç Gövde Lavabo Bataryası',
    'MB-4356086413709': 'Alfas Mat Gold Uzun Gövdeli Çanak Lavabo Bataryası',
    'MB-454331111120': 'Alfas Banyo Lavabo Bataryası',
    'MB-4875808541255': 'Alfas Gold Banyo Lavabo Bataryası',
    'Mb- 433504970484': 'Alfas Mat Siyah Banyo Lavabo Bataryası Sıcak Soğuk',
    'Mb- 4708965235807': 'Alfas Siyah Çanak Lavabo Bataryası',
    'Nut': "Alfas Batarya Bağlantı Somunu 4'lü Set",
    'YPFİTTİNGS': "Alfas Batarya Bağlantı Somunu 2'li Set",
    'YPZinc': 'Alfas Zamak Enjeksiyon Döküm Batarya Gövdesi Krom Kaplı',
    'YpSS1': 'Alfas Batarya Gövdesi Aksamı Siyah',
    'Ypfittings4': 'Alfas Musluk Alt Sabitleme Rakor Seti',
}

# --- Not izleri -------------------------------------------------------------
NOT_IZI = re.compile(
    r"(1688|wechat|video|ödendi|odendi|cj\b|cjdropshipping|koli|indir|stok kodu|"
    r"sipariş ver|siparis ver|iptal ettik|toplam\s*\d|mevlana|sinan|canakcı|canakci|"
    r"trden|kutuya koy|en son parlaktı|mat olmalı|girmeli|yerine|"
    r"ana foto|fotoya|görsellerini|gorsellerini|eklerken|ekleyelim|"
    r"hortum \+ valf|numune|örnek gelecek)", re.I)

# Sondan kırpılabilecek anlamsız kuyruk kelimeleri (yalnız not kelimesiyle
# birlikte anlam kazanırlar: "videosu var" → ikisi de gider).
FILLER = {"var", "yok", "vardır", "vardir", "olacak", "gelecek", "set", "adet"}

GTIP = re.compile(r"\b\d{4}\.\d{2}\.\d{2}\.\d{2}\.\d{2}\b")
URL = re.compile(r"https?://\S+")
CINCE = re.compile(r"[一-鿿　-〿＀-￯]+")
YUZDE_TABLO = re.compile(r"\d+[,.]\d+%|\bABD Doları/kg\b|CIF\b|emy\b", re.I)
# Paketleme ölçüsü: 41.5*21.5*5.5 veya 70*44.5*73, peşinden ağırlık gelebilir.
PAKET_OLCU = re.compile(r"\b\d+(?:[.,]\d+)?\s*\*\s*\d+(?:[.,]\d+)?\s*\*\s*\d+(?:[.,]\d+)?"
                        r"(?:\s*\d+(?:[.,]\d+)?\s*(?:g|gr|kg)\b)?", re.I)

# Başlığı ayırt eden nitelikler — sonraki satırlardan YALNIZ bunlar alınır.
NITELIK = re.compile(
    r"\b(antrasit|krom|siyah|beyaz|gold|gri|bronz|antik|inox|paslanmaz|pirinç|pirinc|"
    r"zamak|mat|parlak|nikel|bakır|bakir|rose|altın|altin|"
    r"\d+\s*fonksiyonlu|sus304|304)\b", re.I)

# Kısaltma olarak KALMASI gereken büyük yazımlar.
KISALTMA = {"PVD", "LED", "SUS304", "3D", "ABS", "USB", "IP", "CE", "WC", "UV"}

# Türkçe I→ı kuralının UYGULANMAYACAĞI yabancı kelimeler. Faturadaki tüm büyük
# harfli "I"lı kelimeler (BATARYASI, YIKAYICILI, TASARIM, SIVA, ALTI…) gerçekten
# Türkçe; tek istisna marka adı. "FLEXTAIL" → "Flextaıl" olmasın diye.
YABANCI = {"FLEXTAIL", "RAIN", "ROUND", "PULL", "OUT"}


def _harfsiz_kuyrugu_at(s):
    """Sondaki harf içermeyen kelimeleri atar ('… Antrasit 39 /' → '… Antrasit').

    Ölçüler harf taşıdığı için korunur: '43x21cm', '75x45 cm', '360°' → 'cm'/'°'
    kelimeleri ayrı durmadığı sürece dokunulmaz.
    """
    kelimeler = s.split()
    while kelimeler and not any(c.isalpha() for c in kelimeler[-1]):
        kelimeler.pop()
    return " ".join(kelimeler)


def _tekrari_at(s):
    """Bitişik yinelenen kelimeyi teke indirir ('ANTRASİT ANTRASİT')."""
    cikti = []
    for w in s.split():
        if cikti and kucuk(cikti[-1].strip(".,;")) == kucuk(w.strip(".,;")):
            continue
        cikti.append(w)
    return " ".join(cikti)


def _not_kuyrugunu_kirp(s):
    """Sondan başlayarak not/dolgu kelimelerini atar. Gövdeye dokunmaz."""
    kelimeler = s.split()
    while kelimeler:
        son = kelimeler[-1].strip(".,;:-–—()")
        if NOT_IZI.search(son) or kucuk(son) in FILLER:
            kelimeler.pop()
            continue
        break
    return " ".join(kelimeler)


def _satir_temizle(s):
    s = URL.sub(" ", s)
    s = CINCE.sub(" ", s)
    s = GTIP.sub(" ", s)
    s = YUZDE_TABLO.sub(" ", s)
    s = PAKET_OLCU.sub(" ", s)
    # not içeren parantezleri at
    s = re.sub(r"\(([^)]*)\)", lambda m: " " if NOT_IZI.search(m.group(1)) else m.group(0), s)
    # `//` ayracı — boşuklu ya da boşluksuz; sonrası not ise at
    parca = re.split(r"/{2,}", s)
    if len(parca) > 1 and NOT_IZI.search(" ".join(parca[1:])):
        s = parca[0]
    # çift boşluk ayracı
    if "  " in s:
        bas, _, son = s.partition("  ")
        if NOT_IZI.search(son):
            s = bas
    # Çince atıldıktan sonra "39套/箱" → "39 /" gibi harfsiz artıklar kalıyor.
    s = _harfsiz_kuyrugu_at(s)
    s = _not_kuyrugunu_kirp(s)
    # hâlâ not varsa cümle parçası bazında ele (gövde çoğunlukla ilk parçadır)
    if NOT_IZI.search(s):
        parcalar = re.split(r"[.,;]| - ", s)
        tutulan = [p for p in parcalar if p.strip() and not NOT_IZI.search(p)]
        s = " ".join(tutulan) if tutulan else ""
    return re.sub(r"\s+", " ", s).strip(" -–—,;.")


def _sarkan_sayiyla_bitiyor(satir):
    """'… EVİYE BATARYASI 4' — satır sonu kelime ortasında kalmış demektir."""
    son = satir.strip().split()
    return bool(son) and re.fullmatch(r"\d{1,2}", son[-1]) is not None


def temizle(s):
    """İlk satır gövdedir; sonraki satırlardan yalnız ayırt edici nitelik alınır."""
    if not s:
        return None
    satirlar = [x for x in s.split("\n") if x.strip()]
    if not satirlar:
        return None

    # SATIR SARMASI: faturada "… BATARYASI 4" / "FONKSİYONLU 304 … ANTRASİT"
    # şeklinde bölünmüş tek cümleler var. 2. satırı not sayıp atarsak hem
    # "4" sarkar hem de renk kaybolur — üç CSF satırı aynı başlığa iniyordu.
    # Yalnız sarkan sayı durumunda birleştiriyoruz; diğer 7 çok satırlı kayıtta
    # 2. satır gerçekten not (ağırlık, koli, video, Çince paket bilgisi).
    if (
        len(satirlar) > 1
        and _sarkan_sayiyla_bitiyor(satirlar[0])
        and not URL.search(satirlar[1])
        and not CINCE.search(satirlar[1])
        and not NOT_IZI.search(satirlar[1])
    ):
        satirlar = [satirlar[0].strip() + " " + satirlar[1].strip()] + satirlar[2:]

    govde = _satir_temizle(satirlar[0])
    if not govde:
        return None

    # Sonraki satırlar: renk/malzeme gibi ayırt edici bilgi varsa ekle.
    # (CSF satırlarında ANTRASİT/KROM/SİYAH 2. satırdaydı ve üçü de aynı
    # başlığa düşmüştü — pazaryerinde aynı başlıklı üç ilan demek.)
    for ek in satirlar[1:]:
        if URL.search(ek) or NOT_IZI.search(ek):
            continue
        temiz = _satir_temizle(ek)
        if not temiz or len(temiz) > 60:
            continue
        for m in NITELIK.finditer(temiz):
            kelime = m.group(0)
            if kucuk(kelime) not in kucuk(govde):
                govde += " " + kelime
    return govde or None


def buyuk_harf_duzelt(s):
    """Kelime bazında: tamamı büyük yazılmış kelimeleri başlık biçimine çevirir."""
    def kelime(w):
        cekirdek = w.strip(".,;:()")
        if len(cekirdek) <= 1:
            return w
        if not any(c.isalpha() for c in cekirdek):
            return w
        if buyuk(cekirdek) in KISALTMA:
            return w
        if buyuk(cekirdek) == "ALFAS":
            return w.replace(cekirdek, BRAND)
        # tamamı büyük değilse dokunma (kullanıcının yazımı korunur)
        harfli = [c for c in cekirdek if c.isalpha()]
        if not all(buyuk(c) == c for c in harfli):
            return w
        if buyuk(cekirdek) in YABANCI:
            yeni = cekirdek[0].upper() + cekirdek[1:].lower()
        else:
            yeni = buyuk(cekirdek[0]) + kucuk(cekirdek[1:])
        return w.replace(cekirdek, yeni)
    return " ".join(kelime(w) for w in s.split())


def markala(s):
    if not s:
        return None
    if re.match(r"^\s*alfas\b", s, re.I):
        return re.sub(r"^\s*alfas\b", BRAND, s, flags=re.I)
    return f"{BRAND} {s}"


# Varyantı ayırt eden renk/kaplama — başlığın SONUNDA olur ve kırpmada ilk
# düşen odur. Düşerse iki varyant aynı başlığa iner (pazaryerinde mükerrer ilan).
RENK_SON = re.compile(
    r"[\s,;-]+((?:mat\s+|parlak\s+)?(?:antrasit|krom|siyah|beyaz|gold|gri|bronz|"
    r"antik|inox|nikel|bakır|bakir|rose|altın|altin))\s*$", re.I)


def _kirp(t):
    """MAX'ı aşan başlığı kelime ortasından değil, anlam sınırından keser.

    Sondaki renk korunur: varyantı ayırt eden tek şey o.
    """
    if len(t) <= MAX:
        return t

    # Renk varsa kenara ayır, gövdeyi ona yer bırakacak şekilde kırp, geri ekle.
    m = RENK_SON.search(t)
    if m:
        renk = m.group(1)
        govde = t[: m.start()]
        return (_kirp_govde(govde, MAX - len(renk) - 1) + " " + renk).strip()
    return _kirp_govde(t, MAX)


def _kirp_govde(t, sinir):
    if len(t) <= sinir:
        return t.strip(" -–—,;.")
    # 1) Son virgülden kes — açıklayıcı yan cümle komple gider.
    kesim = t[:sinir]
    virgul = kesim.rfind(",")
    if virgul >= 40:
        return t[:virgul].strip(" -–—,;")
    # 2) Kelime sınırından kes, sonra sarkan bağlaç/noktalamayı at.
    aday = kesim.rsplit(" ", 1)[0]
    while True:
        aday = aday.strip(" -–—,;.")
        son = aday.rsplit(" ", 1)[-1] if " " in aday else aday
        if kucuk(son) in {"ve", "ile", "için", "icin", "ya", "veya", "da", "de"}:
            aday = aday[: -len(son)].strip()
            continue
        break
    return aday


def baslik(sku, invoice):
    if sku in CEVIRI:
        return CEVIRI[sku], "ceviri"
    t = temizle(invoice)
    if not t or len(t) < 8:
        return None, "yetersiz"
    t = buyuk_harf_duzelt(t)
    t = markala(t)
    t = _tekrari_at(re.sub(r"\s+", " ", t).strip())
    t = _kirp(t)
    return (t, "temiz") if len(t) >= 20 else (t, "kisa")
