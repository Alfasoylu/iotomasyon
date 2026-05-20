# Sales Rep UX Audit — Top 5 Sayfa Analizi ve Aksiyon Planı

**Tarih:** 2026-05-20
**Kapsam:** Yeni satış temsilcisinin işe başladığında en sık kullanacağı 5 sayfa
**Odak:** Daha basit + fonksiyonel görünüm. Görsel kalabalığı azalt, asıl iş akışını öne çıkar.

---

## Yönetici Özeti

Sistem teknik olarak güçlü ama **satış temsilcisi gözüyle gürültülü**: her sayfada finans/operasyon metrikleri ön planda, asıl satış metrikleri (çağrı sayısı, hedef, kuyruk) gizli kalmış. 5 sayfada tespit edilen 47 kusur, 6 PR'a bölündü.

**Prensip:** _"Tek ekran, tek karar"_ — her sayfa açıldığında satış temsilcisinin bir sonraki adımı net olmalı.

---

## Sayfa 1 — `/dashboard` (Pano)

### Şu anki hâl

Dashboard finansal yöneticiye göre tasarlanmış:
- Manşet: "Sermaye Sağlık Skoru 74" (sermaye finansı metriği)
- Üst KPI'lar: Bağlı Sermaye $47K, Yıllık ROI %308, Trendyol Ciro ₺695K
- Alt KPI'lar: Toplam Ürün 1283, Kritik Stok 1012, İthalat Kararı 2

Sales temsilcisi bu sayfayı gördüğünde **kendi işini bulamaz**.

### Tespit edilen kusurlar

| Kod | Kusur | Etki |
|---|---|---|
| D-01 | "İyi günler, Admin" — kullanıcı adı yerine rol | Kişiselleştirme yok |
| D-02 | Sermaye Sağlık Skoru manşet | Sales rep'in işi değil |
| D-03 | USD bazlı finans göstergeleri | Yönetici metriği |
| D-04 | Kritik Stok / İthalat Kararı kartları | Operasyon metriği |
| D-05 | "Bugün Yapılacaklar" alt köşede gizli | Asıl önemli kart en görünmez yerde |
| D-06 | Günlük çağrı / teklif hedefi yok | Sales motivasyonu eksik |
| D-07 | Power Queue kısayolu yok | Doğrudan iş başlangıç yok |
| D-08 | "Bu hafta kazanılan" rakamı yok | Başarı görünmez |

### Çözüm — Sales Rep Dashboard (rol bazlı)

**Görünür alanlar (yukarıdan aşağı):**

1. **Manşet bant** — "Bugün 12/30 görüşme · ₺8,400 teklif · 2 kazanılan · 3 görev"
2. **"Şimdi bunu ara!" tek kart** — En yüksek puanlı müşteri (avatar + ad + telefon + 1 cümle bağlam) + büyük ARA butonu
3. **Cohort kartları** (3 adet): Sıralı Arama / Bugün Görev / Yeni Fırsatlar — `/customers`'tan kopya
4. **Bekleyen görevlerim** — 3-5 satır, en eski/yüksek öncelikli
5. **Bu hafta ilerleme** — basit progress bar (15 görüşme / 150 hedef)

**Gizlenecekler (SALES rolü için):**
- Sermaye Sağlık Skoru, Yıllık ROI, Bağlı Sermaye, Trendyol Ciro
- Kritik Stok, İthalat Kararı, Toplam Ürün
- "Akıllı Öneriler" (8 öneri — finans/stok kararı odaklı)

**Dosya değişiklikleri:**
- `app/(app)/dashboard/page.tsx` — `user.role === "SALES"` branch ekle, ayrı component render
- Yeni: `components/dashboard/sales-rep-dashboard.tsx`
- Mevcut KPI bar reuse: `components/customers/sales-rep-kpi-bar.tsx`

**Acceptance:** Yeni SALES rolündeki kullanıcı dashboard'a girdiğinde 5 saniye içinde "şu an kimi arayacağım" sorusuna cevap bulur.

