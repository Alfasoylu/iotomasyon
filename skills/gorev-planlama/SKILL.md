# Skill: gorev-planlama

## Amaç
Görevleri filtreler, önceliklendirir ve iş yükü özetini çıkarır.
Yeni görev oluşturma önerisi yapar ama kaydetmez.

## Tetikleyiciler
- `/gorevler [bugün|bu-hafta|geciken|tümü]`
- `/gorev-olustur [müşteri] [açıklama]`
- "Görev listesi", "bugün ne yapmalıyım", "geciken görevler"

## Ön Kontrol
```
CLAUDE.md profil dolu mu?
  HAYIR → "Önce /cold-start çalıştırın."
  EVET  → Devam et.
```

## Workflow — Listeleme

### Adım 1: Filtre Belirle
```
"bugün"     → dueDate = bugün
"bu-hafta"  → dueDate = bu hafta içinde
"geciken"   → dueDate < bugün AND status = OPEN
"tümü"      → tüm açık görevler
filtre yok  → varsayılan: "bu-hafta"
```

### Adım 2: Sırala
```
1. Önce VADESİ GEÇMİŞ (kırmızı)
2. Önce URGENT, sonra HIGH, MEDIUM, LOW
3. Aynı öncelikteyse dueDate'e göre artan
```

### Adım 3: İş Yükü Özeti
Kullanıcı bazında görev sayısını göster (ekip görünümü).

## Workflow — Görev Oluşturma Önerisi

### Adım 1: Bağlam Anla
- Müşteri veya teklif bağlamında mı? Bağlı görev oluştur.
- Bağımsız mı? Genel görev.

### Adım 2: Öneri Oluştur
```
Başlık      : [açıklama]
Müşteri     : [ilişkilendirme]
Öncelik     : [CLAUDE.md varsayılanı veya içerikten çıkar]
Vade        : [kullanıcı belirtmemişse CLAUDE.md SLA'sına göre öner]
Sorumlu     : [müşteri sahibi veya kullanıcı]
```

Kullanıcıya göster → onay al → /tasks sayfasına yönlendir.

## Çıktı Formatı — Liste

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GÖREV LİSTESİ — [filtre]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 VADESİ GEÇMİŞ ([N] görev)
  • [Görev başlığı] — [Müşteri] — [N gün gecikmiş]
  • [Görev başlığı] — [N gün gecikmiş]

🟠 BUGÜN ([N] görev)
  • [Görev başlığı] — [Müşteri] — URGENT
  • [Görev başlığı] — HIGH

🟡 BU HAFTA ([N] görev)
  • [Görev başlığı] — [Müşteri] — [tarih]

── İŞ YÜKÜ ────────────────────────────
[Kullanıcı adı] : [N] açık görev ([N] gecikmiş)
[Kullanıcı adı] : [N] açık görev

TOPLAM: [N] açık / [N] gecikmiş
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Kural
- Görev kaydetmez — kullanıcı onayıyla /tasks sayfasına yönlendirir.
- Gecikmiş görevleri asla gizlemez veya küçümsemez.
- Vade önerisi CLAUDE.md'deki SLA değerini kullanır; profil eksikse sorar.
