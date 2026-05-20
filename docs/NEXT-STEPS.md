# NEXT STEPS

## Mission

This file defines execution priority from current state.

It answers one operational question:

What should be built next, in what order?

`ROADMAP.md` defines the target architecture.

`PROGRESS.md` defines the factual implementation state.

`NEXT-STEPS.md` defines the immediate execution stack between those two documents.

---

## Architecture Constraints (Immutable)

These constraints define what this system IS and IS NOT. Do not build against them.

**Stock source of truth: Entegra (via XML sync)**
- Entegra is the ERP. Stok hareketleri Entegra'da gerçekleşiyor.
- XML sync (`/api/cron/xml-sync`, `/admin/xml-sync`) Entegra'dan günlük stok güncellemesi çekiyor.
- Uygulamanın stok sayılarını kendi başına düşmesi / artırması YAPILMAZ.
- `StockAdjustmentLog` ve "Stoktan Düş" özellikleri artık kullanılmıyor (Entegra bunu yapıyor).

**Trendyol: Sadece READ-ONLY veri kaynağı**
- Trendyol API'den: sipariş, iade, soru, katalog verisi çekiliyor.
- Trendyol API'ye: hiçbir şey yazılmıyor (stok push, fiyat push YAPILMAZ).
- Phase 45 (`/admin/trendyol-stock-sync`) hatalı yönde oluşturuldu — bu sayfanın push işlevi kullanılmaz.

**Ana hedef: İthalatta doğru ürünü bulmak**
- Trendyol satış fiyatları + gerçek satış hacmi + ithal maliyet hesabı → hangi ürünü ithal et
- Kar analizi, iade oranı, satış hızı: ithalat kararı için veri sağlar
- Yeni pazaryeri yazma mimarisi bu projede YOK

---

## Current Reality

Current reality:
- CRM foundation exists
- quote workflow v1 exists
- relationship engine exists
- task and outreach foundations exist
- Turkish location layer exists
- RBAC is production-active
- inventory, profitability, XML import (Entegra), Trendyol read intelligence, supplier intelligence, import calculator, executive dashboard, and import decision engine all exist in some form

This means the product is already useful for:
- internal CRM operations
- quote workflows
- XML-driven inventory intake from Entegra
- Trendyol read-side operations (orders, returns, Q&A, catalog)
- pre-purchase import evaluation
- owner-grade executive review
- import buy/skip decisions replacing the old workbook

Not yet complete:
- product finance field sprawl still exists across import cost, TRY cost, marketplace price, shipping, commission, and override inputs
- operator-facing product finance truth is still too crowded for safe daily use
- XML sync'te stok değişim loglaması (hangi ürünün stoğu ne kadar değişti per sync)
- Trendyol sipariş verilerinde eşleşme oranı hâlâ düşük (188 eşleşmemiş ürün)
- İthalat kar analizi Trendyol gerçek satış fiyatlarıyla tam entegre değil
- Ürün bazında "bu ithalat karlı mı?" sorusunu tek sayfada yanıtlayan bir cockpit yok

## Role Coverage Gaps (identified 2026-05-17)

These are structural gaps in the current system, not single-feature bugs:

1. ~~**WAREHOUSE rolü yok**~~ — ✓ **ÇÖZÜLDÜ (Phase 55, 2026-05-17)**: WAREHOUSE enum, /warehouse, /warehouse/count, WarehouseWorkspace, createInventoryCountAction tamamlandı.
2. **Ürün formu rol körü** — `products.update` iznine sahip herkes (şu an: OPERATIONS) tüm finansal/ithalat alanlarını görür. Sahaya özel alan görünürlüğü uygulanmadı.
3. **Rol bazlı dashboard yok** — Tüm roller aynı /dashboard sayfasını görüyor. SALES ve WAREHOUSE için anlamsız kartlar gösteriliyor.
4. ~~**Satış fırsat motoru yok**~~ — ✓ **ÇÖZÜLDÜ (Phase 86, 2026-05-18)**: `/admin/sales-opportunities` — ürün bazlı müşteri talep özeti, filtreler, expand ile müşteri tablosu, CUSTOMERS_READ gated.
5. ~~**Operasyon koordinasyon yok**~~ — ✓ **ÇÖZÜLDÜ (Phase 87, 2026-05-18)**: `/admin/task-board` — görevler atanana göre gruplandı; ReassignForm inline atama; KPI kartlar; TASKS_ASSIGN gated.
6. **executive.read çok geniş** — İthalat zekası, sermaye, finans, XML sync, yönetici paneli hepsi tek permission altında. İleride `import.read` / `productFinance.read` gibi alt izinlere ayrılması gerekecek.

---

## Immediate Priority Stack

### Phase 97 — Lead List Manager (Google Maps Import + Yönetim)

**Neden:**
Kullanıcı Google Maps'ten elle topladığı firma listelerini (örn. "Hatay
güvenlik şirketleri 50 firma") sisteme aktaracak. Sales rep bu firmaları
arayacak, mesajlaşacak, görüşecek. Mevcut CSV import çok basit — kolon
mapping yok, dedup yok, lead list konsepti yok, otomatik tag yok.

**Hedef:**
Tek tıkla 50-200 firmalık liste eklenir, telefon dedup'lanır, otomatik
tag/source eklenir, sales rep Power Queue'da bunları görür ve arar.

**Schema değişimleri:**
- `LeadList` modeli (id, name, source, city, category, createdById)
- `CustomerLeadListMembership` (customerId + leadListId composite key)
- Customer.tags array (zaten var Phase 95b)

**Implementation Plan — 3 PR:**

PR Phase 97a: Schema + Import sayfası (CSV + paste)
- /customers/import-list yeni sayfa
- Form: Liste adı, Kaynak (Google Maps/Manuel/Trendyol Q&A), Şehir,
  Kategori, CustomerType, CSV upload veya paste textarea
- Sütun mapping UI (CSV için): drop-down per kolon
- Server action: createLeadListAction(name, source, rows[])

