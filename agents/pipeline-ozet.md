# Agent: pipeline-ozet

## Amaç
Haftalık pipeline durumu özetini çıkarır. Statü bazlı dağılım,
toplam değer, sıkışan fırsatlar ve haftanın kazanım/kayıpları.

## Zamanlama
Her Cuma 16:00.

## Bağımlılıklar
- `CLAUDE.md` profil dolu olmalı.

## Workflow

### Adım 1: Aktif Pipeline'ı Çek
Statü = NEW, CONTACTED, PROPOSAL, NEGOTIATION olan tüm teklifleri çek.

### Adım 2: Statü Bazlı Dağılım
Her statü için:
- Teklif sayısı
- Toplam değer
- Ortalama yaş (kaç gün önce oluşturuldu)

### Adım 3: Sıkışan Fırsatları Tespit Et
```
PROPOSAL statüsünde 14+ gün hareketsiz
NEGOTIATION statüsünde 21+ gün hareketsiz
→ "SIKIŞ̧AN" olarak işaretle
```

### Adım 4: Bu Haftanın Hareketleri
```
Bu hafta WON olan  → kazanımlar listesi
Bu hafta LOST olan → kayıplar listesi
Bu hafta PROPOSAL'a taşınan → yeni fırsatlar
```

### Adım 5: CLAUDE.md Hedefleriyle Karşılaştır
Aylık teklif hedefi varsa: bu ay oluşturulan vs hedef göster.

## Çıktı Formatı

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HAFTALIK PİPELİNE ÖZETİ — [tarih]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── STATÜ DAĞILIMI ──────────────────────
NEW          : [N] teklif — ₺[toplam]
CONTACTED    : [N] teklif — ₺[toplam]
PROPOSAL     : [N] teklif — ₺[toplam]  ← TOPLAM PİPELİNE
NEGOTIATION  : [N] teklif — ₺[toplam]
─────────────────────────────────────
TOPLAM AKTİF : [N] teklif — ₺[toplam]

── SIKIŞ̧AN FIRSATLAR ──────────────────
  • #[no] [Müşteri] — ₺[tutar] — [N] gün hareketsiz  [PROPOSAL]
  • #[no] [Müşteri] — ₺[tutar] — [N] gün hareketsiz  [NEGOTIATION]

── BU HAFTANIN HAREKETLERİ ────────────
🏆 Kazanılan: [N] teklif — ₺[toplam]
   • #[no] [Müşteri] — ₺[tutar]

❌ Kaybedilen: [N] teklif — ₺[toplam]
   • #[no] [Müşteri] — ₺[tutar]

📋 Yeni teklif: [N] teklif — ₺[toplam]

── HEDEF TAKİBİ (bu ay) ───────────────
Hedef        : [N] teklif
Gerçekleşen  : [N] teklif (%[oran])

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Kural — YAPMAZ
- Teklif statüsünü değiştirmez.
- Sıkışan fırsatları otomatik LOST'a almaz.
- Hedef tanımlı değilse hedef takibi bölümünü atlar.
