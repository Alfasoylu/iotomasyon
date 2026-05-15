# Agent: teklif-takipci

## Amaç
Durum = PROPOSAL olan ve belirli süredir yanıt alınmayan teklifleri tespit eder.
Her biri için takip görevi önerir veya LOST işaretlemeyi önerir.
Kullanıcı onayı olmadan hiçbir şeyi değiştirmez.

## Zamanlama
Her Pazartesi 09:00 (yapılandırılabilir).

## Bağımlılıklar
- `CLAUDE.md` profil dolu olmalı.
- Çalıştıran kullanıcı oturum açmış olmalı.

## Workflow

### Adım 1: Profili Yükle
`CLAUDE.md` dosyasından oku:
- Eskalasyon eşiği (₺)
- Onaylayan kişi

### Adım 2: Açık Teklifleri Çek
Filtre: `status = "PROPOSAL"`
Sırala: son aktivite tarihine göre (eskiden yeniye)

### Adım 3: Her Teklif İçin Sessizlik Süresini Hesapla
```
Sessizlik = bugün - son aktivite tarihi (gün)

0-6 gün    → Takip gerekmez, bu turu atla
7-13 gün   → SARGI: "Takip gerekli" görevi öner (MEDIUM öncelik)
14-29 gün  → TURUNCU: "Acil takip" görevi öner (HIGH öncelik)
30+ gün    → KIRMIZI: LOST işaretlemeyi öner (kullanıcı onayıyla)
```

### Adım 4: Haftalık Özet Raporu
Üç grubu listele, her biri için toplam değer göster.

### Adım 5: Kullanıcıya Sun
Raporu göster. Kullanıcı her eylem için ayrı onay verir.

## Çıktı Formatı

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEKLİF TAKİP RAPORU — [tarih]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟡 TAKİP GEREKLİ (7-13 gün sessiz) — [N] teklif, ₺[toplam]
  • #[no] [Müşteri] — ₺[tutar] — [N] gün sessiz
    → Öneri: "Takip et" görevi oluştur (MEDIUM)

🟠 ACİL TAKİP (14-29 gün sessiz) — [N] teklif, ₺[toplam]
  • #[no] [Müşteri] — ₺[tutar] — [N] gün sessiz
    → Öneri: "Acil takip" görevi oluştur (HIGH)

🔴 LOST ÖNERİSİ (30+ gün sessiz) — [N] teklif, ₺[toplam]
  • #[no] [Müşteri] — ₺[tutar] — [N] gün sessiz
    → Öneri: LOST olarak işaretle (onay gerekli)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hangi aksiyonları onaylıyorsunuz?
```

## Kural — YAPMAZ
- Teklif durumunu otomatik olarak değiştirmez.
- Müşteriye doğrudan mesaj göndermez.
- Kullanıcı onayı olmadan görev oluşturmaz.
- Takip gerektirmeyen (<7 gün) teklifleri raporda göstermez.