PR Phase 97b: Dedup + önizleme + otomatik tag
- Phone normalize → existing Customer kontrol → skip veya membership-only
- Önizleme: "X yeni, Y duplikat, Z hatalı"
- Tag otomatik: ["google-maps", "google-maps-{city}", "yeni-fırsat"]
- Customer.source = "Google Maps - {kategori} - {şehir}"
- shownInQueueCount = 0 (Power Queue'da öne çıkar)

PR Phase 97c: Lead List yönetim sayfası
- /customers/lists — tüm listeler tablosu
- Her satırda: ad, kaynak, toplam, arandı/teklif/kazanılan oranı
- "Aramaya başla" → ?leadList={id} filtre
- Liste sil + listeden müşteri çıkar

**Anti-goals:**
- Google Places API entegrasyonu BU FAZDA YOK (manuel/CSV yeterli)
- Otomatik Maps scraping BU FAZDA YOK
- Cross-list customer reassignment BU FAZDA YOK

**Exit:**
- Kullanıcı "Hatay güvenlik 50.csv" yükler → 50 firma 1 dakikada sisteme
  girer, dedup çalışır, sales rep Power Queue'da bunları görür ve aramaya
  başlar.

---

### Phase 96 — Sales Operating Maturity (Team Performance + Productivity)

**Neden:**
Phase 95 sales rep WORKSPACE'i tamamladı. Ama:
- Yönetici ekip performansını göremiyor
- Lead source ROI takip edilmiyor
- Sales rep çağrı sırasında ürün fiyatına hızlı erişemiyor
- WhatsApp mesajları her seferinde yeniden yazılıyor
- Aynı müşteri 2 sales rep tarafından aynı saatte aranabilir (çakışma uyarısı yok)

**Implementation Plan — 5 PR:**

PR Phase 96a: Team Performance Dashboard
- /admin/sales-performance yeni sayfa
- Bu hafta ekip leaderboard (görüşme/teklif/kazanılan)
- Sales rep aktif saat heatmap (opsiyonel ileri)

PR Phase 96b: Lead Source ROI + Şehir Heatmap
- Source bazlı conversion stats
- Şehir bazlı satış haritası (top 10 + bar chart)

PR Phase 96c: Ürün Hızlı Erişim + Hızlı Teklif (müşteri detay)
- Müşteri kartında widget: Kategori favorileri
- Tıkla → mini popover ürünleri (ad + fiyat + stok)
- "Hızlı Teklif" buton → ürün ara + miktar + ekle

PR Phase 96d: WhatsApp Message Templates
- MessageTemplate model + admin CRUD
- Sales rep'in WhatsApp butonunda template dropdown
- Değişkenler: {{müşteri_adı}}, {{son_teklif_no}}, {{son_görüşme}}

PR Phase 96e: Çağrı Çakışma Uyarısı + Haftalık KPI
- Müşteri kartında "Son 2 saat içinde Ali aktif" rozet
- KPI bar'a hover → haftalık özet + delta

**Exit:**
- Yönetici ekibin performansını hafta hafta görür
- Sales rep çağrı sırasında ürün + teklif + WhatsApp tek-akışta üretir
- İki rep aynı müşteriyi aynı saatte aramaz

---

### Phase 95 — Çağrı Merkezi Satış Workspace v2 (Sales Operating System)

**Neden:**
Mevcut müşteri ekranı (Phase 92-94 sonrası bile) çağrı merkezi sales uzmanı
için profesyonellikten uzak duruyor. Sayfa amatör, etkileşim yavaş, sıralı
arama yok, klavye kısayolu yok, akıllı önceliklendirme yok. Müşteri başına
60+ kez tıklama gerekiyor.

**Hedef Persona:**
Çağrı merkezi satış uzmanı — günde 50-100 telefon, müşteri başına 10-15 dk
hazırlık+çağrı+wrap-up. Her tıklama maliyetli. Yanlış müşteriye/yanlış
zamanda aramak para kaybı.

**Acceptance Criteria — 35 Litmus Soru:**
Bu sayfa şu 35 soruya "evet" diyene kadar tamamlanmış sayılmaz:

A. Günün İlk 30 Saniyesi
1. Sabah ilk açtığımda bugün arayacağım sıralı liste otomatik üretiliyor mu?
2. Günlük hedef + şu ana kadar yaptığım sayı görünüyor mu?
3. Haftalık performansım (ekip karşılaştırması ile) görünür mü?
4. Acil/gecikmiş görevler kırmızı/pulse ile dikkat çekiyor mu?

B. Müşteri Bulma Hızı
5. Cmd+K global komut paleti var mı?
6. Klavye okları (↑↓/J K) ile satır arası gezinti var mı?
7. Yazdığım anda liste filtrelenir (live search) mi?
8. Kayıtlı görünümler (saved views) var mı?
9. Tag/etiket sistemi var mı?

C. Çağrı Öncesi Bağlam (2 saniye)
10. "Ne almak istiyor" (ProductInterest) ekranda anında görünüyor mu?
11. Geçmişte ne aldığı (pazaryeri özet) anında görünür mü?
12. Son temas + sonraki aksiyon açıkta mı?
13. Lead skoru + renk açık mı?
14. Avatar/logo görsel kimlik var mı?
15. Son ne konuşulduğunu görüyor muyum?

D. Çağrı Sırasında
16. Telefon başlatmak 1 tıklama mı?
17. Persistent dialer footer var mı?
18. Inline yeni ürün ilgisi ekleme var mı?
19. Sevdiği ürünleri tek bakışta görüyor muyum?

E. Çağrı Sonrası Wrap-up (30 saniye)
20. Modal yerine outcome chip'leri (1-tıkla logla) var mı?
21. Sonraki aksiyon inline date picker 2 saniye mi?
22. Snooze ("Pazartesi 10:00 ara") kısayolu var mı?
23. Status değişimi inline mi?
24. Auto-progression (Power Mode) var mı?

F. Sıralı Arama (Power Mode)
25. Power Queue modu var mı?
26. 3 deneme açılmadıysa auto-snooze öneriyor mu?
27. Mute/DND "bir daha aramayın" işareti var mı?

G. Çoklu İşlem
28. Checkbox + bulk toolbar var mı?
29. Filtreli liste CSV indir var mı?

H. Görsel Profesyonellik
30. Avatar (initials veya foto) her müşteride var mı?
31. Density toggle var mı?
32. Renk semantiği tutarlı mı?
33. Screenshot olarak paylaşılırsa profesyonel görünür mü?

I. Akıllı Sıralama
34. Smart priority score (lead × urgency × time × value) tek sıralama var mı?
35. Sistem context-aware önerisi sunuyor mu?

**Schema değişimleri (additive):**
- `Customer.tags String[]` — tag sistemi
- `Customer.doNotCall Boolean @default(false)` — DND işareti
- `Customer.avatarUrl String?` — foto/logo (opsiyonel)
- `Customer.callAttempts Int @default(0)` — açılmadı sayacı (3 olunca auto-snooze)
- `Customer.lastCallAttemptAt DateTime?`
- (yeni model) `SavedView` — saved view kaydı
- Migration tag normalize için bir defalık.

**Bilgi Tamlığı Skoru (ÖNEMLİ — kullanıcı talebi):**
Power Queue + akıllı öneri sıralamasında "bilgisi en eksiksiz müşteri" öne
çıkmalı. Aynı müşteri tekrar tekrar gösterilmemeli (rotation).

Formül:
```
infoCompleteness =
   (hasPhone ? 25 : 0)
 + (hasEmail ? 10 : 0)
 + (hasWhatsapp ? 15 : 0)
 + (hasTaxNumber ? 10 : 0)
 + (hasCity ? 5 : 0)
 + (hasAddress ? 5 : 0)
 + (hasCompany ? 10 : 0)
 + (hasInterests ? 10 : 0)
 + (hasNotes ? 10 : 0)
```
Telefonu olmayan müşteri tıklanır kart üretmez, doğal olarak son sırada.

Anti-monotony (aynı müşteri hep çıkmasın):
- `Customer.shownInQueueCount` field (queue'da kaç kez gösterildi)
- Power Queue sıralama: priority × (1 / (shownInQueueCount + 1))
- 7 günde sıfırlanır
- Her queue render'ında increment

**Implementation Plan — 8 PR:**

| PR | İçerik | Süre | Q'lar | Bağımlılık |
|---|---|---|---|---|
| PR-α (Phase 95a) | ⌘K Komut Paleti + global search index | 2s | Q5, Q7 | yok |
| PR-β (Phase 95b) | Avatar sistemi + Customer.tags + Customer.doNotCall schema | 2s | Q9, Q14, Q30 | yok |
| PR-γ (Phase 95c) | Inline status edit + Outcome chips | 2s | Q20-23 | PR-α |
| PR-δ (Phase 95d) | Power Queue (sol sütun) + klavye nav + bilgi tamlık skoru | 3s | Q1, Q6, Q11, Q12, Q24-26 | PR-β |
| PR-ε (Phase 95e) | Kişisel KPI bar + ekip aktivite widget | 1.5s | Q2, Q3 | yok |
| PR-ζ (Phase 95f) | Kayıtlı görünümler (SavedView) + bulk actions + CSV | 2s | Q8, Q28, Q29 | PR-δ |
| PR-η (Phase 95g) | Persistent Dialer Footer + DND + callAttempts auto-snooze | 2s | Q17 | PR-γ |
| PR-θ (Phase 95h) | SmartPriorityScore + context-aware nudges + density toggle | 1.5s | Q31, Q34, Q35 | PR-δ |

Her PR ayrı canlıya, sıralı uygulanır. Toplam ~16 saat.

**Anti-goals:**
- Otomatik telefon arama (Twilio/etc.) BU FAZDA YOK — sonraki faza
- Sesli dikte / call recording BU FAZDA YOK
- E-posta gönderme entegrasyonu BU FAZDA YOK
- WhatsApp template message BU FAZDA YOK
- Pazaryerine outbound push KESINLIKLE YOK (Entegra kuralı)

**Exit kriteri:**
35 sorunun tümüne "evet". Bir bayi/ortağa ekran paylaşırken utanılmayacak
seviyede profesyonel görünüm.

---

### ✓ Phase 89 — Stock Source-of-Truth Fix (Entegra Authoritative) (2026-05-19)

**Neden:** Codex P0 audit'inin "kalan riskler" listesinde duran P1 ihlal: warehouse sayım + manuel adjustment akışları `Product.stockQuantity`'yi doğrudan mutate ediyordu — mimari kural "Entegra source-of-truth (via XML sync)" ile çelişiyordu.

Teslim edilenler:
- **Migration `20260519000000_phase89_physical_count`** (additive, reversible): `Product`'a `physicalCountQuantity / At / ById / Note` + FK + 2 index.
- **`lib/actions/inventory-count-actions.ts`**: `physicalCountQuantity` yazar, `stockQuantity` dokunmaz. `INVENTORY_COUNT` gated.
- **`lib/actions/stock-adjustment-actions.ts`**: `physicalCountQuantity += delta`, audit trail aynen. Permission `PRODUCTS_UPDATE` → `INVENTORY_COUNT` (WAREHOUSE erişimi).
- **`lib/actions/xml-sync-actions.ts`**: değişmedi (Entegra tek source).
- **`components/products/stock-adjustment-card.tsx`**: "Fiziksel Sayım Hareketleri" başlığı + Entegra/Sayım/Fark chip'leri + son sayım meta + non-XML-mutate açıklama.
- **`app/(app)/products/[id]/page.tsx`**: `canInventoryCount` gate'i ile koşullu render.
- **`app/(app)/warehouse/page.tsx`**: ürün satırında variance gösterimi.
- **`app/(app)/warehouse/count/page.tsx`**: başlık + info + button güncellemeleri.
- **Docs**: PROGRESS / current-state / CHANGELOG / PERMISSION-MODEL / NEXT-STEPS.
- tsc 0 hata.

---

### ✓ Codex Audit P0 — Finans/İthalat Görünürlük Sertleştirmesi (2026-05-18)

**Neden:** Codex audit'i `/products` listesi, `/products/[id]`, `/marketplace/profit`,
ve warehouse → ürün detay zincirinin finans/import verisini non-finance rollere
(SALES, OPERATIONS, WAREHOUSE, MARKETPLACE_OPERATOR) sızdırdığını gösterdi.

Teslim edilenler:
- `lib/finance-visibility.ts` (YENİ): merkezi `resolveFinanceGate(user) → { canViewFinance }`. Tek noktadan EXECUTIVE_READ kontrolü. Phase 57'de izin ayrımı geldiğinde sadece bu dosya değişecek.
- `app/(app)/products/page.tsx`: T.Fiyat / Net Kâr / Marj / ROI / Durum sütunları ve durum filtre pillsi `canViewFinance` gate altında. Finans hesaplaması + `MarketplacePrice` fetch'i non-finance kullanıcı için skip ediliyor. "Maliyet eksik / Ağırlık eksik / Trendyol fiyat yok" sağlık ipuçları finans-tinted olarak gate altında. Düzenle linki / "Yeni ürün" / Bulk butonları `products.update/create` izinlerine koşullu.
- `app/(app)/products/[id]/page.tsx`: Kârlılık / Pazar Yeri Fiyatlandırması / Yatırım Skoru / Trendyol Kâr Analizi / İthalat Kararı / Karar Geçmişi / Trendyol Satış Performansı / Aylık Trend / Tedarikçi Kaynağı / XML Kaynak Verisi kartları + finans Info satırları + finans rozetleri (Kârlı/Kaybettiriyor/BuySignal) hep `canViewFinance` koşullu. **Server-side data contract**: non-finance kullanıcı için product objesinden 23 finans alanı + `xmlData` + `marketplacePrices` strip ediliyor; salesRecords/supplierLinks/importSnapshots/platformPolicies fetch'leri skip ediliyor.
- `app/(app)/marketplace/profit/page.tsx`: `MARKETPLACE_LISTINGS_READ` → `EXECUTIVE_READ`. Marketplace operator artık net kâr/marj/ROI panelini açamaz.
- `app/(app)/marketplace/page.tsx`: "📊 Kârlılık" butonu `EXECUTIVE_READ` koşullu; "+ Yeni listeleme" `MARKETPLACE_LISTINGS_WRITE` koşullu.
- `app/(app)/layout.tsx`: "Pazar Kârlılığı" sidebar linki `EXECUTIVE_READ` izniyle güncellendi.
- `lib/user-roles.ts`: `UserRole` tipi ve `ALL_USER_ROLES` array'i WAREHOUSE eklendi (Prisma enum ve seed zaten içeriyordu). Bu drift `updateUserRoleAction`'ı WAREHOUSE atamasında "Geçersiz rol" döndürmesine yol açıyordu.
- `app/(app)/admin/users/page.tsx` + `[id]/page.tsx`: `ROLE_LABELS / ROLE_TONE / ROLE_COLOR` haritalarına WAREHOUSE eklendi.
- `app/(app)/admin/trendyol-catalog/page.tsx`: 3 adet stale `/admin/trendyol-stock-sync` linki kaldırıldı; "Trendyol read-only" politikası açıklaması.
- `lib/trendyol-api.ts`: `updateTrendyolInventory` deprecate edildi (artık runtime-throw). Yanlışlıkla call durumunda HTTP push'a değil error'a düşer.
- Docs: PROGRESS / current-state / PERMISSION-MODEL / NEXT-STEPS / CHANGELOG güncellendi.

Açık kalan riskler:
- **Stock source-of-truth ihlali**: `lib/actions/inventory-count-actions.ts` ve `lib/actions/stock-adjustment-actions.ts` `Product.stockQuantity` doğrudan mutate ediyor. Bu, "Entegra source-of-truth" mimari kuralı ile çelişiyor. Önerilen güvenli patch: ayrı `physicalCountQuantity` / `xmlStockQuantity` / `variance` / `countedAt` / `countedBy` / `countNote` alanları ekleyip XML sync dışındaki yazımları bunlara yönlendirmek. Destructive olduğundan ayrı bir migration phase'e bırakıldı.
- **`normalizeProductData`** içindeki `stockQuantity` direct update'i. Sadece ADMIN bu yola erişiyor (form), ama gelecek phase'de stockQuantity yazımının yalnızca XML sync + inventory count yolu ile yapılması önerilir.

---

### ✓ Phase 88 — Satış Fırsatları İnline Durum Güncellemesi (2026-05-18)

**Neden:** Phase 86'daki satış fırsatları sayfası read-only'di. Durum/öncelik değiştirmek için müşteri detayına gitmek gerekiyordu — bu da CRM iş akışını kesiyor. İnline güncelleme döngüyü kapatıyor.

Teslim edilenler:
- `lib/actions/update-interest-action.ts`: `updateInterestAction` — CUSTOMERS_UPDATE gated; status/priority/followUpAt patch; revalidatePath x2
- `app/(app)/admin/sales-opportunities/update-interest-form.tsx`: `"use client"` — onChange tetikli anlık güncelleme, useTransition, router.refresh()
- `app/(app)/admin/sales-opportunities/page.tsx`: "Durum / Öncelik" birleşik sütun → UpdateInterestForm
- tsc 0 hata ✓; commit cd6c72d ✓; READY dpl_ERpfaSBeqxZdAbBgvKLHpMBx892P ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 87 — Ekip Görev Panosu (2026-05-18)

**Neden:** Role Coverage Gap #5: `tasks.assign` permission vardı ama koordinatörün ekip görev durumunu göreceği ve görev atayacağı bir UI yoktu.

Teslim edilenler:
- `lib/actions/task-assign-action.ts`: `assignTaskAction` — TASKS_ASSIGN gated; FollowUpTask.assignedToId güncelleme; revalidatePath 3 sayfa
- `app/(app)/admin/task-board/reassign-form.tsx`: `"use client"` ReassignForm — isDirty koşullu "Ata" butonu, useTransition, router.refresh()
- `app/(app)/admin/task-board/page.tsx`: TASKS_ASSIGN gated; görevler assignedToId → UserGroup[] gruplandı; 4 KPI kart; gecikmiş badge; done toggle
- `app/(app)/layout.tsx`: "Görev Panosu" sidebar linki (CRM, TASKS_ASSIGN)
- tsc 0 hata ✓; commit f1ad15e ✓; READY dpl_8jWApfcCLstDjWLXd7qufexAHp2D ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 86 — Satış Fırsatları Motoru (2026-05-18)

**Neden:** Role Coverage Gap #4: "Satış fırsat motoru yok — Bu ürünü hangi müşteriye satarım?" sorusunu yanıtlayan akış yoktu. `ProductInterest` veri modeli hazır ama UI eksikti.

Teslim edilenler:
- `app/(app)/admin/sales-opportunities/page.tsx`: ProductInterest → ürün bazlı gruplandırma; 5 KPI kart; 4 filtre sekmesi (Tümü/Stok Var/Takip/Stok Bekliyor); expand param ile müşteri detay tablosu; gecikmiş takip renk uyarıları; CUSTOMERS_READ gated
- `app/(app)/layout.tsx`: "Satış Fırsatları" CRM bölümü sidebar linki
- tsc 0 hata ✓; commit cbf2090 ✓; READY dpl_27nV8A7ySRz1YbCP1pxB27YokdnW ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 85 — İthalat Cockpiti → Satın Alma Siparişi Köprüsü (2026-05-18)

**Neden:** İthalat cockpiti AL sinyali gösteriyordu ama "bu ürünü sipariş et" butonu yoktu. 90 günlük stok hedefi bazında recommendedQty hesaplanarak karar→sipariş döngüsü kapatıldı.

Teslim edilenler:
- `app/(app)/admin/import-cockpit/page.tsx`: `recommendedQty` hesabı (TARGET_DAYS=90); `orderCandidates` + `orderHref` URL; "📦 Sipariş Oluştur (N)" emerald header butonu
- `app/(app)/admin/purchase-orders/new/page.tsx`: `from=cockpit` kolu; cockpit banner metni
- tsc 0 hata ✓; commit 1fb44c3 ✓; READY dpl_F8TJx3MjjGG5nSss6jo6uSD1fLbX ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 84 — Trendyol Eşleştirme Sayfasında Hızlı Ürün Bağlantısı (2026-05-18)

**Neden:** Phase 83 sonrası 62 eşleşmemiş grup kaldı. "Ürün Ara →" linki yeni sekme açıyordu; ürünü bağlamak için ayrı ürün detay sayfası gerekiyordu. Sayfa içi modal bu süreci tek adıma indiriyor.

Teslim edilenler:
- `lib/actions/product-search-action.ts`: `searchProductsAction` — ILIKE name/sku/barcode, top-12
- `lib/actions/trendyol-link-action.ts`: `linkTrendyolGroupAction` — `updateMany` ile grup kayıtlarını seçilen ürüne bağlar
- `app/(app)/admin/trendyol-matching/link-product-button.tsx`: debounced arama modal + seçim → link + auto-reload
- `app/(app)/admin/trendyol-matching/page.tsx`: LinkProductButton her satıra eklendi
- tsc 0 hata ✓; commit 2b12832 ✓; READY dpl_21ZAQyB3WivZUuyYzH2cXQQrffQv ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 83 — Trendyol Satış Eşleştirme Yönetimi (2026-05-18)

**Neden:** 1.175 eşleşmemiş TrendyolSalesRecord T30G satış hızını ve ithalat ROI'sini bozuyordu. 621 kayıt için SKU eşleşmesi mevcuttu ama hiçbir admin arayüzü yoktu.

Teslim edilenler:
- `lib/actions/trendyol-rematch-action.ts`: ADMIN-only server action; 2-adım SQL UPDATE (SKU sonra barcode)
- `app/(app)/admin/trendyol-matching/page.tsx`: stats (toplam/eşleşen+%/eşleşmeyen+grup/düzeltilebilir), unmatched groups tablosu (top 100, cnt30d ile)
- `app/(app)/admin/trendyol-matching/rematch-button.tsx`: RematchButton client component + auto-reload
- `app/(app)/layout.tsx`: sidebar "Satış Eşleştirme" girişi eklendi
- Sonuç: %23 → %64 eşleşme oranı; 621 kayıt SKU eşleşmesiyle düzeltildi; 554 kayıt (62 ürün) hâlâ eşleşmiyor — bunlar için ürün kataloğunda SKU/barkod güncellenmeli
- tsc 0 hata ✓; commit aaa4ec4 ✓; READY dpl_GmmH2fVJGJsV4xA3QPndyYNVaJjx ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 82 — İthalatçı Görünümü Satır-içi Düzenleme + Eksik Veri Chip'leri + Skor (2026-05-18)

**Neden:** 735 ürünün Alış RMB / Ağırlık / Gümrük verileri eksikti. Veri girmek için ürün detay sayfasına gitmek gerekiyordu; bu da imkânsız derece yavaştı. Tabloda satır-içi düzenleme eksik veri girişini hızlandırıyor. Durum sütununda hangi verinin eksik olduğunu görmek doğru önceliklendirmeyi sağlıyor.

Teslim edilenler:
- `components/products/importer-view-client.tsx`: `InlineEditNumber` bileşeni; `getMissingFields()` Durum chip'leri; `recalcProduct()` client-side hesap; `saveInlineField()` PATCH+recalc; Skor sütunu sort
- `app/api/products/importer-view/route.ts`: yanıt `{products, usdTryRate, rmbUsdRate}` formatı
- tsc 0 hata ✓; commit a7c5a32 ✓; READY dpl_4SooZD6dtDdH5ujjZ7sFxbS5rgjj ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 81 — İthalatçı Görünümü → Satın Alma Siparişi Köprüsü (2026-05-18)

**Neden:** İthalatçı görünümü "Sipariş Önerisi (N)" gösteriyordu ama sipariş oluşturmak için ürün listesini manuel kopyalamak gerekiyordu. Tek tıkla geçiş eksikti.

Teslim edilenler:
- `components/products/importer-view-client.tsx`: "📦 Sipariş Oluştur (N)" emerald Link butonu (recommendedQty>0 ürünler items param olarak)
- `app/(app)/admin/purchase-orders/new/page.tsx`: `from=importer` + `items=id:qty` URL parse; `importerSuggestions` pre-fill; emerald info banner
- Schema değişikliği: YOK; Yeni endpoint: YOK
- tsc 0 hata ✓; commit 34837bc ✓; READY dpl_CKkYeSr2f25L7rsGEBNaEsUccyqU ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 80 — İthalatçı Görünümü Hızlı Düzenleme Modali (2026-05-18)

**Neden:** 735 ürünün maliyet verisi eksikti. İthalatçı görünümü bu ürünleri tespit ediyordu ama düzenleme için her seferinde ürün detay sayfasına gitmek gerekiyordu. Tabloda inline quick-edit modal en hızlı veri giriş yöntemi.

Teslim edilenler:
- `app/api/products/[id]/import-fields/route.ts`: ADMIN-only PATCH, 5 alan kısmi güncelleme, `parseDecimalField()` (undefined/null/number), shippingMethodPref doğrulaması
- `components/products/import-quick-edit.tsx`: Modal UI — 5 input + kargo toggle + mevcut değerler hint + yükleme durumu
- `components/products/importer-view-client.tsx`: ✏ buton sütunu (762 buton), `handleQuickSave` optimistik güncelleme, colSpan 16→17
- Schema değişikliği: YOK
- tsc 0 hata ✓; commit 72d74b0 ✓; READY dpl_DxRQD6HVXLRbWXsR1s7JkWixmGy9 ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 74 — Ürün Listesi Kârlılık Durum Filtresi (2026-05-18)

**Neden:** Ürün listesi Net Kâr/Marj/ROI/Durum sütunlarını gösteriyordu ama "sadece zararlı ürünleri göster" veya "sadece veri eksik ürünleri göster" filtrelemesi yoktu.

Teslim edilenler:
- `app/(app)/products/page.tsx`: `durumFilter` URL param; `allRows: RowData[]` pre-computation (profit + healthCues); `filteredRows` by durumFilter; `durumCounts` per category
- Filter pills: Tümü / Mükemmel / İyi / Düşük / Zarar / Veri Yok — her biri sayı badge'i ile
- Aktif pill renk kodlu (Mükemmel=emerald, Düşük=amber, Zarar=red, Veri Yok=slate)
- `durumHref()`: mevcut q/status/stock/sort parametrelerini koruyarak durum param ekler
- Footer: "X gösteriliyor (Y toplam)" filter aktifken
- Schema değişikliği: YOK; Yeni DB sorgusu: YOK
- tsc 0 yeni hata ✓; commit a248b81 ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 73 — Kilitli Sermaye Dağılım Analizi (2026-05-18)

**Neden:** `/admin/capital` sayfası toplam ₺519k stok değerini gösteriyordu ama hangi ürünlerin sermayeyi bağladığı görünmüyordu. "Kilitli sermaye dağılımı" bölümü bu soruyu doğrudan yanıtlıyor.

Teslim edilenler:
- `app/(app)/admin/capital/page.tsx`: `capitalBreakdown` hesabı — `productsWithScore` üzerinden `filter → map → sort → slice(0,20)`; `BreakdownRow` ve `ScoreItem` tip tanımları
- `totalLockedValue`: tüm maliyetli ürünlerin toplam stok değeri
- UI: öneriler tablosunun altında yeni "Kilitli sermaye dağılımı" Card'ı
- Sütunlar: Ürün / Stok / Birim maliyet / Stok değeri / % Pay (amber≥%10) / Dağılım (amber bar)
- tfoot: toplam kilitli değer + açıklama notu
- Schema değişikliği: YOK; Yeni DB sorgusu: YOK
- tsc 0 yeni hata ✓; commit 3c93715 ✓; browser-verified 2026-05-18 ✓

---

### ✓ Phase 72 — İthalat Cockpit MarketplacePrice Entegrasyonu (2026-05-18)

**Neden:** Phase 71 ile `MarketplacePrice` canonical fiyat kaydı oluşturuldu ama import cockpit hâlâ `xmlData.xmlTrendyolPrice` (USD→TRY dönüşümü gerektiren) fallback kullanıyordu. 646 TRENDYOL kayıtlı ürün için daha temiz, zaten TRY cinsinden olan `priceTry` mevcut olmasına rağmen kullanılmıyordu.

Teslim edilenler:
- `app/(app)/admin/import-cockpit/page.tsx`: fiyat çözümleme Tier 2 olarak `MarketplacePrice TRENDYOL` eklendi
- Hiyerarşi: Trendyol gerçekleşen avg (90g) → **MP Fiyat** (violet badge) → XML Trendyol → Manuel
- `prisma.marketplacePrice.findMany({ where: { marketplace: "TRENDYOL" } })` paralel fetch eklendi
- `mpTrendyolMap`: `productId → priceTry` lookup map
- `priceSource` tipi `"mp"` eklendi; violet badge "MP Fiyat" kaynak etiket görünümü
- Hesaplama Mantığı footer güncellendi
- Schema değişikliği: YOK
- tsc 0 yeni hata ✓; commit b1880a4 ✓; browser-verified 2026-05-18 ✓

---

### ✓ Sermaye Sayfası Stok Değeri Fix (2026-05-18)

**Neden:** `/admin/capital` sayfasında stok değeri 0 görünüyordu — `unitCostTry` null olan ürünler lockedCapital hesabına dahil edilmiyordu.

**Kök neden:** `capital-allocation.ts` `unitCostTry` null ise ürünü 0 maliyet ile hesaplıyordu; RMB kaynaklı ürünler için iniş maliyeti hesabı yoktu.

Teslim edilenler:
- `app/(app)/admin/capital/page.tsx`: `computeLandedCost()` yardımcı fonksiyonu (unitCostTry önce, yoksa RMB formülü)
- `sourceCostRmb`, `weightKg`, `customsRatePct`, `importPaymentFeePct` product select'e eklendi
- 4. paralel sorgu: `MonthlyExchangeRate` (usdTryRate + rmbUsdRate, fallback: 38, 7.25)
- `effectiveCostTry = computeLandedCost(p)` → `capital-allocation.ts`'e `unitCostTry` override olarak iletildi
- `SummaryCard` opsiyonel `subtitle` prop eklendi; "Stok değeri (kilitli)" + "iniş maliyeti × stok adeti" alt başlık
- Suggestions tablosuna "Stok değeri" kolonu eklendi
- commit 2c74a94 ✓

### ✓ Envanter Excel Import (2026-05-18)

**Neden:** Çalışan excel dosyasındaki (docs/urunler.xlsx) ürünlerin RMB alış, ağırlık ve gümrük oranı verilerini DB'ye aktarmak için tek seferlik import yapılması istendi.

Teslim edilenler:
- `docs/urunler.xlsx` Envanter sayfası okundu; Ürün Kodu / Ürün Adı / Alış Rmb / Ağırlık / Vergi Oranı kolonları çekildi
- SKU öncelikli, ardından ürün adı ile eşleşme — 22 SKU + 1 ad eşleşmesi = 23 ürün güncellendi
- `sourceCostRmb`, `weightKg`, `customsRatePct` alanları DB'ye yazıldı
- Post-import bug fix: `customsRatePct` decimal fraction olarak saklanmıştı (0.3, 0.6, 0.7); `WHERE <= 1 SET *= 100` SQL düzeltmesiyle 18 satır 30/40/50/60/70% değerlerine getirildi
- Kalıcı veri değişikliği — kod dosyası değil

---

### ✓ Phase 71 — PRODUCT PROFIT ENGINE REFACTOR (2026-05-18)

Neden:
XML sync ürün fiyatlarını (`xmlTrendyolPrice`, `xmlHbPrice` vb.) doğrudan XmlProductData'ya yazıyordu; bu fiyatlar ürün listesi ve kâr hesaplamalarında dağınık biçimde kullanılıyordu. Merkezi bir fiyat kaydı yoktu.

Teslim edilenler:
- `MarketplacePrice` tablosu: `@@unique([productId, marketplace])`, `PriceMarketplace` enum (TRENDYOL/HEPSIBURADA/AMAZON/N11/PAZARAMA/IDEFIX/WEBSITE/OTHER), `PriceSource` enum (XML/API/MANUAL)
- `xml-sync-actions.ts` step 7b: her XML sync sonrası 5 platform için batch MarketplacePrice upsert (USD×usdTryRate)
- `product-service.ts`: `listProducts` + `getProductById` `marketplacePrices` include
- `products/page.tsx`: yeniden düzenlenmiş health cue'lar (Maliyet eksik / Ağırlık eksik / Trendyol fiyat yok); `calcProfit()` (kargo 10 USD/kg, gümrük, komisyon %20, sabit ₺150); 4 yeni sütun: Net Kâr / Marj% / ROI / Durum (LOSS/LOW/GOOD/EXCELLENT)
- `products/[id]/page.tsx`: `trendyolPriceTry` → MarketplacePrice birincil, xmlData fallback; kaynak etiketi (XML/Manuel)
- Backfill: 1715 satır — TRENDYOL:646 / HB:584 / AMZ:221 / PAZ:146 / IDX:118 (usdTryRate=46.0)
- Migration: `20260518000000_phase71_marketplace_price_table`
- Legacy fields preserved (Phases 3+4 ertelendi — 51+ dosya referans veriyor)

Doğrulanan metrikler (SKU 2251930284620):
- Trendyol Satış: ₺383.33 (MarketplacePrice, kaynak: XML) | Net Kâr: ₺44.80 | Marj: %11.7 | ROI: %40.1 | Durum: Düşük
- Health cue'lar: "Maliyet eksik" 23+ üründe ✓ | "Trendyol fiyat yok" ✓ | "Ağırlık eksik" (kod doğru, veri yok — 4 RMB ürününün hepsinde weightKg var)

tsc 0 yeni hata ✓ | lint pre-existing hatalar ✓ | commit 4e40c2a ✓ | READY dpl_FYRZSLcUkmHYodP3ScbLUVyBG3AY ✓ | browser-verified 2026-05-18 ✓

Ertelenenler (Phases 3+4):
- `xmlTrendyolPrice`, `xmlHbPrice` vb. XmlProductData alanları kaldırılmadı (51+ dosya referans veriyor)
- `Product.sellingPriceTry`, `marketplacePriceTry` legacy alanları korundu
- Faz 3 (legacy read kaldırma) ve Faz 4 (column drop) ayrı migration olarak planlanmalı

---

### Priority 0 - Safety and Data Governance Baseline

Why:
Schema-heavy phases should not proceed without minimum migration and data-governance safety rules.

Includes:
- migration safety checklist
- backup/rollback discipline
- duplicate SKU/barcode awareness
- missing cost/category/link reports as future checks
- no destructive production operations without explicit approval

Clarification:
- this does not mean fully redoing Phase 23 and Phase 24
- it means keeping those rules active while the next product-heavy phases are built

### ✓ Priority 0A — Product Finance Field Consolidation (Phase 52, 2026-05-17)

Neden:
Ürün düzeyinde çok sayıda üst üste binen alan vardı: ithalat maliyeti (RMB + USD), pazar yeri satış fiyatı
(genel `marketplacePriceTry` vs. platform bazlı XML fiyatları), kargo/komisyon (ürün geçersiz kılması vs. platform
politikası). Bu ambiguity çözülmezse sonraki fazlar belirsiz truth kaynaklarına yeni mantık katmanları ekler.

Delivered (Phase 52 — product-form.tsx UI refactor, no schema change):
- `importUnitCostUsd` "İthalat ve envanter" bölümünden alınıp "İthalat kararı girdileri" bölümüne taşındı
- Kaynak maliyet bölümü Birincil (RMB, emerald) / Yedek (USD, slate) görsel hiyerarşisiyle yeniden düzenlendi
- `marketplacePriceTry` etiketi "Pazar yeri fiyatı — genel fallback (₺)" olarak değiştirildi (artık canonical değil)
- Footer notu: "Platform bazlı gerçek fiyatlar XML beslemesinden gelir; fallback yalnızca XML yoksa devreye girer"
- Override bölümü başlığı "Tier 1" eki + 4-katmanlı çözümleme açıklaması (ürün → platform → sistem) ile güncellendi
- Tüm 4 override field placeholder'ı netleştirildi
- tsc clean, Vercel READY (dpl_AofZouL4KKtPLPsejAsWXV5ZWR7Q), browser-verified 2026-05-17 ✓

### ✓ Priority 1 — Marketplace Data Reliability Closure (Phase 29, 2026-05-17)

Delivered:
- TrendyolReturnRecord model + migration (applied to production)
- syncTrendyolReturnsAction: 365-day sweep, barcode/SKU matching, upsert dedup
- /orders page: 5-tab local order ledger (Tümü/Teslim/İptal/İadeler/Eşleşmemiş), newest-first, 1.105 order lines, pagination, matched product links
- Unmatched inbox with amber hint + link to /admin/marketplace-mappings
- Siparişler sidebar link (EXECUTIVE_READ)
- Browser-verified 2026-05-17 ✓

Remaining open items (not required for Priority 1 completion):
- Historical backfill when a new mapping is approved (retroactively update TrendyolSalesRecord.productId)
- This is low-priority; the matching inbox + manual mapping page covers the workflow

### ✓ Priority 2 — Marketplace Margin Policy Normalization (Phase 30, 2026-05-17)

Delivered:
- MarketplacePlatformPolicy model + migration (applied to production)
- Per-platform: standard shipping (TRY), commission %, payment fee %, return reserve %, VAT %
- upsertPlatformPolicyAction: MARKETPLACE_POLICIES_MANAGE gated, upsert per platform
- /admin/marketplace-policies: all 8 platforms, inline save per card, Yapılandırıldı/Varsayılan badge
- Resolution order explanation card in admin UI
- lib/marketplace-policy.ts: resolveMarginPolicy() — product override > product value > platform standard > system default
- policySourceLabel/policySourceColor: Turkish labels and badge colors per source
- /marketplace/profit rewritten: uses resolveMarginPolicy(), winners/losers tables show Kargo + Komisyon columns with PolicyBadge source labels
- Policy coverage notice on profit page when no platforms configured
- MARKETPLACE_POLICIES_MANAGE permission + sidebar link added
- Browser-verified 2026-05-17 ✓

### ✓ Priority 3 — Import Economics Normalization (Phase 31, 2026-05-17)

Delivered:
- SEA_FREIGHT_PER_KG corrected: 2 → 1 USD/kg (workbook-correct value)
- MonthlyExchangeRate: rmbUsdRate Decimal(12,4) optional column added
- Product: sourceCostRmb Decimal(15,2) + importPaymentFeePct Decimal(5,2) optional columns added
- Migration: 20260517150000_phase31_import_economics_rmb applied to production
- RMB-first canonical formula: `(sourceCostRmb / rmbUsdRate) * (1 + paymentFeePct/100) + freight * weightKg) * (1 + customsRatePct/100)`
  falls back to sourcePriceUsd when RMB fields absent
- Exchange rate form: RMB/USD input field (5-column grid)
- Exchange rates page: RMB/USD column in table, updated heading and help text
- Exchange rate actions: rmbUsdRate in upsert schema; getLatestRmbUsdRate() utility
- Product form: amber "RMB kaynaklı ithalat" section with sourceCostRmb + importPaymentFeePct + formula hint
- product-actions: maps new fields to DB
- import-decisions cockpit: fetches + passes RMB fields to calculateImportDecision
- product detail page: RMB fields wired to calculateImportDecision
- Browser-verified 2026-05-17 ✓

Remaining (not blocking Priority 4):
- shared landed-cost truth not yet propagated to procurement/capital/executive views (deferred to Priority 4)
- route/profile freight override hierarchy (deferred)

### ✓ Priority 4 — Holding-Grade Import Governance (Phase 32, 2026-05-17)

Delivered:
- Supplier model: defaultAirFreightUsdPerKg, defaultSeaFreightUsdPerKg, defaultPaymentFeePct optional Decimal fields
- ImportDecisionSnapshot model: freezes all decision inputs + computed outputs at approval time
- Migration: 20260517160000_phase32_import_governance applied to production
- Three-tier freight resolution: product-level override → supplier default → global constant (AIR=8, SEA=1 USD/kg)
- effectiveFreightPerKg() exported helper from lib/import-decision.ts
- createImportDecisionSnapshotAction: EXECUTIVE_READ-gated, resolves all inputs, calls calculateImportDecision, saves full snapshot
- getProductImportSnapshotsAction: last 10 snapshots with createdBy + supplier names
- ImportSnapshotButton client component (emerald, useTransition, "Kararı Kaydet")
- Import Decisions cockpit: new "Kaydet" column with snapshot button per row
- Product detail page: "Kararı Kaydet" button in İthalat Kararı card header + "Karar Geçmişi" history table
- Supplier form/list: import defaults section (air freight, sea freight, payment fee)
- Browser-verified 2026-05-17 ✓

### ✓ Priority 21 — XML Stok Değişim Logu (Phase 49, 2026-05-17)

Delivered:
- `XmlStockChangeLog` model: productId, syncLogId, sourceId, previousQty, newQty, delta, syncedAt
- Migration: `20260517490000_phase49_xml_stock_change_log` applied to production
- `runSync` updated: fetches `stockQuantity` for existing products; compares previousQty vs newQty; batch-inserts `XmlStockChangeLog` for products whose stock actually changed (MANUAL-source and no-change products excluded)
- Sync result message reports count of changed products
- `/admin/xml-sync`: "Son Senkronizasyon Değişimleri" section — groups latest 100 changes by syncLogId, shows product links, ↑ emerald / ↓ red delta badges, empty state for no-change syncs
- Browser-verified 2026-05-17 ✓

### ✓ Priority 24 — USD Kademeli Kargo + Cockpit Politika Düzeltmeleri (Phase 51, 2026-05-17)

Neden:
Phase 50 cockpit'i Trendyol gerçek verisiyle çalışır hale getirdi ama komisyon ve kargo için hardcoded `0` bıraktı — bu tüm marj hesaplamalarını yanlış yapıyordu. Ayrıca Trendyol kargo maliyeti tek sabit değil, ürün fiyatına göre kademeli (düşük fiyatlı ürünlerde az kargo, yüksekte daha fazla). XML'den çekilen Trendyol fiyatları da cockpit'e bağlı değildi; eşleşmemiş ürünler için değerli bir kaynak olarak kullanılabilirdi.

Delivered:
- `MarketplacePlatformPolicy.shippingTiersJson String?` — JSON kargo kademesi sütunu (additive, `db push` ile uygulandı)
- `lib/marketplace-policy.ts`: `ShippingTier` tipi, `parseShippingTiers()`, `resolveTieredShipping()` yardımcıları
- `resolveMarginPolicy()` — yeni `context: { sellingPriceUsd?, usdTryRate? }` parametresi; ürün değeri sonrası USD kademeli kargo deneniyor, ardından platform sabit kargo, ardından sistem varsayılanı
- `DEFAULT_TRENDYOL_TIERS` sabiti: `<$5 → $1.2`, `$5–$7.5 → $2.0`, `>$7.5 → $3.3` (USD)
- `marketplace-policy-actions.ts`: `shippingTiersJson` upsert + server-side JSON doğrulaması (son kademe catch-all zorunluluğu)
- `platform-policy-form.tsx`: kademeli kargo tablosu UI (satır ekle/kaldır, son satır sonsuz), "Trendyol Varsayılanlarını Yükle" butonu
- `marketplace-policies/page.tsx`: `shippingTiersJson` forma iletiliyor
- `import-cockpit/page.tsx`:
  - Trendyol `MarketplacePlatformPolicy` paralel çekiliyor
  - `xmlData.xmlTrendyolPrice` ürün seçimine eklendi
  - Fiyat önceliği: Trendyol gerçekleşen → XML Trendyol → Manuel
  - Komisyon ve kargo: `resolveMarginPolicy()` ile çözümleniyor (artık `0` fallback yok)
  - "XML Fiyat" badge (mavi) kaynak etiketleri arasına eklendi
  - Formül açıklama kartı güncellendi
- tsc clean, Vercel READY (dpl_86pYyepfQR5grZuaDzaerAfqnHQz), browser-verified 2026-05-17 ✓

### ✓ Priority 22 — İthalat Karar Cockpiti v2 (Phase 50, 2026-05-17)

Delivered:
- `/admin/import-cockpit`: new page, no schema change
- Trendyol 90-day avg sale price (Delivered only) via `groupBy` on TrendyolSalesRecord
- Trendyol 30-day velocity via `groupBy` on TrendyolSalesRecord
- Return rate: TrendyolReturnRecord count / (sales90d + returns) per product
- Import landed cost (TRY) via existing `calculateImportDecision` engine × exchange rate
- Net profit/unit (TRY) = netRevenueTry − landedCostTry
- Margin % = netProfitTry / resolvedPriceTry × 100
- Effective monthly units = 30d velocity × (1 − returnRate); falls back to manual estimates
- Monthly profit estimate = netProfitTry × effectiveMonthlyUnits
- Signal: AL (marj ≥ %25) / BEKLE (marj ≥ %15) / ALMA / Veri Eksik
- Unmatched warning banner: N products with no Trendyol data → link to marketplace mappings
- Price source badge: Trendyol (orange) / Manuel (slate) / Fiyat yok (red)
- Tab bar: Tümü | AL | BEKLE | ALMA | Veri Eksik with counts
- "v1 Görünüm →" link to existing /admin/import-decisions
- Sidebar: "İthalat Cockpiti v2" added; v1 renamed "İthalat Kararları v1"
- tsc clean, Vercel READY (dpl_71WA3rEYVH6XPiQaeEdBgC3vHsSt), browser-verified 2026-05-17 ✓

### ✓ Priority 23 — Gereksiz Sayfaların Temizlenmesi (2026-05-17)

Delivered:
- Sidebar: "Trendyol Stok Senkronu" linki kaldırıldı
- `/admin/trendyol-stock-sync`: push sayfası devre dışı bırakıldı — amber uyarı kartıyla kilitleniyor
- `pushTrendyolStockAction()`: hemen hata döndürüyor (DB/API çağrısı yok)
- `/orders`: TrendyolStockDeductionButton ve getPendingDeductionCount kaldırıldı
- Schema değişikliği yok; TrendyolSalesRecord.stockDeducted korundu
- tsc clean, build ✓, browser-verified 2026-05-17 ✓

### ✓ Priority 20 — Trendyol Daily Sync Cron (Phase 48, 2026-05-17)

Delivered:
- `app/api/cron/trendyol-sync/route.ts`: Vercel cron, daily 06:00 UTC, CRON_SECRET Bearer auth
- 14-day sliding window covers recent orders + status changes without hitting Vercel 5-min limit
- `syncOrders`: paginated TrendyolSalesRecord upsert (barcode/SKU match, discountedPrice fallback)
- `syncReturns`: paginated TrendyolReturnRecord upsert (claimItemStatus, reason code/name)
- Parallel execution via `Promise.allSettled` — one side failing doesn't block the other
- `vercel.json` updated with `0 6 * * *` cron schedule for trendyol-sync
- No schema change
- Deployment READY, tsc clean; cron endpoint verified (deployment live + tsc pass) ✓

### ✓ Priority 19 — Operational Intelligence Dashboard (Phase 47, 2026-05-17)

Delivered:
- `getOperationalAlerts()` in dashboard-service: criticalStockCount / pendingDeductionCount / unmatchedOrdersCount / recentOrderQty7d / trendyolRevenue30d (all DB-only, no live API calls)
- `/dashboard` "Trendyol & Stok" section with 5 clickable stat tiles deep-linking into operational pages
- `LinkedStatCard` component: Card + Link wrapper with hover shadow
- Dashboard hero badge updated to "Faz 47"
- No schema change
- Browser-verified 2026-05-17: section renders, 5 tiles with correct links, Faz 47 badge ✓

### ✓ Priority 18 — Trendyol Catalog View (Phase 46, 2026-05-17)

Delivered:
- `fetchTrendyolCatalog()` in trendyol-api.ts: GET products endpoint, page/size/approved params, TrendyolCatalogProduct + TrendyolCatalogResponse types
- `/admin/trendyol-catalog` server page: fetches up to 4 pages (200 products), cross-refs with internal Product.barcode + MarketplaceProductMapping barcodes/SKUs
- KPI cards: Trendyol'da / Aşım Riski / Senkron / Eşleşmemiş
- Matched table: delta badge (red=oversell risk, amber=internal surplus, green=in sync), sorted by |delta| desc
- Unmatched table: "Eşleştir →" deep-link pre-filling marketplace-mappings form
- Oversell risk warning banner + surplus stock push suggestion banner
- Graceful error display for API failures
- "Trendyol Katalog" nav link added (EXECUTIVE_READ)
- Browser-verified 2026-05-17: 200/6176 ürün, 12 eşleşmiş, 188 eşleşmemiş, oversell uyarısı gösteriliyor ✓

### ✓ Priority 17 — Trendyol Stock Sync (Phase 45, 2026-05-17)

Delivered:
- `updateTrendyolInventory()` in trendyol-api.ts: PUT price-and-inventory endpoint, PRODUCT_BASE_URL, batches of 100
- `getTrendyolStockPushPreviewAction()`: read-only preview — all TRENDYOL mappings with platformBarcode + sellingPriceTry joined with product data
- `pushTrendyolStockAction()`: EXECUTIVE_READ gated, groups into batches of 100, returns batchIds array
- `TrendyolStockPushButton`: client component with transition states + batchId display
- `/admin/trendyol-stock-sync`: preview page, KPI cards, push action card, product table
- "Trendyol Stok Senkronu" nav link added
- Browser-verified 2026-05-17: 2 matched products, push button renders, KPI cards show correctly ✓

### ✓ Priority 16 — Stock Health Dashboard (Phase 44, 2026-05-17)

Delivered:
- `/admin/stock-health` (EXECUTIVE_READ gated), no schema change
- Parallel fetch: all products (id/name/sku/stockQuantity), 30-day TrendyolSalesRecord, last 15 StockAdjustmentLog
- Three-tier product classification: Critical (qty ≤ 0), Low (coverage < 30 days), Healthy
- Coverage formula: `Math.floor(stockQuantity / (sales30d / 30))`, cancelled orders filtered
- KPI cards: Kritik (red), Düşük (amber), Sağlıklı (emerald)
- Critical table: product link, SKU, qty (red bold), 30d Trendyol sales
- Low table sorted by coverage ascending: product link, SKU, qty, 30d sales, coverage badge (≤7g red / ≤14g amber / <30g yellow)
- Recent adjustments table: product link, ADJ_LABEL type badge (ADJ_COLOR), ±delta, newQty, notes, Turkish date
- "Stok Sağlığı" sidebar link added (EXECUTIVE_READ)
- Browser-verified 2026-05-17: KPI cards render (606 Kritik), nav link active, recent adjustments table ✓

### ✓ Priority 15 — Trendyol Stock Auto-Deduction (Phase 43, 2026-05-17)

Delivered:
- TrendyolSalesRecord.stockDeducted Boolean flag + migration applied to production
- getPendingDeductionCount(): fast count of unprocessed matched non-cancelled lines
- applyTrendyolStockDeductionAction(): PRODUCTS_UPDATE gated, groups by productId, Prisma $transaction per product (stockQuantity update + StockAdjustmentLog SALE + mark deducted=true)
- TrendyolStockDeductionButton: amber pending badge, "Stoktan Düş" button, success message + auto-reload
- Orders page: amber card shows when pending > 0, hidden after processing
- Browser-verified 2026-05-17: 183 order lines → 21 products deducted atomically, 21 StockAdjustmentLog SALE entries ✓

### ✓ Priority 14 — Stock Adjustment Log (Phase 42, 2026-05-17)

Delivered:
- StockAdjustmentType enum (RESTOCK/CORRECTION/DAMAGE/RETURN/SALE/OTHER) + StockAdjustmentLog model
- Migration: 20260517420000_phase42_stock_adjustment_log applied to production
- createStockAdjustmentAction: PRODUCTS_UPDATE gated, Prisma $transaction (atomic stockQuantity update + log write), negative stock prevention
- getProductStockAdjustments: last 20 entries, createdBy name
- StockAdjustmentCard client component: type select, ±direction toggle, qty input, notes; history table with colored badges, ±delta, prev/next qty, timestamp
- Optimistic UI: row prepends immediately on success, "Güncel: N adet" badge updates
- Product detail page: StockAdjustmentCard at bottom, parallel-fetched
- Browser-verified 2026-05-17: form → save → row appears (100→105), success message ✓

### ✓ Priority 13 — Bulk Mapping Backfill Engine (Phase 41, 2026-05-17)

Delivered:
- bulkBackfillAllMappingsAction(): iterates all MarketplaceProductMapping entries, runs backfill for each, returns aggregate sales+returns count
- backfillMappingProductId() now returns { sales, returns } counts
- Per-mapping create/update now surfaces backfill count in success message
- BulkBackfillButton client component: "Tüm Eşleştirmeleri Uygula" with count display + auto-reload
- MappingForm: shows dynamic success message from server action
- No schema change — writes TrendyolSalesRecord + TrendyolReturnRecord productId
- Browser-verified 2026-05-17: button renders in header, page loads correctly ✓

### ✓ Priority 12 — Capital Allocation + Real Sales Velocity (Phase 40, 2026-05-17)

Delivered:
- /admin/capital investment scores now driven by actual 30-day Trendyol sales velocity when available
- Fetches TrendyolSalesRecord (last 30 days, non-cancelled, matched) in parallel with CapitalConfig + products
- actualSales30d Map<productId, qty> built using isCancelledStatus() filter
- effectiveOnlinePotential: actualQty overrides manual onlineSalesPotential when present
- velocitySource tracked per product: "actual" / "estimated"
- New "Hız" column in suggestions table: Gerçek (emerald) / Tahmin (slate) badge
- "Gerçek Satış Verisi Aktif" emerald banner with explanation text
- Header notice: "N üründe gerçek Trendyol satış hızı kullanılıyor."
- No schema change — reads existing Phase 26 TrendyolSalesRecord table
- Browser-verified 2026-05-17: 6 üründe gerçek hız, Gerçek Satış Verisi Aktif banner, Hız column, all summary cards and tfoot intact ✓

### ✓ Priority 11 — Procurement Intelligence + Real Sales Velocity (Phase 39, 2026-05-17)

Delivered:
- /admin/procurement: 30-day TrendyolSalesRecord actual sales qty now drives demand calculation when available
- velocitySource per row: "actual" (Trendyol data) / "estimated" (manual) / "none"
- Gerçek/Tahmin/Veri Yok badge column (Hız Kaynağı) + T30G Satış column
- Gerçek Satış Verisi Aktif emerald banner when actual data present
- No schema change — reads existing Phase 26 TrendyolSalesRecord table
- Browser-verified 2026-05-17: 6 üründe gerçek Trendyol hızı, 645 manuel/yok, aciliyet listesi + kolonlar render ✓

### ✓ Priority 10 — Return Rate Analysis (Phase 38, 2026-05-17)

Delivered:
- /marketplace/return-analysis: per-product return rate from TrendyolReturnRecord vs TrendyolSalesRecord
- returnRate = claimCount / soldQty × 100 (null when soldQty = 0 — "Satış kaydı yok")
- Sections: Yüksek İade Riski (≥%5, red border), Düşük İade Oranı (<5%), Satış Verisi Eksik
- Summary KPI cards: Eşleşen İade Talebi, İadesi Olan Ürün, Yüksek İade Riski count, Eşleşmemiş İade Talebi
- Top 10 return reasons table with count + % of all matched returns
- Back-links to Gerçekleşen Marj and İade Merkezi
- "İade Analizi" sidebar nav entry (MARKETPLACE_RETURNS_READ)
- No schema change — reads existing Phase 26 + Phase 29 tables
- Browser-verified 2026-05-17: page renders cleanly, KPI cards visible, İade Analizi sidebar nav active, empty state correct (return records not yet synced to products) ✓

### ✓ Priority 9 — Unmatched Barcodes Inbox on Mapping Page (Phase 37, 2026-05-17)

Delivered:
- /admin/marketplace-mappings: new "Eşleşmemiş Barkodlar" inbox card (above add form)
- Queries TrendyolSalesRecord where productId IS NULL, groups by barcode in memory (no schema change)
- Shows top 30 unmatched barcodes by total revenue; header shows total count (112) + total missing ciro (₺852K)
- Table: platform barcode, Trendyol product name, merchantSku, record count, total revenue
- "Eşleştir →" amber button navigates to ?barcode=XXX&title=YYY#add-form
- URL search params pre-fill MappingForm.defaultBarcode + defaultPlatformTitle props
- Active row highlighted with amber ring when barcode matches current param
- MappingForm updated: defaultBarcode + defaultPlatformTitle optional props (useState init)
- Browser-verified 2026-05-17: 112 barkod, ₺852.073 missing ciro, top 30 table renders ✓

### ✓ Priority 8 — Executive Dashboard Marketplace Revenue Integration (Phase 36, 2026-05-17)

Delivered:
- /admin/executive updated: new "Trendyol / Son 90 Gün — Gerçekleşen Satış Özeti" card
- Fetches 90-day TrendyolSalesRecord (no schema change, existing table)
- isCancelledStatus() filter (iptal/cancel case-insensitive) applied in memory
- KPI tiles: Toplam Ciro (₺506.874), Eşleşen Ürün Çeşidi (14), Eşleşmemiş Kayıt (535)
- Top 5 products by 90-day revenue table (matched records only)
- Empty state when no data — prompts sync from Satış Performansı
- "Gerçekleşen Marj →" link in card header + footer
- Browser-verified 2026-05-17 ✓

### ✓ Priority 7 — Realized Margin Analysis (Phase 35, 2026-05-17)

Delivered:
- /marketplace/realized-margin: compares actual Trendyol order margins vs expected (last 90 days)
- Aggregates TrendyolSalesRecord per product (non-cancelled), avgRealizedPriceTry, total qty + revenue
- calcMarketplacePricingRow() fed actual realized price as manual override → realistic commission/shipping deductions
- realizedMarginPct = (avgRealizedPrice − commission − shipping − paymentFee − returnReserve − unitCost) / avgRealizedPrice × 100
- deltaPct = realizedMarginPct − expectedMarginPct (negative = worse than expected)
- Sections: Zarar Eden / Beklenenden Düşük Marj (delta < −5%) / Kârlı Satışlar / Maliyet Verisi Eksik
- Summary cards: Satılan Ürün Çeşidi, Toplam Ciro (90G), Ort. Gerçekleşen Marj, Beklenenden Kötü count
- Hesaplama Notu footer: formula transparency
- Trendyol platform policy applied; usdTryRate from MonthlyExchangeRate
- EXECUTIVE_READ permission gated; "Gerçekleşen Marj" sidebar link added
- Browser-verified 2026-05-17: ₺117.222,79 ciro, %32.5 avg margin, sections all render ✓

### ✓ Priority 6 — Marketplace Profit Page XML Price Integration (Phase 34, 2026-05-17)

Delivered:
- /marketplace/profit updated to use calcMarketplacePricingRow() per listing
- Per-platform XML price fields: xmlTrendyolPrice/xmlHbPrice/xmlAmazonPrice/xmlPazaramaPrice/xmlIdefixPrice
- Effective price resolution: manual override > XML price > none (consistent with product detail card)
- PriceBadge (Manuel/XML/Veri yok) shown alongside price in winners/losers tables
- PolicyBadge extended to handle "price_tier" shipping source
- usdTryRate fetched from latest MonthlyExchangeRate
- PLATFORM_XML_FIELD map for clean platform → XML field routing
- Browser-verified 2026-05-17 ✓

### ✓ Priority 5 — Marketplace Pricing Normalization (Phase 33, 2026-05-17)

Delivered:
- lib/marketplace-pricing.ts: canonical per-marketplace pricing engine (pure computation, no DB)
- calcMarketplacePricingRow(): resolves effectivePriceTry, shippingTry, commissionTry, paymentFeeTry, returnReserveTry, netRevenueTry, netMarginPct
- calcShippingFromPriceTiers(): roadmap price tiers (<5 USD→1.2, 5–7.5→2.0, >7.5→3.3 USD × usdTryRate)
- Price resolution: manual override (marketplacePriceTry) > XML price > none
- Shipping resolution: product/platform policy override > price-tier default
- priceSourceLabel/priceSourceColor, shippingSourceLabel helpers
- Product detail page: "Pazar Yeri Fiyatlandırması" card — 5 platforms (Trendyol/Hepsiburada/Amazon/Pazarama/Idefix)
- Per-row: XML Fiyat | Etkin Fiyat | Kaynak badge | Kargo ₺ + source badge | Komisyon % + source badge | Net Kalan ₺ (color-coded) | Net Marj %
- Footer: shipping tier reference at current USD/TRY rate
- Fetches MarketplacePlatformPolicy from DB for override resolution
- Browser-verified 2026-05-17: Manuel source badge, Fiyat Dilimi shipping, Sistem Varsayılanı commission, net remaining + margin all render ✓

### ✓ Phase 25: Product Operations UX — DONE (2026-05-17)

Delivered:
- thumbnail column 48×48 with lazy loading and 📦 fallback
- live search debounced 300ms, fires at ≥2 chars, no submit button, case-insensitive on SKU/name/brand/model/barcode
- compact filter pills: Durum (Tümü/Aktif/Pasif) + Stok (Tümü/Stokta var/Düşük stok)
- sort dropdown: son güncellenen, stok ↓↑, fiyat ↓↑, marj ↓, isim A–Z
- health cues per row: Düşük stok, Görsel yok, Maliyet yok, Fiyat yok, XML bayat
- product count shown, "Filtreyi temizle" when filters active
- browser-verified 2026-05-17: 651 ürün, all features confirmed ✓

### ✓ DONE - Phase 26: Product Performance Ranking
Delivered 2026-05-17:
- TrendyolSalesRecord model + migration (orderId/lineId unique, FK to Product SET NULL)
- syncTrendyolSalesAction: 4×90-day windows, barcode/SKU matching, upsert dedup, page-0 error surfacing
- /admin/product-performance: sync card, top-20 tables (30d qty, 30d revenue, all-time revenue), 3 signal cards
- Per-product KPI card on /products/[id]: 4 tiles + color-coded realized margin badge
- Cancelled order filtering (isCancelled helper)
- Browser-verified ✓

### ✓ DONE - Phase 27: Product Media and Content Studio
Delivered 2026-05-17:
- ProductImageManager: multi-image grid, URL-add (Enter clears input), delete, set-primary (sortOrder 0)
- RichTextEditor (Tiptap): H2/H3, Bold, Italic, Bullet/Ordered lists, SSR-safe, HTML output
- XML description governance: XML source card with "Editöre taşı" opt-in button; XML sync never overwrites existing description
- Supabase Storage upload action (REST API, no SDK) — ready when SUPABASE_URL/KEY env vars are added
- Browser-verified: URL add → DB persist → reload confirmed ✓

### ✓ DONE - Phase 29: Order Ledger and Return Claims Sync
Delivered 2026-05-17:
- TrendyolReturnRecord model + migration (claimId+orderLineId unique, nullable productId FK)
- syncTrendyolReturnsAction: 365-day sweep, barcode/SKU product matching, upsert TrendyolReturnRecord
- OrdersSyncButton: combined client component triggering both orders + returns sync in parallel
- /orders page: 5-tab local order ledger — Tümü(1.105)/Teslim(952)/İptal/İadeler/Eşleşmemiş(1.032)
- Newest-first sort, 100-row pages, matched product links, unmatched amber badges
- Unmatched tab: amber hint + link to /admin/marketplace-mappings
- Siparişler sidebar link (EXECUTIVE_READ)
- Browser-verified ✓

### ✓ DONE - Phase 28: Product Governance and Private Intelligence
Delivered 2026-05-17:
- Product.privateNote (TEXT, nullable) — safe additive migration applied to production
- updatePrivateNoteAction: EXECUTIVE_READ + PRODUCTS_UPDATE gated; separate from main form so non-owners cannot overwrite it
- PrivateNoteEditor: amber-accented standalone client component with char counter, save feedback, "🔒 Sadece sahip görebilir" badge
- Product edit page: EXECUTIVE_READ check → canViewPrivate → amber card renders only for owners
- Product detail page: "Tedarikçi Kaynağı" supplier summary card (★ Tercihli, cost/lead/MOQ); "🔒 Özel Not" read-only card gated by EXECUTIVE_READ
- description validation max raised 2000 → 10000 for Tiptap HTML
- normalizeProductData explicitly omits privateNote — XML sync cannot overwrite owner intelligence
- Browser-verified ✓

---

## Blockers

Phase dependencies:

- Marketplace Data Reliability Closure depends on stable Trendyol pagination, durable persistence, and trustworthy order/return identifiers.
- Marketplace Margin Policy Normalization depends on trusted order data plus a clear effective shipping/commission rule.
- Import Economics Normalization depends on a canonical formula, RMB/USD rate support, and shared finance ownership across modules.
- Holding-Grade Import Governance depends on Import Economics Normalization first.
- Marketplace Pricing Normalization depends on both Marketplace Margin Policy Normalization and Import Economics Normalization.
- Phase 25 depends on stable product list/query performance and trusted primary-image behavior.
- Phase 26 depends on a sales snapshot / aggregation layer; product ranking should not fake 30-day revenue logic from incomplete data.
- Phase 27 depends on a safe media/storage strategy and an editor choice that does not break current product forms.
- Phase 28 depends on Phase 5 RBAC foundations plus clear XML field-governance rules.
- Phase 17 remains deferred even if product UX improves; write-side marketplace control still requires separate architecture review.

---

## Role-Based UX Priority Stack (2026-05-17)

Analiz tamamlandı. Aşağıdaki sıra dependency-first execution planına göre sıralanmıştır.

---

### ✓ DONE - Priority 57 — Ürün Formu Rol Görünürlüğü (Phase 57)
Teslim edildi 2026-05-17:
- `showFinancialFields` prop ProductForm'a eklendi (varsayılan true — admin backward-compat)
- EXECUTIVE_READ olmayan kullanıcılar için 4 section render edilmez: "Fiyatlandırma ve kârlılık", "Pazar yeri maliyet geçersiz kılmaları", "Satış potansiyeli", "İthalat kararı girdileri"
- `updateProductAction`: EXECUTIVE_READ kontrolü → `normalizeProductDataNonFinancial()` — finansal field'lar Prisma update'e dahil edilmez
- edit/page.tsx ve new/page.tsx: `checkPermission(EXECUTIVE_READ)` → `showFinancialFields` → ProductForm
- Tamper koruması: sunucu tarafı zorunluluk, UI gizleme ikincil güvence
- Vercel READY: dpl_3ge5Xx4gFjBy6fnUQVAUjMYjCb17, browser-verified 2026-05-17

---

### ✓ DONE — Priority 55 — Warehouse Mode + WAREHOUSE Rolü (Phase 55, 2026-05-17)

Teslim edildi:
- `UserRole` enum'a `WAREHOUSE` eklendi; `prisma db push` production'a uygulandı
- Seed: WAREHOUSE rolü 9 izinle (inventory.read, inventory.write, inventory.count, products.read, categories.read, attributes.read, tasks.read, tasks.update, search.read)
- `lib/actions/inventory-count-actions.ts`: `createInventoryCountAction` — mutlak adet → delta → `StockAdjustmentLog.CORRECTION`; `INVENTORY_COUNT` izni zorunlu
- `/warehouse`: barkod/SKU/ad araması (min 2 karakter), ürün kartları (stok renk kodlu, maliyet YOK)
- `/warehouse/count`: URL params'tan productId/productName/sku, büyük sayı inputu, başarı → 1.8s sonra /warehouse
- `WarehouseWorkspace`: `OperationsDashboardData` yeniden kullanır, Depo badge, stok+görev KPIs, hızlı aksiyon kartları
- `/dashboard` Faz E: `user.role === "WAREHOUSE"` → WarehouseWorkspace
- Sidebar: `/warehouse` (INVENTORY_READ) + `/warehouse/count` (INVENTORY_COUNT)
- Form→save→redirect round-trip verified ✓
- Vercel READY: dpl_FZUREkAgckL52vByKEobiDVMJFc8, browser-verified 2026-05-17

---

### Priority 54 — Rol Bazlı Dashboard (Phase 54)

**Neden:**
/dashboard şu an tüm roller için aynı içeriği gösteriyor. SALES için ithalat kartları anlamsız, WAREHOUSE için sipariş analizi anlamsız.

**Bağımlılık:** Priority 55 (WAREHOUSE rolü var olmalı)

**Mimari karar:** Tek URL `/dashboard` — rol-branch server-side rendering. Ayrı URL yok, redirect flash yok, client-side check yok.

**Kabul kriteri:**
SALES kullanıcısı dashboard'ı açtığında ithalat / sermaye / kâr kartı görmez; kendi pipeline'ını görür.

#### ✓ Faz A — Temel Refactor (schema değişikliği YOK) — DONE 2026-05-17

**Ne yapılacak:**
- `StatCard` ve `LinkedStatCard` inline tanımından → `app/(app)/dashboard/_components/shared/stat-card.tsx` dosyasına taşı
- `AdminWorkspace` wrapper component oluştur: `app/(app)/dashboard/_components/admin-workspace.tsx`
- `page.tsx` rol router'a dönüştür (~40 satır): `currentUser.role` switch → workspace component
- Service katmanı dokunulmaz

**Dosya yapısı:**
```
app/(app)/dashboard/
  page.tsx                          ← rol router, ~40 satır
  _components/
    admin-workspace.tsx             ← mevcut dashboard içeriği
    operations-workspace.tsx        ← (Faz C'de doldurulur)
    sales-workspace.tsx             ← (Faz B'de doldurulur)
    warehouse-workspace.tsx         ← (Faz E'de doldurulur — schema gerekir)
    marketplace-workspace.tsx       ← (Faz F'de doldurulur)
    shared/
      stat-card.tsx
      linked-stat-card.tsx
      task-list.tsx
      stock-alert-banner.tsx
      quick-actions.tsx
```

**Kabul kriteri (Faz A):** `tsc --noEmit` geçer, mevcut admin görünümü değişmez, rol router çalışır. ✓ Vercel READY dpl_J8uZkPdGjr7pspwHGH1UeUxgeKxv, browser-verified 2026-05-17

#### ✓ Faz B — Sales Workspace (schema değişikliği YOK) — DONE 2026-05-17

**Ne yapılacak:**
- `services/dashboard-service.ts` → `getSalesPipelineData(userId)` fonksiyonu ekle
  - Sorgu: aktif ProductInterest sayısı, bugün takip edilecekler (sadece `assignedToId = userId`), son 7 günde açılan müşteriler
  - **HİÇBİR finansal alan döndürme:** trendyolRevenue, cost, margin → yok
- `SalesWorkspace` component: Pipeline özeti, takip listesi, müşteri aktivitesi
- Güvenlik kuralı: getSalesPipelineData() hiçbir zaman maliyet verisi döndürmez — render'da gizlemek yetmez, sorguda olmamalı

**Kabul kriteri (Faz B):** SALES rolü dashboard'ı açtığında: trendyol revenue, ithalat, sermaye kartı DOM'da bulunmaz; kendi pipeline'ı görünür. ✓ Vercel READY dpl_AiLn79jzds4B1oJauke3LuM4jQB9

#### ✓ Faz C — Operations Workspace (schema değişikliği YOK) — DONE 2026-05-17

**Ne yapılacak:**
- `getOperationsDashboardData()` servis fonksiyonu: açık görev sayısı, kritik stok uyarıları, bugün geciken görevler, bekleyen eşleşmemiş siparişler
- `OperationsWorkspace` component: görev özeti, stok uyarıları, ekip görev listesi (atanmış kullanıcıya göre gruplu)
- **Finansal veri yok:** trendyolRevenue, cost → operasyon datasında yer almaz

**Kabul kriteri (Faz C):** OPERATIONS rolü: stok uyarılarını ve açık görevleri görür, maliyet/kâr kartı görmez. ✓ Vercel READY dpl_ESQS1sQTWPXrs4iCPhUeEG7QtpCY

#### ✓ Faz D — Admin Enhancement (schema değişikliği YOK) — DONE 2026-05-17

**Ne yapılacak:**
- Admin workspace'e ek import intelligence sinyalleri ekle (RMB kuru, son ithalat kararı, bekleyen procurement önerileri)
- Ekip performans kartları: SALES pipeline velocity, OPERATIONS görev tamamlama oranı
- Mevcut tiles korunur

**Kabul kriteri (Faz D):** Admin dashboard mevcut içeriğini kaybetmez, ek import/ekip kartları eklenir. ✓ Vercel READY dpl_8Vm7CYfK9aWkN9KA6L9xXusiqbFw

#### ✓ Faz E — Warehouse Workspace — DONE 2026-05-17

`OperationsDashboardData` yeniden kullanıldı (DRY); `WarehouseWorkspace` bileşeni oluşturuldu; `user.role === "WAREHOUSE"` → `WarehouseWorkspace` dalı eklendi. WAREHOUSE rolü: stok uyarıları + görev KPIs + hızlı aksiyon kartları, finansal alan DOM'da yok. ✓ Vercel READY dpl_FZUREkAgckL52vByKEobiDVMJFc8

#### ✓ Faz F — Marketplace Workspace — DONE 2026-05-17

`getMarketplaceDashboardData()` oluşturuldu: aktif listeler (`status=ACTIVE`), eşleşmemiş sipariş uyarısı, son 7 gün iade sayısı, son 7 gün non-cancelled sipariş adedi, açık görev. `MarketplaceWorkspace` bileşeni: "Pazar Yeri" badge başlığı, 5 KPI tile (aktif listeleme, 7d sipariş, eşleşmemiş [warning tone], 7d iade [warning tone], açık görev), 4 hızlı aksiyon kartı (Müşteri Soruları, İade Merkezi, Trendyol Paneli, Ürün Eşleştirme). `user.role === "MARKETPLACE_OPERATOR"` → `MarketplaceWorkspace` dalı eklendi. Finansal alan DOM'da yok. ✓ Vercel READY dpl_6j2QbVahxSmYdVz6FUDwqkWYSHXX

---

### ✓ DONE — Priority 56 — Satış Fırsat Motoru (Phase 56, 2026-05-17)

**Neden:**
Yeni ürün ithalat edildiğinde satış temsilcisi "bunu kime satarım?" sorusunu sisteme soramıyor. Veri modeli hazır (ProductInterest, CategoryInterest, CustomerAttributeInterest) ama sunan UI yok.

**Bağımlılık:** Priority 54 (Sales dashboard), Priority 57 (ürün detay sayfası role-aware)

Tamamlananlar:
- `services/category-service.ts`: `getProductIntelligence()` `interests` select'i `stage`, `status`, `priority`, `lastContactedAt`, `followUpAt`, `assignedTo` ile zenginleştirildi
- `services/dashboard-service.ts`: `getSalesPipelineData()` — `topOpportunities` eklendi (HIGH/URGENT öncelikli, ekip geneli, atanan temsilci dahil)
- `app/(app)/dashboard/_components/sales-workspace.tsx`: `STAGE_LABELS`/`STAGE_COLORS` maps eklendi; aktif fırsatlar listesi — öncelik emoji, aşama badge, son temas tarihi; "Önerilen Fırsatlar" bölümü (top 5 HIGH/URGENT fırsat kartı)
- `app/(app)/products/[id]/page.tsx`: "Doğrudan ilgili" kartları — aşama badge (renkli), öncelik göstergesi (🔴/🟠), son temas tarihi, atanan temsilci adı
- Schema değişikliği: YOK (mevcut ProductInterest alanları kullanıldı)
- tsc --noEmit temiz ✓; READY: dpl_EnxAtoQH3aqnWqWyCXhHRaKaskrA

---

### ✓ DONE — Priority 58 — Operasyon Koordinasyon Katmanı (Phase 58, 2026-05-17)

**Neden:**
`tasks.assign` permission var ama UI yok. Operations koordinatörü ekibine görev atayamıyor, görev durumunu ekip bazında göremez.

**Bağımlılık:** Priority 54 (Operations dashboard), Priority 55 (WAREHOUSE rol mevcut — göreve atanabilir)

Tamamlananlar:
- `lib/validations/customer-crm.ts`: `customerTaskSchema` — `assignedToId?: string` eklendi
- `lib/actions/customer-crm-actions.ts`: `createCustomerTaskAction` — `tasks.assign` permission gate (başkasına atama için); `assignedToId` DB'ye kaydedilir
- `components/customers/customer-task-form.tsx`: `canAssign` ve `users` props eklendi; `canAssign=true` iken aynı satırda "Ata" dropdown gösterir (Atanmamış + aktif kullanıcılar)
- `app/(app)/customers/[id]/page.tsx`: `requirePermission` sonucu `currentUser` alındı; `checkPermission(TASKS_ASSIGN)` ile `canAssign`; `canAssign=true` ise `listUsersWithTasks()` çağrılır
- `services/task-service.ts`: `userId` filtresi `createdById` → `assignedToId` (ekip koordinasyonu için doğru filtre)
- `app/(app)/tasks/page.tsx`: Task kartları `assignedTo.name` gösterir (`→ {name}` format); filtre etiketi "Tüm atananlar"
- `services/dashboard-service.ts`: `getOperationsDashboardData()` — `teamTaskBreakdown` eklendi (açık görevler assignedToId'ye göre gruplanır, open+overdue count per kullanıcı)
- `app/(app)/dashboard/_components/operations-workspace.tsx`: "Ekip Görev Dağılımı" bölümü — her kullanıcı için açık+gecikmiş görev sayısı + `/tasks?userId=` deeplink
- Schema değişikliği: YOK (assignedToId zaten mevcut)
- Round-trip verified: görev oluştur (fatih aydın'a ata) → customer detail'de görünür → /tasks'da `→ fatih aydın` gösterir ✓
- READY: dpl_3A5DU9KfNffMJZEFUa465TdMr4kQ

---

### ✓ DONE — Priority 59 — Trendyol Satış Hızı (Phase 59, 2026-05-17)

**Neden:**
Import Decisions cockpit'te satın alma kararı verirken ürünün Trendyol'daki gerçek satış hızını görmek gerekiyordu. "Talep/ay" alanı sadece manuel girilen potansiyeli yansıtıyordu; gerçek satış geçmişi tabloda yoktu.

**Bağımlılık:** TrendyolSalesRecord (Phase 29), productId ilişkisi (Phase 29 marketplace matching), import-decisions cockpit (Phase 11C)

Tamamlananlar:
- `app/(app)/admin/import-decisions/page.tsx`:
  - 90 günlük pencere (`ninetyDaysAgo`) hesabı eklendi
  - `prisma.trendyolSalesRecord.findMany` — son 90 gün, iptal olmayanlar (`status: { not: "Cancelled" }`), `productId` eşleşenler — mevcut `Promise.all` içinde paralel
  - `velocityByProduct` map: `productId → { qty90d, monthlyVelocity }` (monthlyVelocity = Math.round(qty90d / 3))
  - İptal filtresi ikili: `status: { not: "Cancelled" }` DB-level + "cancel"/"iptal" string içeren status'lar app-level
  - "Trendyol 90g" tablo başlığı eklendi (Gerekli Sermaye — Talep/ay arasına)
  - Eşleşen ürün hücresi: emerald yeşil `{qty90d} adet` + `~{monthlyVelocity}/ay` ikili satır
  - Eşleşmeyen ürün hücresi: `—` slate-300
- Schema değişikliği: YOK
- tsc --noEmit temiz ✓
- Browser-verified: "Trendyol 90g" kolon başlığı görünür, eşleşen ürün için "2 adet / ~1/ay" gösterildi ✓
- READY: dpl_9t2yUijYB6a3946XhXFvbnAsq72y

---

### ✓ DONE — Priority 60 — Trendyol Velocity → Import Decision Input (Phase 60, 2026-05-17)

**Neden:**
Phase 59 Trendyol satış hızını yalnızca display ekledi. Gerçek Trendyol order geçmişi olan ama manual satış tahmini girilmemiş ürünler hâlâ MISSING_DATA gösteriyordu. `calculateImportDecision()` yalnızca manual tahmin alıyordu.

**Bağımlılık:** Phase 59 (velocityByProduct map zaten mevcut), Phase 11C (import engine)

Tamamlananlar:
- `app/(app)/admin/import-decisions/page.tsx`:
  - `manualMonthlyUnits` (online+wholesale+installer sum) ve `trendyolMonthly` (velocityByProduct) ayrıştırıldı
  - `effectiveMonthlyUnits = Math.max(manualMonthlyUnits, trendyolMonthly) || null`
  - `monthlyUnitsSource: "trendyol" | "manual" | "combined" | "none"` kaynağı izler
  - `calculateImportDecision()` artık `effectiveMonthlyUnits` kullanıyor
  - "Talep/ay" hücresi: kaynak badge (emerald=Trendyol / blue=İkisi de / slate=Manuel / "—"=none)
- Schema değişikliği: YOK
- tsc --noEmit temiz ✓
- Browser-verified: Trendyol emerald badge + İkisi de mavi badge görünür; ALWAYS_STOCK + BUY_SMALL kararlar aktif ✓
- READY: dpl_8zd2WpGzqG6QVdrWPhi2mvEqgR3R

---

### ✓ DONE — Bugfix: Maliyet/Kâr Hesaplama Akışı (2026-05-18)

**Neden:**
SKU 2251930284620 için 4 UI sorunu tespit edildi: (1) "Maliyet yok" badge'i RMB maliyet girilmesine rağmen gösteriliyordu, (2) "Fiyat yok" badge'i XML Trendyol fiyatı varken gösteriliyordu, (3) Trendyol kâr analizi hiçbir yerde görünmüyordu, (4) rmbUsdRate DB'de null olduğunda import decision MISSING_DATA dönüyordu.

**Kök nedenler:**
- `getHealthCues()` yalnızca TRY alanlarını (`unitCostTry`, `sellingPriceTry`) kontrol ediyordu; RMB/USD alternatifler ve XML fiyat göz ardı ediliyordu
- `product-service.ts` `xmlData` join yapmıyordu; XML Trendyol fiyatı liste sayfasına akmıyordu
- `[id]/page.tsx` rmbUsdRate null olduğunda 7.0 default kullanmıyordu
- `sellingPriceTry` null olduğunda `xmlTrendyolPrice * usdTryRate` fallback yoktu

Tamamlananlar:
- `services/product-service.ts`: `xmlData: { select: { xmlTrendyolPrice: true } }` join eklendi
- `app/(app)/products/page.tsx`: `getHealthCues()` — "Maliyet yok" koşulu `sourceCostRmb` + `importUnitCostUsd` da kontrol ediyor; "Fiyat yok" koşulu `marketplacePriceTry` + `xmlTrendyolPrice` da kontrol ediyor
- `app/(app)/products/[id]/page.tsx`: rmbUsdRate için `?? 7.0` default; `xmlTrendyolPrice * usdTryRate` sellingPriceTry fallback eklendi; "Trendyol Kâr Analizi" kartı eklendi (8 metrik: RMB alış, ağırlık+kargo, gümrük, toplam maliyet, satış, net kalan, net kâr/marj, ROI — renk kodlu)
- `components/products/product-form.tsx`: TL maliyet bölümü "Manuel fiyatlandırma ve TL maliyet (opsiyonel)" olarak yeniden etiketlendi
- SKU 2251930284620 doğrulanan değerler: Satış ₺383.33 · Net Kalan ₺156.67 · Maliyet ₺109.35 · Net Kâr ₺47.32 · Marj %12.3 · ROI %43.3
- tsc: 0 yeni hata ✓; commit 46da9ee ✓; READY dpl_2gbAExUU9G2ZgUVD799v9rowUqVj, browser-verified 2026-05-18 ✓

---

### ✓ DONE — Priority 70 — Trendyol Rapor Ay Drill-Down (Phase 70, 2026-05-18)

**Neden:**
/admin/trendyol-report 12 aylık özet sunuyordu ama bir aya tıklayıp o ayın en çok satanlarını görmek mümkün değildi.

Tamamlananlar:
- `app/(app)/admin/trendyol-report/page.tsx`: `searchParams` + `selectedMonth`; aylık tablo satırları `?month=YYYY-MM` link; seçili satır koyu highlight; `drillSales` + `drillLabel`; top-10 seçili aya göre; "← Son 30 güne dön" back-link
- tsc clean ✓; commit 34b83e2 ✓; READY dpl_7ZWTqV8XZG43kfxH9M363sX9KtQu, browser-verified 2026-05-18 ✓

---

### ✓ DONE — Priority 69 — Siparişler Sayfası Arama (Phase 69, 2026-05-18)

**Neden:**
/orders sayfasında belirli bir ürünün siparişlerini bulmak için tüm listeye göz atmak gerekiyordu. Arama çubuğu bu problemi çözüyor.

Tamamlananlar:
- `app/(app)/orders/page.tsx`: q param; searchFilter (productName/barcode/merchantSku/orderId OR); tab counts search-aware; returns tab productName filter; salesWhere AND [searchFilter, tabFilter]; tabHref q koruyor; arama formu UI
- tsc clean ✓; commit 6986a2e ✓; READY dpl_7ZWTqV8XZG43kfxH9M363sX9KtQu, browser-verified 2026-05-18 ✓

---

### ✓ DONE — Priority 68 — Ürün XML Stok Değişim Geçmişi (Phase 68, 2026-05-18)

**Neden:**
/admin/xml-sync global stok değişim logunu gösteriyordu ama ürün bazlı bakış yoktu. Ürün detay sayfasına kendi XML geçmişi eklendi.

Tamamlananlar:
- `app/(app)/products/[id]/page.tsx`: xmlStockChangeLogs Promise.all; "XML Stok Değişim Geçmişi" kartı; StockAdjustmentCard öncesi; no schema change; kartı yalnızca kayıt varsa render edilir
- tsc clean ✓; commit 24fb968 ✓; READY dpl_7ZWTqV8XZG43kfxH9M363sX9KtQu, browser-verified 2026-05-18 ✓

---

### ✓ DONE — Priority 67 — Admin Dashboard Trendyol MoM Karşılaştırma (Phase 67, 2026-05-17)

**Neden:**
Admin dashboard'ında Trendyol'un bu ayki ve geçen ayki performansı karşılaştırmalı gösterilmiyordu. Delta arrow'larla "bu ay daha iyi mi?" sorusu tek bakışta yanıtlanabilmeli.

Tamamlananlar:
- `services/dashboard-service.ts`: `getAdminEnhancedData()` — `trendyolThisMonth` + `trendyolLastMonth` paralel sorgular; `cancelledFilter`; `aggregateTrendyol()`; `trendyolMoM` return değeri
- `app/(app)/dashboard/_components/admin-workspace.tsx`: "Trendyol Aylık Karşılaştırma" bölümü — 3 kart (Sipariş / Ciro / Eşleşme %); inline `DeltaBadge` (↑ emerald / ↓ red / → slate)
- Schema değişikliği: YOK
- tsc clean ✓; commit 8ed85e7 ✓; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### ✓ DONE — Priority 66 — Cockpit Stok Kapsamı Kolonu (Phase 66, 2026-05-17)

**Neden:**
Import cockpit stok adedi gösteriyordu ama "bu stok kaç gün yeter?" sorusu cevaplanmıyordu. Kapsama kolonu acil sipariş vermesi gereken ürünleri kırmızıyla hemen belirginleştirir.

Tamamlananlar:
- `app/(app)/admin/import-cockpit/page.tsx`: daysOfCoverage hesabı + Kapsama kolonu; no schema change; no new DB query
- tsc clean ✓; commit 1be7075 ✓; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### ✓ DONE — Priority 65 — Ürün Listesi T30G Satış Hızı (Phase 65, 2026-05-17)

**Neden:**
Admin ürün listesinde hangi ürünün satıldığını görmek için her ürünün detay sayfasına girmek gerekiyordu. T30G kolonu bu sinyali liste ekranında sunarak hızlı tarama sağlar.

Tamamlananlar:
- `app/(app)/products/page.tsx`: parallel fetch TrendyolSalesRecord 30g; velocity30d map; T30G kolonu (emerald/amber/slate/dash); colSpan 7→8; no schema change
- tsc clean ✓; commit bbb39b1 ✓; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### ✓ DONE — Priority 64 — Trendyol Aylık Satış Trendi Kartı (Phase 64, 2026-05-17)

**Neden:**
Ürün detay sayfası 4 KPI tile (Son 30G Satış/Ciro, Toplam Satış, Gerçekleşen Marj) gösteriyordu ama aylık trend yoktu. Hangi ürünün büyüyüp büyümediği tek bakışta anlaşılmıyordu.

Tamamlananlar:
- `app/(app)/products/[id]/page.tsx`: 6 aylık JS-side aggregation; trend badge (↑/↓/→); Ay/Adet(delta)/Ciro/Ort.Fiyat tablosu; totals footer; no schema change
- tsc --noEmit temiz ✓; commit 7fdc124 ✓; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### ✓ DONE — Priority 63 — Trendyol Aylık Satış Raporu (Phase 63, 2026-05-17)

**Neden:**
Yönetim takımı Trendyol satış performansını aylık granülaritede izleyemiyordu. Sipariş + iade verileri vardı ama yönetici ekrana özetleyen bir rapor sayfası yoktu.

**Bağımlılık:** Phase 29 (TrendyolSalesRecord + TrendyolReturnRecord), Phase 63 için schema değişikliği yok

Tamamlananlar:
- `app/(app)/admin/trendyol-report/page.tsx` (YENİ): EXECUTIVE_READ gated; parallel fetch son 12 ay; JS-side monthly aggregation; 12-ay aylık tablo (İade Oranı + Eşleşme % renk kodlu); totals footer; 6 KPI kartı (son 30 gün); top-10 eşleşmiş ürün tablosu; boş durum fallback
- `app/(app)/layout.tsx`: "Trendyol Raporu" sidebar linki eklendi (İthalat & Analiz, EXECUTIVE_READ)
- Schema değişikliği: YOK
- tsc --noEmit temiz ✓
- Browser-verified: KPI kartlar (659 sipariş, ₺612.218 brüt ciro), 3-aylık tablo, top-10 ürünler ✓
- READY: dpl_5DHWKsJJ6L5N61Ti8iNZopndpriH

---

### ✓ DONE — Priority 62 — TrendyolReturnRecord Normalized Re-Match (Phase 62, 2026-05-17)

**Neden:**
Phase 61 normalizeKey() mantığını yalnızca TrendyolSalesRecord'a uyguladı. TrendyolReturnRecord da aynı null-productId sorununa sahipti; iade kayıtları kâr analizine ve eşleşme istatistiklerine dahil edilemiyordu.

Tamamlananlar:
- `lib/actions/marketplace-mapping-actions.ts`: `resolveMatch()` DRY yardımcısı; `trendyolReturnRecord.findMany({ where: { productId: null } })` paralel çekildi; iade kayıtları normalize eşleştirmeden geçirildi; 100'lük batch bulk-update; başarı mesajı X sipariş + Y iade rapor eder
- Schema değişikliği: YOK; Yeni UI: YOK
- tsc --noEmit temiz ✓
- Browser-verified: sayfa yükleniyor, buton görünür ✓
- READY: dpl_FF8MmKYk3BhQMgqaAnhbioSCYgc8

---

### ✓ DONE — Priority 61 — Normalized Barcode Re-Match (Phase 61, 2026-05-17)

**Neden:**
Trendyol barkod formatı (tire, boşluk, büyük harf) ile iç ürün barkodları arasındaki format uyuşmazlığı yüzünden 131 barkod / ₺936k ciro eşleşmeden kalıyordu. Tam string karşılaştırması başarısız olduğunda normalize edilmiş fallback gerekiyordu.

**Bağımlılık:** Phase 29 (TrendyolSalesRecord + productId), Phase 41 (backfill engine), Phase 16 (MarketplaceProductMapping)

Tamamlananlar:
- `app/api/cron/trendyol-sync/route.ts`: `normalizeKey()` helper, `resolveProductId()` helper (exact then normalized fallback), `normalizedBarcodeMap` + `normalizedSkuMap`; `syncOrders()` ve `syncReturns()` yeni map'leri kullanır
- `lib/actions/marketplace-mapping-actions.ts`: `rematchNormalizedBarcodesAction()` — tüm null-productId TrendyolSalesRecord satırlarını tarar, normalize match, 100'lük batch bulk-update
- `components/marketplace/rematch-normalized-button.tsx`: Yeni client component — "Barkodları Normalize Et & Eşleştir" butonu
- `app/(app)/admin/marketplace-mappings/page.tsx`: `RematchNormalizedButton` header'a eklendi
- Schema değişikliği: YOK
- tsc --noEmit temiz ✓
- Browser-verified: "Barkodları Normalize Et & Eşleştir" butonu görünür, unmatched inbox 131 barkod / ₺936.283 gösteriyor ✓
- READY: dpl_FM1WF6drTKPn96N8kupT8Gr6tmVU

---

### ✓ Phase 79 — İthalatçı Görünümü (2026-05-18)

**Neden:** Admin, ürün listesinden tek bakışta "hangi ürünü ne kadar alayım?" sorusunu yanıtlayamıyordu. Tüm ithalat ekonomisi (RMB maliyet → kargo → gümrük → Trendyol komisyon → kâr → ROI → stok günleri) ayrı sayfalarda dağınık hesaplanıyordu.

Tamamlananlar:
- `lib/importer-cost.ts`: Saf hesaplama kütüphanesi. Tüm ithalat ekonomisi formülleri tek yerden. AIR/SEA karar mantığı, marj, ROI, sağlık skoru, bütçe dağılımı
- `app/api/products/importer-view/route.ts`: ADMIN-only endpoint. T30G velocity, exchange rate, cost/profit tümü server-side hesaplanıp `ImporterProduct[]` döner
- `components/products/importer-view-client.tsx`: Fetch + useMemo bütçe dağılımı. 6 özet kart, parametreler paneli, filtre+sort, 16-sütun tablo
- `app/(app)/products/page.tsx`: `?view=importer` param, admin-only toggle, koşullu render
- Prisma generate: `marketplacePrices` ProductInclude'a eklendi (Phase 71'den beri stale client)
- Schema değişikliği: YOK
- tsc 0 hata ✓, commit 59433f9 ✓, READY dpl_AHpCzDDTJL5kEJr9tN1y5oSBbbu1 ✓, browser-verified 2026-05-18 ✓

---

### ✓ Phase 78 — Toplu İthalat Verisi Girişi — XLSX (2026-05-18)

**Neden:** Ürün başına RMB maliyet, ağırlık, gümrük oranı alanlarını tek tek doldurmak yerine Excel şablonu indir-doldur-yükle akışı daha hızlı. CSV'nin Türkçe karakter bozulma sorunu SheetJS xlsx formatına geçişle çözüldü.

Tamamlananlar:
- `app/api/products/bulk-export/route.ts`: SheetJS `.xlsx` üretimi, koyu mavi başlık, sarı eksik hücre vurgusu
- `app/api/products/bulk-import/route.ts`: SheetJS ile `.xlsx`/`.csv` parse, toplu Prisma update, boş=koru
- `components/products/product-bulk-buttons.tsx`: Ürünler listesi header'ında inline indir/yükle butonları
- `xlsx@^0.18.5` eklendi, `docs/CODEX_INSTRUCTIONS.md` stok mimarisi güncellendi
- tsc clean ✓, commit eeb240f ✓, READY dpl_6Qh1AEHrAKf6GQpm5QumWdNgK6NA ✓

---

### Priority 80 — Canonical Import Opportunity Score Tasarımı (Docs + Engine Spec)

Neden:
Mevcut sistemde tek bir "ürün skoru" yok. `investmentScore`, `import decision score`,
`healthScore` ve `import-cockpit` sinyali farklı amaçlara hizmet ediyor. Bu yapı
"sermayeyi en hızlı büyütecek ithalat ürünleri" için tek ve güvenilir bir sıralama
üretmiyor.

Kritik tespit:
- `investmentScore` mevcut stoktaki kilitli sermayeye göre hesaplanıyor; yeni bağlanacak sermayeyi ölçmüyor
- `import decision score` birim ekonomi ağırlıklı; throughput / hacim etkisini zayıf yansıtıyor
- `healthScore` veri tamlığı ile ithalat önceliğini karıştırıyor
- farklı ekranlar farklı talep ve maliyet varsayımlarıyla çalışıyor

Amaç:
Yeni tekil owner metriğini tanımlamak:
- adı: `ImportOpportunityScore`
- amacı: "Bugün bu ürüne 1 TL daha bağlarsam, ne kadar sürede, ne kadar güvenle geri döner?"

Tanımlanacak alt metrikler:
- incrementalCapitalTry veya Usd
- paybackDays
- expectedNetProfit90d
- expectedCapitalTurn90d
- demandConfidenceScore
- stockPenalty
- returnPenalty
- leadTimePenalty
- dataCoverageFlag

Ne yapılacak:
- `docs/import-economics-model.md` içine canonical skor spesifikasyonu eklenecek
- mevcut 4 ayrı skorun kullanım amacı dokümante edilecek
- "operational health" ile "capital growth priority" kesin olarak ayrılacak
- score bileşenleri için ağırlık tablosu yazılacak
- hard threshold yerine band yapısı tanımlanacak:
  - `CORE_IMPORT`
  - `TEST_IMPORT`
  - `WATCHLIST`
  - `DO_NOT_IMPORT`
- score açıklaması ürün detayında okunabilir olacak şekilde planlanacak

Schema change:
- NONE

Bağımlılık:
- yok, docs-first faz

Risk:
- faz atlanırsa sonraki teknik implementasyonlar yine farklı ekranlarda farklı skorlara bağlanır

Exit:
- canonical skor formülü ve bileşenleri docs'ta yazılı
- hangi ekran hangi skoru kullanır / kullanmaz net tanımlı
- sonraki fazlar için teknik implementasyon sözleşmesi hazır

---

### Priority 81 — Talep Normalizasyonu ve Güven Skoru

Neden:
Gerçek Trendyol verisi ile manuel kanal tahminleri bugün aynı mantıkla
kullanılmıyor. Bazı yerlerde `actual online override`, bazı yerlerde
`max(manual total, trendyol monthly)` var. Bu, aynı ürünün farklı ekranlarda
farklı öncelik almasına yol açıyor.

Amaç:
Tek bir `effectiveDemand` çözümleyicisi üretmek.

Ne yapılacak:
- Yeni saf helper: `resolveEffectiveDemand()`
- Kanal bazlı çözüm:
  - online demand: Trendyol 30g gerçekleşen veri varsa önce onu kullan
  - wholesale demand: manuel tahmin
  - installer demand: manuel tahmin
- `demandSource` alanı üret:
  - `actual_online_plus_manual_b2b`
  - `manual_only`
  - `actual_only`
  - `none`
- `demandConfidenceScore` üret:
  - matched order count
  - kaç günlük veri olduğu
  - return rate volatility
  - manual-only ürün cezası
- sadece `max()` yaklaşımını kaldır; kanal karışmasını önle

Dokunulacak yerler:
- `lib/sales-potential.ts`
- `lib/import-decision.ts` çağıran sayfalar
- `/admin/capital`
- `/admin/procurement`
- `/admin/import-decisions`
- `/admin/import-cockpit`

Schema change:
- NONE

Bağımlılık:
- Phase 80 canonical score spec

Risk:
- yanlış demand merge mantığı devam ederse yüksek görünen ama gerçekte yavaş ürünler
  sermaye listesinde yukarı çıkabilir

Exit:
- tüm ekranlar tek demand çözümleyicisini kullanır
- veri kaynağı badge'leri aynı semantik ile çalışır
- aynı ürün aynı veri altında ekranlar arasında çelişkili talep sonucu vermez

---

### Priority 82 — Canonical Landed Cost Engine Birleştirmesi

Neden:
Capital ekranı, import decision engine ve importer view farklı maliyet varsayımları
kullanabiliyor. Bu, aynı üründe farklı kârlılık ve sıralama üretir.

Amaç:
Tek landed-cost motoru altında tüm ithalat kararlarını toplamak.

Ne yapılacak:
- `lib/importer-cost.ts` ve `lib/import-decision.ts` rollerini netleştir
- tek canonical helper seti oluştur:
  - source RMB/USD resolve
  - freight resolve
  - customs apply
  - net revenue resolve
  - unit profit
  - annualized ROI / payback
- `capital` ekranındaki local `computeLandedCost()` kaldırılacak
- supplier freight override, product override, global default sırası standartlaştırılacak
- cost output shape ekranlar arasında ortaklaştırılacak

Karar:
- tek maliyet motoru dışında local "quick formula" kalmamalı

Schema change:
- muhtemelen NONE

Bağımlılık:
- Phase 31
- Phase 32
- Phase 80

Risk:
- unified engine yapılmazsa owner aynı ürünü iki ekranda iki farklı gerçeklikle görür

Exit:
- capital / procurement / import-decisions / importer-view aynı landed-cost truth ile çalışır
- local ad-hoc cost hesapları temizlenmiş olur

---

### Priority 83 — Incremental Capital Ranking Engine

Neden:
Mevcut `investmentScore` stokta kilitli sermayeye bakıyor. İthalat kararında ise
esas soru mevcut stok değil, yeni siparişe bağlanacak sermayenin geri dönüşüdür.

Amaç:
Stok-bazlı skor yerine sipariş-bazlı sermaye verimi motoru üretmek.

Yeni sıralama metrikleri:
- `incrementalCapitalRequired`
- `expectedGrossProfitPerCycle`
- `expectedNetProfit90d`
- `paybackDays`
- `capitalVelocity`
- `coveragePenalty`
- `confidenceAdjustedScore`

Ne yapılacak:
- yeni engine: `calculateImportOpportunity()` veya benzeri
- MOQ ve min order logic ekle
- lead time boyunca tüketilecek stok dikkate alınsın
- target coverage gün bazlı olsun
- outlier guard eklensin:
  - çok düşük hacim ama aşırı yüksek marj
  - tek siparişlik yanıltıcı velocity
  - yüksek iade oranılı ürünler
- `investmentScore` procurement için ikincil yardımcı metrik olarak kalabilir ama
  capital ranking primary metric olmamalı

Kullanım hedefleri:
- `/admin/capital` primary sort
- `/admin/import-decisions` secondary recommendation explainability
- importer view budget allocation

Schema change:
- NONE ile başlanabilir
- ileride snapshot için ek alan gerekebilir

Bağımlılık:
- Phase 80
- Phase 81
- Phase 82

Exit:
- capital önerileri artık mevcut stok ROI yerine yeni sipariş ROI/payback mantığıyla sıralanır
- owner top listede "sermaye büyüten" ürünleri görür

---

### Priority 84 — Karar Yönetişimi, Snapshot v2 ve Ekran Birleştirmesi

Neden:
Bugün aynı ürün için birden fazla karar yüzeyi var:
- `/admin/capital`
- `/admin/procurement`
- `/admin/import-decisions`
- `/admin/import-cockpit`
- importer view

Bu yüzeyler birbirini desteklemeli, çelişmemeli.

Amaç:
Yeni canonical skoru karar katmanına güvenli biçimde bağlamak.

Ne yapılacak:
- ekran rol ayrımı netleştir:
  - procurement: stok aciliyeti
  - import-decisions: ithalat yöntemi + birim ekonomi
  - import-cockpit: gerçekleşen pazar performansı
  - capital: sermaye tahsis sıralaması
  - importer view: operasyonel çalışma masası
- `ImportDecisionSnapshot` v2 planı hazırlanacak:
  - hangi talep kaynağı kullanıldı
  - confidence score
  - realized price source
  - return rate snapshot
  - lead time / MOQ snapshot
- explainability alanları UI'da gösterilecek:
  - neden bu skor çıktı
  - hangi veri eksik
  - hangi ceza/bonus uygulandı

Schema change:
- muhtemelen YES, fakat önce migration planı yazılmalı

Bağımlılık:
- Phase 80-83

Risk:
- governance olmadan canonical score bile zaman içinde drift eder ve güven kaybı yaşanır

Exit:
- her ekranın tek görevi net
- yeni skor explainable
- snapshot geçmişi karar audit'ine yeterli

---

### Priority 85 — Owner Import War Room ve Erişim Ayrıştırması

Neden:
Bugün ithalatla ilgili owner-intelligence birden fazla yüzeye dağılmış durumda:
- `/admin/import-cockpit`
- `/admin/import-decisions`
- `/admin/capital`
- `/admin/procurement`
- `/admin/suppliers`
- importer view

Bu ekranlar tek tek faydalı ama patron gözüyle ana soru hâlâ dağınık:
"Kısıtlı paramı hangi ürünlere bağlarsam en hızlı büyürüm, hangilerinden uzak dururum?"

Ayrıca ithalat zekâsı ve finansal alanlar sadece görünmez değil, yapısal olarak
owner-private olmalı. Bu bilgi ekip operasyonundan ayrılmalı.

Amaç:
- tek bir owner çalışma yüzeyi tanımlamak: `Import War Room`
- ithalat kararını operasyon ekranlarından ayırmak
- claude için "hangi ekran ne iş yapar" görev tanımını netleştirmek

Ne yapılacak:
- owner-facing ana karar yüzeyi tanımlanacak:
  - Top imports to fund
  - Capital traps
  - High-risk imports
  - Test-import candidates
  - Supplier concentration risk
- mevcut ekran rollerini yeniden çerçevele:
  - `import-cockpit`: pazar gerçekliği / gerçekleşen satış
  - `import-decisions`: ithalat yöntemi / landed cost / unit economics
  - `capital`: bütçe tahsisi
  - `procurement`: stok aciliyeti
  - `suppliers`: tedarikçi ve ticari şartlar
  - `war room`: nihai owner sıralaması ve sermaye kararı
- owner ekranı dışında hiçbir yüzey "nihai ürün seçimi" iddiası taşımamalı

Schema change:
- NONE for planning

Bağımlılık:
- Phase 80-84

Risk:
- bu ayrım yapılmazsa kullanıcılar farklı ekranlardan farklı "doğru ürün" listeleri alır

Exit:
- owner için tek karar yüzeyi tanımlı
- her import ekranının görev sınırı dokümante
- claude paralel çalışırken hangi ekranın neyi optimize ettiği net

---

### Priority 86 — Import Secrecy Split: executive.read Parçalama

Neden:
`executive.read` şu an çok geniş. Aynı izin altında:
- ithalat zekâsı
- kârlılık
- sermaye dağılımı
- tedarikçi ticari şartları
- XML yönetimi
- yönetici paneli
toplanmış durumda.

İthalatçı patron açısından bu doğru değil.
Çünkü:
- satış ekibi ithalat stratejisini görmemeli
- warehouse ithalat maliyetini görmemeli
- operations tedarikçi marjını görmemeli
- marketplace operator landed cost ve ROI görmemeli

Amaç:
Tek broad permission yerine owner-private alanları ayırmak.

Önerilen yeni izin aileleri:
- `import.read`
- `import.manage`
- `capital.read`
- `capital.approve`
- `suppliers.read`
- `suppliers.manageCommercialTerms`
- `productFinance.read`
- `productFinance.write`
- `executive.kpiRead`
- `xml.manage`

Kurallar:
- `import.read` sadece owner/admin default
- `capital.read` sadece owner/admin default
- `suppliers.manageCommercialTerms` sadece owner/admin
- `productFinance.read` non-admin'e varsayılan verilmez
- `executive.kpiRead` ithalat sırrı içermeyen üst seviye dashboard için ayrı tutulabilir

Schema change:
- permission seed / route rewiring gerektirir

Bağımlılık:
- Phase 85 yönetsel çerçeve

Risk:
- parçalanmazsa rol sistemi görünürde var olur ama stratejik veriler hâlâ gereğinden geniş kalır

Exit:
- `executive.read` tek mega-permission olmaktan çıkar
- ithalat sırları owner/admin dışına default olarak sızmaz

---

### Priority 87 — Financial / Import Surface Audit (Zero-Leak Review)

Neden:
Kural şu olmalı:
non-admin kullanıcılar ithalatı "görmemeli", sadece "etkisini" görmeli.

Bu yalnızca route koruması değil:
- form alanları
- API cevapları
- dashboard kartları
- deeplink'ler
- tablo kolonları
- export/import dosyaları
seviyesinde de geçerli olmalı.

Amaç:
İthalat ve finans zekâsının rol bazlı sızıntı denetimini yapmak.

Denetlenecek yüzeyler:
- `/products`
- `/products/[id]`
- `/products/[id]/edit`
- `/dashboard`
- `/admin/*`
- `/api/products/importer-view`
- bulk export/import route'ları
- quote ve order ekranlarında dolaylı marj sinyalleri

Kontrol listesi:
- non-admin DOM'da landed cost yok
- non-admin DOM'da ROI yok
- non-admin response payload'da sourceCostRmb yok
- non-admin response payload'da supplier cost yok
- non-admin ürün formunda ithalat alanları render edilmiyor
- non-admin dashboard'da ithalat çağrışımı yapan kart yok
- warehouse ve operations için fiyat/maliyet ayrımı net

Schema change:
- NONE

Bağımlılık:
- Phase 86

Exit:
- sıfır-sızıntı checklist'i yazılmış ve route bazlı uygulanacak görev listesi oluşmuş

---

### Priority 88 — Claude Execution Pack: Patron Gözünden Görev Dağılımı

Neden:
Claude teknik işi yapıyor ama işi hangi ticari hedef için yaptığını sürekli aynı
netlikte görmeli:
- sınırlı sermaye
- hızlı nakit dönüşü
- yanlış üründe sermaye kilitlenmesin
- ithalat sırrı ekip ekranlarına sızmasın

Amaç:
Claude için md tabanlı net görev çerçevesi oluşturmak.

Hazırlanacak çalışma notları:
- owner objective
- hard secrecy rules
- role exposure rules
- score engine priorities
- anti-goals
- acceptance criteria

Hard rules:
- en iyi ürünü seçtiren ekran owner-only olacak
- non-admin import intelligence göremez
- UI kolaylığı gizlilik kuralının önüne geçemez
- gerçek satış > tahmin
- nakit dönüş hızı > sadece yüksek marj
- tek supplier bağımlılığı bir risk olarak izlenir

Exit:
- claude'nin geliştireceği her ilgili faz bu ticari çerçeveye bağlanmış olur

---

## Anti-Scope Rules

DO NOT start:
- marketplace write sync
- ERP complexity
- public auth
- SaaS multi-tenant ideas
- capital automation without admin approval
- profitability features before cost structure is trustworthy
- procurement intelligence before inventory and profitability foundations are ready
- revenue-based product ranking before sales snapshots are trustworthy
- rich media workflow without a clear storage/delete strategy
- XML overwriting curated product content after the owner has edited it manually
- pretending live API windows are a complete historical order source
- trusting weak barcode/SKU guesses when an explicit marketplace mapping should exist
- treating marketplace margin as trustworthy before the effective shipping/commission policy is normalized

---

## Working Rule

When execution priority changes:
- update `PROGRESS.md` if reality changed
- update `ROADMAP.md` if target architecture changed
- update `NEXT-STEPS.md` if immediate build order changed