**Tahmin:** 6-8 saat, 1 PR.

---

## Sayfa 2 — `/customers` (Müşteriler)

### Şu anki hâl

Çok özelliği olan ama yoğun bir sayfa: 4 segment rozeti + 5 cohort kartı + 8+ filtre dropdown + Kanban board + müşteri listesi. Dikey scroll'u uzun, kanban kolonları çoğu zaman boş.

### Tespit edilen kusurlar

| Kod | Kusur | Etki |
|---|---|---|
| C-01 | "Uyuyan Müşteriler 519" — devasa rakam | Bunaltıcı |
| C-02 | "Yeni Fırsatlar 670" — hangisinden başla? | Karar felci |
| C-03 | "Sıralı Arama" başlığı — ne yapar? | Belirsiz |
| C-04 | Kanban board cohort filtre yokken devasa, kolonların çoğu boş | Görsel gürültü |
| C-05 | Müşteri kart'ında "şirket = ad" duplicate | Tekrar |
| C-06 | Filtre satırı 8 dropdown — yeni başlayan kaybolur | Karmaşıklık |
| C-07 | "Tüm Çatılar" sayısı yarım render | Buggy görünüm |
| C-08 | "Bu sayfa nedir?" butonu var ama klavye/akış rehberi yok | Onboarding eksik |
| C-09 | "Şimdi bunu ara!" tek CTA yok — sales rep listede gezinmek zorunda | Yavaş başlangıç |
| C-10 | Info completeness rozeti "–" görünüyor, anlamı belirsiz | Anlamsız işaret |

### Çözüm — Basitleştirilmiş müşteri listesi

**Yeni hiyerarşi:**

