# Skill: teklif-revize

## Amaç
Mevcut bir teklifi düzenler: kalem ekleme/çıkarma, fiyat güncelleme,
koşul değiştirme. Her revizyonu önceki değerle karşılaştırarak gösterir.

## Tetikleyiciler
- `/teklif-revize [teklif ID veya numarası]`
- "Teklifi güncelle", "teklife kalem ekle", "fiyatı değiştir"

## Ön Kontrol
```
Teklif bulundu mu?
  HAYIR → "Teklif bulunamadı. ID veya numara doğru mu?"
  EVET  → Teklif durumuna bak:

Teklif durumu WON veya LOST mu?
  EVET → "Kapatılmış teklif düzenlenemez.
          Yeni teklif için /teklif-olustur kullanın."
  HAYIR → Devam et.
```

## Workflow

### Adım 1: Mevcut Teklifi Göster
Teklifi tam çıktı formatında göster (teklif-olustur çıktısıyla aynı format).
Kullanıcıya ne değiştirmek istediğini sor.

### Adım 2: Değişiklik Türünü Belirle
```
Seçenekler:
A. Kalem ekle
B. Kalem çıkar
C. Kalem miktarını değiştir
D. Kalem fiyatını değiştir
E. İskonto değiştir
F. Ticari koşulları değiştir (ödeme/teslimat/garanti)
G. Geçerlilik tarihini uzat
```

### Adım 3: Değişikliği Uygula ve Karşılaştır
Her değişiklik için ÖNCE → SONRA göster:

```
DEĞİŞİKLİK ÖNİZLEMESİ
─────────────────────────────────────
  Kalem        : [ürün adı]
  Miktar       : 2 → 5
  Birim fiyat  : ₺12.000 → ₺11.500  (fiyat güncellendi)
  Kalem toplamı: ₺24.000 → ₺57.500

  Genel toplam : ₺48.000 → ₺81.500  (+₺33.500)
─────────────────────────────────────
Onaylıyor musunuz?
```

### Adım 4: Eskalasyon Kontrolü
```
Yeni toplam > CLAUDE.md eskalasyon eşiği mi?
  EVET → uyarı ver (teklif-olustur ile aynı uyarı)
Eski toplam eşiğin altındaydı, yeni toplam üstünde mi?
  EVET → özellikle vurgula: "Bu güncellemeyle onay eşiği aşıldı."
```

## Çıktı
Onay gelince güncellemeyi `/quotes/[id]/edit` ile kaydet.

## Kural
- Her adımda onay al, toplu güncelleme yapma.
- Fiyat %20'den fazla düşürülüyorsa ek onay sor.
- Revizyon geçmişi notu otomatik ekle: "Revize edildi: [tarih] — [değişiklik özeti]"
