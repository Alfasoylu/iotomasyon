# Agent: inactive-musteri

## Amaç
30+ gün aktivite kaydı olmayan müşterileri tespit eder.
Sessizlik süresine göre üç katmanlı uyarı üretir.
Hiçbir kaydı otomatik değiştirmez.

## Zamanlama
Her Cuma 17:00 (haftalık).

## Bağımlılıklar
- `CLAUDE.md` profil dolu olmalı.

## Workflow

### Adım 1: Aktif Müşteri Tabanını Belirle
Filtre: `status NOT IN (LOST, PASSIVE)` — zaten kapalı olanları atlat.

### Adım 2: Son Aktivite Tarihini Hesapla
Her müşteri için:
```
Son aktivite = MAX(
  son timeline not tarihi,
  son teklif güncelleme tarihi,
  son görev kapanış tarihi
)

Sessizlik = bugün - son aktivite tarihi (gün)
```

### Adım 3: Katmanlara Ayır
```
30-59 gün  → KAT 1: Re-engagement öner
60-89 gün  → KAT 2: Sahip kullanıcıya uyarı + arama görevi öner
90+ gün    → KAT 3: PASSIVE segmentine taşımayı öner (onay gerekli)
```

### Adım 4: Sahip Kullanıcıya Göre Grupla
KAT 2 ve KAT 3'teki müşterileri sorumlu kullanıcıya göre grupla.
Kullanıcı başına yük oranı göster.

## Çıktı Formatı

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HAREKETSIZ MÜŞTERİ RAPORU — [tarih]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟡 KAT 1 — Re-engagement (30-59 gün) — [N] müşteri
  • [Ad / Firma] — [N] gün — Sahip: [kullanıcı]
  Öneri: Kısa bir "nasılsınız" notu veya kampanya ekleyin.

🟠 KAT 2 — Acil İletişim (60-89 gün) — [N] müşteri
  • [Ad / Firma] — [N] gün — Sahip: [kullanıcı]
  Öneri: Bu hafta mutlaka arama yapın.

🔴 KAT 3 — PASSIVE Adayı (90+ gün) — [N] müşteri
  • [Ad / Firma] — [N] gün — Sahip: [kullanıcı]
  Öneri: PASSIVE statüsüne taşımayı değerlendirin (onay gerekli).

── KULLANICI BAZLI YÜK ─────────────────
[Kullanıcı] : [N] müşteri hareketsiz
[Kullanıcı] : [N] müşteri hareketsiz

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Kural — YAPMAZ
- Müşteri statüsünü otomatik değiştirmez.
- Müşteri kaydını silmez veya arşivlemez.
- KAT 3 önerisi için kullanıcı onayı zorunludur.
- Büyük müşteriler için uzun sessizlik normal olabilir;
  uyarı "dikkat" niteliğindedir, "hata" değildir.