1. **Kompakt KPI strip** (tek satır, ince): "12/30 görüşme · 3 teklif · 1 kazandı bu hafta"
2. **Hero kart "Sıralı Arama"** — büyük, full-width: "Şimdi {Müşteri Adı}'nı ara — son temas X gün önce" + ARA butonu
3. **3 cohort kartı küçültülmüş** (eskiden 5): Bugün Görev / Yeni Fırsat / Açık Teklif (Uyuyan + Sıralı Arama Hero'ya konsolide)
4. **Segment rozeti satırı korunur** (B2B / Montaj / Pazaryeri)
5. **Filtre 2 satır → 1 satır collapsed** — arama + segment + şehir görünür, geri kalanlar "Gelişmiş Filtre" detail'ı altında
6. **Kanban kaldır** veya cohort filtre seçildiğinde göster (boş kolonlar görünmez)
7. **Müşteri row sadeleştirme:**
   - Şirket = ad ise sadece ad göster
   - Info completeness rozeti %0-100 progress bar yerine 3 renk (kırmızı/sarı/yeşil nokta)
   - Tag'ler maksimum 3 tane göster, fazlası "+N" rozet

**Dosya değişiklikleri:**
- `app/(app)/customers/page.tsx` — kanban kaldır veya cohort'a bağla
- `components/customers/customer-cohort-cards.tsx` — 5'ten 3'e indir
- `components/customers/customer-filters.tsx` — collapse pattern
- `components/customers/customer-row.tsx` — duplicate ad fix
- Yeni: `components/customers/now-call-hero.tsx` — büyük tek kart

**Acceptance:** Yeni sales rep müşteri listesini açtığında "şimdi {ad}'i ara" tek bir buton görür, 1 tıkla aramaya başlar.

**Tahmin:** 5-7 saat, 1 PR.

---

## Sayfa 3 — `/customers/[id]` (Müşteri detayı)

### Şu anki hâl

Çağrı sırasında açılacak en kritik sayfa ama görsel kalabalık:
- Hero alanında 8 buton: ARA, WhatsApp, ARA (tekrar), WhatsApp (tekrar), Görev, Not, Düzenle, Sil
- Sağ panel "Hızlı İşlemler" yine WhatsApp aç + İletişim kuruldu + Düzenle (3. defa)
- Telefon ve e-posta 2 yerde gözüküyor (başlık + sağ panel)
- Stats kartında 6 sıfır (TOPLAM CİRO —, SİPARİŞ 0, FARKLI ÜRÜN 0, AKTİF İLGİ 0, AÇIK TEKLİF 0, MÜŞTERİLİK 0 ay)
- Sektör & Teknoloji panel sağda — çağrı sırasında sol blokta lazım

### Tespit edilen kusurlar

| Kod | Kusur | Etki |
|---|---|---|
| CD-01 | "ARA" butonu 2 kez | Görsel hata |
| CD-02 | "WhatsApp" butonu 2 kez | Görsel hata |
| CD-03 | "Sil" kırmızı buton Düzenle yanında | Yanlışlıkla silinme riski |
| CD-04 | Sağ panel + sol blok aksiyon duplicate | 3. duplicate aksiyon |
| CD-05 | Telefon + e-posta 2 yerde | Bilgi tekrarı |
| CD-06 | 6 sıfır yan yana stats | Motivasyon kırıcı |
| CD-07 | "Müşterilik 0 ay" — anlamsız | Mantıksız |
| CD-08 | Sektör/Teknoloji sağda gizli | Çağrı sırasında lazım |
| CD-09 | Çağrı script yok | Yeni rep "ne soracağım?" |
| CD-10 | Konuşma timer yok | Sürenin kontrolü yok |
| CD-11 | Outcome chips var ama sınıflar net değil ("Aramayın" mı "DND" mi?) | Belirsiz |
| CD-12 | Geçmiş notlar scroll edince kayboluyor (sticky değil) | Çağrı sırasında erişim zor |

### Çözüm — Çağrı odaklı sade ekran

**Sol blok (asıl çalışma alanı):**

```
┌─ Müşteri Hero ─────────────────────────────────┐
│ TM  Tarihi Meşhur Eyüp Sultan Güveççisi        │
│     PERAKENDE · Yeni · 0 SOĞUK                 │
│     ☎ +90 212 581 75 01    ✉ info@...com       │
│     📍 Eyüpsultan / İstanbul                    │
│     Sektör: Montaj Müşterisi → Restoran/Cafe   │
│     Kullandığı tech: [— hiçbir şey —]          │
│                                                 │
│  [📞 ARA]  [💬 WhatsApp]  [✅ Not]  [📋 Görev] │
│                                                 │
│  Çağrı sonu: ✓İlgilendi  ⏰Açmadı  ✗Yanlış No  │
│              💰Satış oldu  🚫Aramayın  ⏭Sonra  │
└─────────────────────────────────────────────────┘
```

**Sağ kolon (referans bilgiler, asla aksiyon değil):**

```
┌─ Geçmiş ────────────────────────────────────────┐
│ 👤 Müşteri eklendi · 20 May 13:54               │
│ ...timeline events                              │
│ (sticky, scroll'da kaybolmaz)                   │
└─────────────────────────────────────────────────┘

┌─ Çağrı İpuçları (sektöre göre) ─────────────────┐
│ Restoran/Cafe için sor:                         │
│ • Kaç giriş/çıkış var?                          │
│ • Mevcut kamera kullanıyor mu?                  │
│ • Gece çalışıyor mu? (gece görüş ihtiyacı)     │
│ • Bütçe taslağı?                                │
└─────────────────────────────────────────────────┘
```

**Kaldırılacaklar:**
- Sağ paneldeki "Hızlı İşlemler" Card (sol blokta var zaten)
- İletişim kartı (telefon/e-posta başlıkta zaten var)
- 0'lı stats kartı (sadece >0 olanları göster, hiç yoksa "Henüz veri yok" tek satır)
- "Sil" butonu hero'dan kaldır — sadece düzenleme sayfasında veya 3-nokta menü
- "Düzenle" sağda kalsın, sol blokta tek "Düzenle" linki yeterli

**Yeni eklemeler:**
- **Çağrı timer**: ARA tıklanınca başlar, üst panelde sayar (00:42, 02:15...). Bitir-kaydet seçeneği
- **Sektöre göre script**: industry slug'una göre 3-5 soru kartı (config'lenebilir)
- **Outcome chips netleştirme**: "İlgilendi → ne yapacak?" tooltip ekle, renk kodları açıkla
- **Sticky timeline**: sağ kolon viewport boyunca scroll'da kalır

