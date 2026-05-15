# Skill: teklif-olustur

## Amaç
Müşteri ve ürün/hizmet bilgisinden yola çıkarak teklif taslağı
hazırlar. `CLAUDE.md` profilindeki varsayılan koşulları kullanır,
gerekirse kullanıcıya sorar. Taslak oluşturur — kaydetmez.

## Tetikleyiciler
- `/teklif-olustur [müşteri adı] [ürün/hizmet]`
- "Teklif hazırla", "teklif taslağı yap", "bu müşteriye teklif"

## Ön Kontrol
```
CLAUDE.md profil dolu mu?
  HAYIR → "Önce /cold-start çalıştırın."
  EVET  → Devam et.

Teklif şablonu varsayılanları dolu mu?
  HAYIR → Bu skill o değerleri sorar (ödeme, teslimat, garanti).
  EVET  → Profildeki değerleri kullan, kullanıcıya göster.
```

## Workflow

### Adım 1: Müşteri Doğrula
- Müşteri adı/ID ile müşteriyi bul.
- Bulunamazsa: "Müşteri bulunamadı. Önce müşteri kaydı oluşturun."
- Bulununca: müşteri adı, firma, para birimi tercihini göster.

### Adım 2: Ürün/Hizmet Listesi
- Verilen ürün/hizmet adını ürün kataloğunda ara.
- Birden fazla eşleşme → listele, seçim iste.
- Bulunamazsa: birim fiyat ve miktar manuel gir.
- Birden fazla kalem eklenebilir (kullanıcı "ekle" dedikçe).

### Adım 3: Teklif Değerlerini Hesapla
```
Her kalem için:
  ara toplam = birim fiyat × miktar

İskonto var mı?
  EVET → ara toplam × (1 - iskonto%)
  HAYIR → iskonto = 0

KDV = (ara toplam - iskonto) × KDV oranı
Genel toplam = ara toplam - iskonto + KDV
```

### Adım 4: Koşulları Doldur
Önce `CLAUDE.md`'den çek:
- Ödeme koşulları
- Teslimat süresi
- Garanti süresi
- Geçerlilik süresi (bugün + N gün)

Kullanıcıya göster ve onay iste.
Bu teklif için değiştirmek isterse güncelle.

### Adım 5: Eskalasyon Kontrolü
```
Genel toplam > CLAUDE.md eskalasyon eşiği mi?
  EVET → "⚠️ Bu teklif manuel onay gerektiriyor.
          Onaylayan: [profildeki isim]
          Kaydetmeden önce onay alın."
  HAYIR → Normal akış.
```

## Çıktı Formatı

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEKLİF TASLAĞI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Müşteri      : [İsim] / [Firma]
Tarih        : [bugün]
Geçerlilik   : [bugün + N gün]
Para Birimi  : [TRY/USD/EUR]

── KALEMLER ───────────────────────────
#  Ürün/Hizmet         Miktar  Birim Fiyat   Toplam
1  [ürün adı]          [N]     ₺[fiyat]      ₺[ara]
2  [ürün adı]          [N]     ₺[fiyat]      ₺[ara]

── ÖZET ───────────────────────────────
Ara Toplam   : ₺[tutar]
İskonto      : ₺[tutar] (%[oran])
KDV (%[oran]): ₺[tutar]
GENEL TOPLAM : ₺[tutar]

── TİCARİ KOŞULLAR ────────────────────
Ödeme        : [koşul]
Teslimat     : [süre]
Garanti      : [süre]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bu değerlerle /quotes/new sayfasını açayım mı?
```

## Kural
- Kaydetmez — taslak gösterir, kullanıcı onaylar.
- Eskalasyon eşiği aşıldığında uyarı zorunludur, atlanamaz.
- Sıfır veya negatif değer girişine izin vermez.
- Para birimi müşteri kaydındaki tercihle çelişirse kullanıcıya sor.
