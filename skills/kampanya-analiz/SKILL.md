# Skill: kampanya-analiz

## Amaç
Kampanya performansını ölçer: hedef vs gerçekleşen müşteri sayısı,
dönüşüm oranları, kaynak bazlı karşılaştırma. Karar vermez, veri sunar.

## Tetikleyiciler
- `/kampanya-analiz [kampanya adı veya "tümü"]`
- "Kampanya performansı", "kampanya nasıl gidiyor", "en iyi kampanya"

## Ön Kontrol
```
CLAUDE.md profil dolu mu?
  HAYIR → "Önce /cold-start çalıştırın."
  EVET  → Devam et.

Kampanya adı verildi mi?
  EVET → O kampanyayı analiz et.
  HAYIR → Aktif kampanyaları listele, seçim iste.
         "tümü" → Tüm kampanyaları karşılaştır.
```

## Workflow

### Adım 1: Kampanya Verisi Çek
- Kampanya adı, başlangıç/bitiş tarihi, hedef
- Bağlı müşteri sayısı (kampanyadan gelen)
- Bu müşterilerin teklif ve kazanım sayısı

### Adım 2: Metrikleri Hesapla
```
Dönüşüm oranı  = (teklif açılan müşteri / toplam müşteri) × 100
Kazanım oranı  = (kazanılan teklif / açılan teklif) × 100
Ortalama teklif değeri = toplam kazanılan değer / kazanılan teklif sayısı
```

### Adım 3: Kaynak Karşılaştırması (tümü modunda)
Tüm kampanyaları şu metriklere göre sırala:
- Dönüşüm oranı (yüksekten düşüğe)
- Kazanım oranı
- Ortalama teklif değeri

### Adım 4: Trend Analizi
```
Kampanya hâlâ aktifse:
  Bu ay önceki aya göre nasıl? (artış/düşüş %)
Kampanya kapandıysa:
  Hedefe ulaşıldı mı? (hedef vs gerçekleşen)
```

## Çıktı Formatı — Tek Kampanya

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KAMPANYA ANALİZİ: [Kampanya Adı]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Durum        : [Aktif / Tamamlandı]
Dönem        : [başlangıç] → [bitiş]

── RAKAMLAR ───────────────────────────
Toplam müşteri     : [N]
Teklif açılan      : [N]  (%[dönüşüm oranı])
Kazanılan teklif   : [N]  (%[kazanım oranı])
Toplam kazanım     : ₺[tutar]
Ortalama teklif    : ₺[tutar]

── DEĞERLENDİRME ──────────────────────
[Otomatik yorum: hedef aşıldı / altında kaldı / trend yükseliyor vb.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Çıktı Formatı — Tüm Kampanyalar

```
KAMPANYA KARŞILAŞTIRMASI
─────────────────────────────────────────────────────
#  Kampanya          Müşteri  Dönüşüm  Kazanım  Değer
1  [en iyi]          [N]      %[oran]  %[oran]  ₺[tutar]
2  ...
─────────────────────────────────────────────────────
En yüksek dönüşüm : [kampanya adı]
En yüksek değer   : [kampanya adı]
```

## Kural
- Oranlar hesaplanamıyorsa (sıfıra bölme vb.) "—" göster, hata verme.
- Aktif kampanya analizi için minimum 7 gün veri gerekir;
  daha az varsa uyar: "Yeterli veri yok, analiz tahmini."
- Hiçbir kampanyayı otomatik kapatmaz veya değiştirmez.