**Dosya değişiklikleri:**
- `app/(app)/customers/[id]/page.tsx` — sağ panel cleanup + layout shuffle
- `components/customers/call-timer.tsx` (yeni)
- `components/customers/call-script-card.tsx` (yeni) — industry slug → script mapping
- `lib/call-scripts.ts` (yeni) — sektör başına 3-5 soru tanımı

**Acceptance:** Çağrı sırasında tek ekran, 4 ana buton, sektöre özel ipuçları sağda. Yanlışlıkla "Sil" tıklanamaz.

**Tahmin:** 8-10 saat, 2 PR (önce duplicate temizlik, sonra timer+script).

---

## Sayfa 4 — `/tasks` (Görevler)

### Şu anki hâl

- Sadece 2 görev var, ikisi de admin/operasyon görevi (Phase 58 browser test, UV82 listelemeleri eksik) — sales rep'in işi değil
- "Açık / Tümü / Tamamlandı / İptal" tab filtresi + 2 dropdown
- Vade tarihi görünmüyor, görev tipi yok
- Boş scroll alanı çok geniş
- "Bana atanmış" varsayılan değil

### Tespit edilen kusurlar

| Kod | Kusur | Etki |
|---|---|---|
| T-01 | Operasyon görevleri (Phase 58, UV82) sales rep'e karışık | Yanlış filter default |
| T-02 | "Bana atanmış" varsayılan değil | Yanlış scope |
| T-03 | Vade tarihi görünmez | Aciliyet bilinmez |
| T-04 | Görev tipi yok (çağrı/teklif/takip) | Sınıflandırma yok |
| T-05 | Yeni görev butonu sayfada yok | Görev eklemek için müşteriye gitmek lazım |
| T-06 | "Bugün vade / Bu hafta / Gecikmiş" cohort kartı yok | Aciliyet bakışı yok |
| T-07 | Görev kartında müşteri context'i belirsiz | Niye bu görev? |
| T-08 | Boş scroll alanı geniş | Görsel boşluk |

### Çözüm — Sales rep iş listesi

**Yeni yapı:**

1. **Cohort kartları (4 adet)** — `/customers`'taki gibi tıklanabilir filtre:
   - 🔴 Gecikmiş (2) — vadesi geçmiş
   - 🟡 Bugün (5) — vadesi bugün
   - 🟢 Bu Hafta (12) — gelecek 7 gün
   - ⚪ Tamamlandı (87) — son 30 gün
2. **Filter strip** (1 satır): "Bana atanmış (default)" / "Tümü" / Öncelik dropdown
3. **Görev kartı yeniden tasarım:**
   ```
   ┌─ ☎ Çağrı  · Yüksek · Vade: 2 saat içinde ─────┐
   │ KEREM ELEKTRONİK'i ara — fiyat listesi takibi│
   │ Atayan: Admin · Müşteri detayına git →       │
   │                              [Tamamlandı] [→]│
   └────────────────────────────────────────────────┘
   ```
   - Vade tarihi büyük + renk (kırmızı pulse = gecikmiş)
   - Görev tipi emoji (☎ çağrı / 📄 teklif / 🔄 takip / ✏️ not)
   - "Müşteri detayına git" link prominent
4. **Sticky "Yeni Görev" FAB** sağ alt köşe
5. **Boş state**: "Sana atanmış görev yok. Müşterilerine git → görev ekle"

**Dosya değişiklikleri:**
- `app/(app)/tasks/page.tsx` — cohort kartları + filter
- `components/tasks/task-cohort-cards.tsx` (yeni)
- `components/tasks/task-row.tsx` — yeniden tasarım, görev tipi + vade prominent
- `services/task-service.ts` — `getTaskCohortCounts()` + `getMyTasks(userId)` ekle
- `services/follow-up-task-service.ts` (varsa) — assignedToId default current user
- Schema değişikliği yok (mevcut FollowUpTask yeterli)

