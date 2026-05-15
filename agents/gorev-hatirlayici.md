# Agent: gorev-hatirlayici

## Amaç
Vadesi gelen ve geçen görevleri günlük olarak raporlar.
Sorumlu kullanıcıya göre gruplar. Görevleri otomatik değiştirmez.

## Zamanlama
Her gün 08:30.

## Bağımlılıklar
- `CLAUDE.md` profil dolu olmalı (SLA değerleri için).

## Workflow

### Adım 1: Görevleri Çek
Filtre: `status = "OPEN"`
Çek: başlık, öncelik, dueDate, müşteri bağlantısı, sorumlu kullanıcı

### Adım 2: Gruplara Ayır
```
Grup A — VADESİ GEÇMİŞ
  dueDate < bugün AND status = OPEN

Grup B — BUGÜN
  dueDate = bugün

Grup C — YARIN
  dueDate = yarın

Grup D — BU HAFTA (yarından sonra, hafta sonu dahil değil)
  dueDate > yarın AND dueDate <= bu hafta Cuma

Grup E — URGENT (vadesi ne olursa)
  priority = URGENT AND status = OPEN
```

### Adım 3: Kullanıcıya Göre Grupla
Her grubu sorumlu kullanıcıya göre alt gruplara ayır.

### Adım 4: SLA Kontrolü
`CLAUDE.md`'deki `Kritik görev yanıt SLA (saat)` değerine bak.
URGENT görev oluşturulma saatinden N saat geçmişse özel uyarı ekle.

## Çıktı Formatı

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GÜNLÜK GÖREV RAPORU — [tarih gün adı]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 VADESİ GEÇMİŞ ([N] görev)
  [Kullanıcı A]:
    • [Başlık] — [Müşteri] — [N] gün gecikmiş  [URGENT]
  [Kullanıcı B]:
    • [Başlık] — [Müşteri] — [N] gün gecikmiş

🟡 BUGÜN ([N] görev)
  [Kullanıcı A]:
    • [Başlık] — [Müşteri]  [HIGH]

🔵 YARIN ([N] görev)
  [Kullanıcı A]:
    • [Başlık] — [Müşteri]

📅 BU HAFTA ([N] görev)
  [Kullanıcı A]: [N] görev

── SLA UYARISI ────────────────────────
⚠️ [URGENT görev başlığı] — [N] saattir yanıtsız (SLA: [N] saat)

── ÖZET ───────────────────────────────
Toplam açık    : [N]
Vadesi geçmiş  : [N]
Bugün bitiyor  : [N]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Kural — YAPMAZ
- Görevi tamamlandı olarak işaretlemez.
- Görevi başka birine atamaz.
- Vade tarihini değiştirmez.
- Açık görev yoksa rapor göndermez ("Bugün tüm görevler temiz ✓").
