# Skill: musteri-analizi

## Amaç
Bir müşterinin geçmiş aktivitelerini, teklif geçmişini, açık görevlerini
ve iletişim sıklığını analiz ederek yapılandırılmış bir özet çıkarır.
Karar vermez — veri sunar, öneri yapar.

## Tetikleyiciler
- `/musteri [isim veya firma adı]`
- "Bu müşteriyi analiz et", "müşteri özeti", "müşteri durumu nedir"

## Ön Kontrol
```
CLAUDE.md profil dolu mu?
  HAYIR → "Önce /cold-start çalıştırın."
  EVET  → Devam et.
```

## Workflow

### Adım 1: Müşteri Tespiti
- Verilen isim veya firma adını müşteri listesinde ara.
- Birden fazla eşleşme varsa listele, kullanıcıdan seçim iste.
- Bulunamazsa: "Müşteri bulunamadı. İsim tam mı?"

### Adım 2: Veri Toplama
Şu verileri çek:
- Müşteri temel bilgileri (isim, firma, telefon, durum, kaynak, sahip)
- Son 90 günlük timeline notları (not sayısı, türlere göre dağılım)
- Teklif geçmişi (toplam, açık, kazanılan, kaybedilen, toplam değer)
- Açık görevler (sayı, vadesi geçmiş olanlar, acil olanlar)
- Son iletişim tarihi ve türü

### Adım 3: Sıcaklık Skoru Hesapla
```
Son iletişim tarihi → bugünden kaç gün önce?

  0-13 gün   → 🟢 SICAK    (aktif ilişki)
  14-29 gün  → 🟡 ILIM     (dikkat gerekli)
  30+ gün    → 🔴 SOĞUK    (aksiyon gerekli)
  Hiç yok    → ⚪ YENİ     (henüz iletişim kurulmamış)
```

### Adım 4: Önerilen Sonraki Adım Belirle
```
Statü = NEW ve iletişim yok          → "İlk temas görevi oluştur"
Statü = PROPOSAL ve 7+ gün sessiz   → "Teklif takip görevi oluştur"
Statü = NEGOTIATION                  → "Müzakere notunu güncelle"
Vadesi geçmiş görev var              → "Önce açık görevleri kapat"
Teklif kazanıldı, yeni teklif yok   → "Çapraz satış fırsatı değerlendir"
Teklif kaybedildi                    → "Kaybetme nedenini kaydet"
```

## Çıktı Formatı

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MÜŞTERİ ANALİZİ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ad / Firma   : [İsim] / [Firma]
Durum        : [NEW/CONTACTED/PROPOSAL/...]
Kaynak       : [kaynak]
Sahip        : [kullanıcı adı]
Sıcaklık     : [🔴 SOĞUK / 🟡 ILIM / 🟢 SICAK / ⚪ YENİ]
Son iletişim : [tarih] ([N gün önce] — [not türü])

── TEKLİFLER ──────────────────────────
Toplam       : [N]
Açık         : [N]   Değer: ₺[tutar]
Kazanılan    : [N]   Değer: ₺[tutar]
Kaybedilen   : [N]

── GÖREVLER ───────────────────────────
Açık         : [N]
Vadesi geçmiş: [N]   ← [varsa görev adları]
Acil (HIGH+) : [N]

── AKTİVİTE (son 90 gün) ──────────────
Not          : [N]
Arama        : [N]
Toplantı     : [N]
E-posta      : [N]
WhatsApp     : [N]

── ÖNERİLEN ADIM ──────────────────────
▶ [otomatik öneri]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Kural
- Çıktı veridir, karar değildir. Kullanıcı son kararı verir.
- Sıcaklık skoru tek başına bir müşterinin değerini yansıtmaz;
  büyük müşteriler için uzun sessizlik normal olabilir.
- Hiçbir kaydı otomatik güncellemez.