**Acceptance:** Sales rep `/tasks` açtığında ilk gördüğü "Bana atanmış 5 görev, 2'si bugün". 1 tıkla bir görev complete edebilir.

**Tahmin:** 5-7 saat, 1 PR.

---

## Sayfa 5 — `/customers/lists` (Lead Listelerim)

### Şu anki hâl

198 lead listesi tek scroll'da. Edirne İpsala (1 firma) ile İstanbul Bakırköy (50+ firma) yan yana, aynı boyutta. Tüm kartlarda stats "0/0/0/0" çünkü kimse aranmadı.

### Tespit edilen kusurlar

| Kod | Kusur | Etki |
|---|---|---|
| L-01 | 198 kart tek scroll | Bilişsel yük |
| L-02 | Sıralama yok — küçük listeler en üstte olabilir | Önem bulunmaz |
| L-03 | "Karışık sektör" etiketi anlamsız | Görsel kirlilik |
| L-04 | Edirne'nin 4 ilçesi ayrı kart | İl grupla eksik |
| L-05 | Tüm kartlar 0/0/0/0 — hangisini aramalıyım? | Karar verici yok |
| L-06 | İl/şehir filter yok | Lokasyona göre filtrele zor |
| L-07 | "Listeyi Görüntüle" + "Ara" iki buton | Tek CTA daha net |
| L-08 | "Bu hafta hangi listeye odaklan?" rapor yok | Yön yok |

### Çözüm — Şehir bazında accordion

**Yeni yapı:**

1. **Üst strip**: Toplam 198 liste · 1428 firma · 12 il
2. **Şehir filter dropdown**: "Tüm iller" / İstanbul (1500 firma) / Gaziantep (60) / ...
3. **Şehir başına accordion:**
   ```
   ▼ İstanbul  · 12 liste · 1500 firma · arama %3
   ┌─ Bakırköy ────────┐ ┌─ Fatih ────────┐
   │ 50 firma · %5 arandı│ │ 30 firma · %0  │
   │     [📞 Aramaya Başla]│ │  [📞 Ara]      │
   └────────────────────┘ └────────────────┘

   ▶ Gaziantep · 8 liste · 60 firma · arama %0
   ▶ Edirne    · 4 liste · 24 firma · arama %0
   ```
4. **Sıralama (default):** firma sayısı DESC + arama ilerlemesi ASC (en büyük + en hiç aranmamış üstte)
5. **Tek CTA**: "📞 Aramaya Başla" → direkt Power Queue'da o liste ile
6. **"Karışık sektör" etiketini kaldır** — tüm listeler karışık, gereksiz
7. **Boş listelerimi gizle toggle** — varsayılan açık, çağrı stats > 0 olan listeleri filtrele

**Dosya değişiklikleri:**
- `app/(app)/customers/lists/page.tsx` — accordion render
- `components/customers/lead-list-accordion.tsx` (yeni)
- `services/lead-list-service.ts` (yeni veya genişlet) — `getLeadListsGroupedByCity()` aggregation
- Tek CTA için Power Queue navigasyonu mevcut (`?leadListId=X&cohort=queue`)

**Acceptance:** Sales rep listeleri açtığında "Bugün hangi şehre odaklanacağım?" sorusuna 5 saniyede cevap bulur.

**Tahmin:** 4-6 saat, 1 PR.

---

## P0 — Hızlı Düzeltmeler (önce bunlar)

Schema/service değişikliği gerektirmeyen sadece UI cleanup. Tek PR.

### Kapsam

