# Skill: musteri-segmente

## Amaç
Müşteri tabanını belirtilen kritere göre segmentler ve
her segment için önerilen aksiyon üretir. Toplu güncelleme yapmaz.

## Tetikleyiciler
- `/segment [kriter]`
- "Müşterileri segmentle", "hangi müşteriler hareketsiz",
  "en değerli müşteriler", "kaynak bazlı segmentasyon"

## Hazır Kriterler

```
son-iletişim-yok-30    → 30+ gün aktivite yok
son-iletişim-yok-60    → 60+ gün aktivite yok
son-iletişim-yok-90    → 90+ gün aktivite yok

teklif-kazanma-yüksek  → kazanma oranı > %50 ve en az 3 teklif
teklif-kazanma-düşük   → kazanma oranı < %20 ve en az 3 teklif

yüksek-değer           → toplam kazanılan teklif değeri en yüksek 20%
pipeline-yüksek        → açık teklif toplamı en yüksek 20%

kaynak:[kaynak-adı]    → belirli kaynaktan gelen müşteriler
statü:[statü-adı]      → belirli statüdeki müşteriler
şehir:[şehir-adı]      → belirli ildeki müşteriler
sahip:[kullanıcı]      → belirli kullanıcıya ait müşteriler
```

## Workflow

### Adım 1: Kriteri Ayrıştır
- Hazır kriterlerden biri mi? → Direkt uygula.
- Serbest metin mi? → Anlamlandırmaya çalış, anlaşılmazsa sor.

### Adım 2: Segment Oluştur
- Kritere uyan müşterileri filtrele.
- Sonuç 0 ise: "Bu kritere uyan müşteri yok."
- Sonuç > 100 ise: "Çok fazla sonuç var. Daha spesifik kriter ekler misiniz?"

### Adım 3: Aksiyon Öner
Her segment için standart aksiyon şablonu:

```
son-iletişim-yok-30  → "Re-engagement: Kısa bir "nasılsınız" notu atın"
son-iletişim-yok-60  → "Arama yapın veya özel kampanya ekleyin"
son-iletişim-yok-90  → "PASSIVE segmentine taşımayı değerlendirin"
teklif-kazanma-düşük → "Kaybetme nedenlerini analiz edin"
yüksek-değer         → "VIP kategorisi oluşturmayı değerlendirin"
```

## Çıktı Formatı

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT: [kriter açıklaması]
[N] müşteri bulundu
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. [Ad / Firma]         — [ek bilgi: son tarih / değer vb.]
  2. [Ad / Firma]         — [ek bilgi]
  3. [Ad / Firma]         — [ek bilgi]
  ... (en fazla 20 göster, "ve [N] müşteri daha" ile kapat)

── ÖNERİLEN AKSİYON ───────────────────
▶ [aksiyon metni]

Bu müşteriler için toplu görev oluşturmamı ister misiniz?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Kural
- Hiçbir müşteri kaydını otomatik güncellemez.
- "Toplu görev oluştur" onaylanırsa gorev-planlama skill'ine yönlendir.
- 20'den fazla müşteri varsa listeyi kesmeden önce uyar.
- Kriter anlaşılamıyorsa varsayım yapma — sor.
