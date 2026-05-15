# Skill: rapor-olustur

## Amaç
Haftalık veya aylık yönetici özeti oluşturur. Pipeline durumu,
teklif hareketleri, görev kapanmaları ve ekip aktivitesi tek raporda.

## Tetikleyiciler
- `/rapor [haftalık|aylık]`
- "Haftalık rapor", "aylık özet", "bu ay nasıl gitti"

## Ön Kontrol
```
CLAUDE.md profil dolu mu?
  HAYIR → "Önce /cold-start çalıştırın."
  EVET  → Devam et.

Dönem belirtildi mi?
  HAYIR → varsayılan: haftalık (son 7 gün)
```

## Workflow

### Adım 1: Zaman Dilimini Belirle
```
haftalık  → son 7 gün (bugün dahil)
aylık     → bu takvim ayının başından bugüne
```

### Adım 2: Veri Topla
```
MÜŞTERİLER
- Dönem içinde eklenen yeni müşteri sayısı
- Statü değişen müşteri sayısı (hangi statüye)

TEKLİFLER
- Dönem içinde oluşturulan teklif sayısı ve toplam değeri
- Dönem içinde WON olan teklif sayısı ve toplam değeri
- Dönem içinde LOST olan teklif sayısı ve toplam değeri
- Hâlâ açık olan teklif sayısı ve toplam değeri

GÖREVLER
- Dönem içinde tamamlanan görev sayısı
- Dönem sonu itibarıyla açık görev sayısı
- Dönem sonu itibarıyla vadesi geçmiş görev sayısı

AKTİVİTE
- Dönem içinde kaydedilen toplam not sayısı
- Türe göre dağılım (arama, toplantı, e-posta, WhatsApp)
- En aktif ekip üyesi (en fazla not kaydeden)
```

### Adım 3: Önceki Dönemle Karşılaştır
Her metrik için:
```
Bu dönem: [N]
Önceki dönem: [N]
Fark: +[N] / -[N] (%[değişim])
```

### Adım 4: Dikkat Çeken Noktaları Belirle
```
Pozitif: Kazanılan en büyük teklif, en aktif ekip üyesi
Negatif: En büyük kaybedilen teklif, en çok geciken görev sahibi
```

## Çıktı Formatı

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[HAFTALIK / AYLIK] RAPOR
[dönem başı] — [dönem sonu]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── MÜŞTERİLER ─────────────────────────
Yeni müşteri       : [N]  ([±N] önceki döneme göre)
Statü değişen      : [N]

── TEKLİFLER ──────────────────────────
Yeni teklif        : [N]  toplam ₺[tutar]
Kazanılan          : [N]  toplam ₺[tutar]  🟢
Kaybedilen         : [N]  toplam ₺[tutar]  🔴
Açık (pipeline)    : [N]  toplam ₺[tutar]

Kazanma oranı      : %[oran]  ([±%] önceki döneme göre)

── GÖREVLER ───────────────────────────
Tamamlanan         : [N]
Dönem sonu açık    : [N]
Dönem sonu geciken : [N]

── AKTİVİTE ───────────────────────────
Toplam not         : [N]
  Arama    : [N]   Toplantı  : [N]
  E-posta  : [N]   WhatsApp  : [N]
En aktif   : [kullanıcı adı] ([N] not)

── ÖNE ÇIKANLAR ───────────────────────
🏆 En büyük kazanım : [müşteri] — ₺[tutar]
⚠️  Dikkat          : [en önemli olumsuz nokta]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Kural
- Raporlama dönemi dışındaki verileri dahil etmez.
- Sıfır değerleri gizlemez — "0" olarak gösterir.
- Önceki dönem verisi yoksa karşılaştırma satırını atlar.
- Raporu otomatik kaydetmez; kullanıcı isterse kopyalayabilir.