| Ref | Düzeltme | Dosya |
|---|---|---|
| CD-01, CD-02 | Müşteri detayında duplicate ARA/WhatsApp butonları kaldır | `app/(app)/customers/[id]/page.tsx` |
| CD-03 | "Sil" butonunu hero'dan kaldır, sadece edit sayfasında | `app/(app)/customers/[id]/page.tsx` |
| CD-04 | Sağ paneldeki "Hızlı İşlemler" Card kaldır | aynı dosya |
| CD-05 | İletişim sağ paneli kaldır (başlık'ta zaten var) | aynı dosya |
| CD-06, CD-07 | Stats kartında 0'ları gizle, "Yeni müşteri" rozet göster | aynı dosya |
| C-05 | Şirket = ad ise duplicate gösterme | `components/customers/customer-row.tsx` |
| L-03 | "Karışık sektör" etiketini kaldır | `app/(app)/customers/lists/page.tsx` |

**Tahmin:** 1-2 saat, 1 PR.

---

## Öncelik & Sıralama

| # | PR | Etki | Tahmin | Bağımlılık |
|---|---|---|---|---|
| 1 | **P0 — Duplicate temizliği + 0 gizleme** | Anlık görsel rahatlama, kazara silme önleme | 1-2 sa | Yok |
| 2 | **P1 — Sales rep dashboard** | Yeni rep'in günlük başlangıcı | 6-8 sa | role-based render |
| 3 | **P3 — Tasks cohort kartları** | Görev aciliyeti görünür | 5-7 sa | Yok |
| 4 | **P2 — Müşteri detay refactor** (script + timer hariç) | Çağrı ekranı sade | 4-5 sa | P0 yapılmış olmalı |
| 5 | **P4 — Lead listeleri accordion** | Şehir bazında karar | 4-6 sa | Yok |
| 6 | **P2b — Çağrı timer + script** | İleri seviye, sektörel script DB | 6-8 sa | call-scripts.ts seed |

**Toplam:** 26-36 saat (~4-5 iş günü), **6 PR**.

---

## Hangi prensiplerle yaklaştık

1. **Tek karar, tek ekran** — her sayfanın net bir "şimdi bunu yap" CTA'sı olmalı
2. **0 = gizle** — sıfır değerli stats motivasyon kırıcı; veri yoksa "Yeni müşteri" gibi pozitif rozet
3. **Aksiyon tekrarı yok** — her aksiyon bir yerde (sol blok = çalışma alanı, sağ = referans)
4. **Tehlikeli buton uzakta** — "Sil" hero'dan çıkar, edit sayfasında veya menüde
5. **Rol bazlı görünüm** — SALES rolündeki kullanıcı finansal/operasyon metrikleri görmemeli
6. **Cohort > rakam** — "519 uyuyan müşteri" yerine "Bugün ara: 5 müşteri" gibi aksiyon kohortları
7. **Empty state = öneri** — boş listeyi "henüz boş ✓" değil "şu adımı dene →" göster

---

## Acceptance — Yeni Sales Rep Smoke Test

Bu plan tamamlandıktan sonra yeni rep'in 5 dakikalık testi:

1. **Login** → `/dashboard` → "Şimdi {ad}'ı ara" hero kartı görür
2. **Hero'daki ARA butonuna tık** → `/customers/[id]`'ye gider, çağrı timer başlar
3. **Çağrı bittiğinde** → outcome chip seç ("İlgilendi") → otomatik next müşteriye
4. **`/tasks`** → "Bana atanmış 5 görev, 2'si bugün" → bir görev complete
5. **`/customers/lists`** → "İstanbul · Bakırköy 50 firma · %5 arandı" → Aramaya Başla → Power Queue

**Başarı kriteri:** Yeni rep bu 5 adımı kılavuz olmadan tamamlar.

---

## İlgili Dosyalar (referans)

- Mevcut KPI bar: `components/customers/sales-rep-kpi-bar.tsx`
- Mevcut cohort cards: `components/customers/customer-cohort-cards.tsx`
- Mevcut Power Queue: `services/customer-cohort-service.ts::getPowerQueueIds`
- Mevcut outcome chips: `components/customers/customer-quick-outcomes.tsx`
- Mevcut industry/sektör: Phase 99 — `prisma/schema.prisma::Industry`
- HelpDrawer (onboarding): `components/layout/help-drawer.tsx`
