# AI CFO V1 — production hazırlık incelemesi

Tarih: 03.10.2026. İncelenen uygulama commit'i: `896154a`.
Kullanıcı talebi: son 120 gün komisyon penceresini koru; eksik yoksa migration/deploy yap.
**Sonuç: eksikler var; production migration, main merge ve deploy yapılmadı.**

## Doğrulanmış işler

- İşletme sahibi kampanya değişimleri nedeniyle 120 günlük komisyon penceresini seçti. V3 hesap zaten 120 günü kullanır; uygulama hesap kodu veya altın referanslar bu kararla değiştirilmedi.
- [CI](https://github.com/Alfasoylu/iotomasyon/actions/runs/37145368401): build, typecheck, Prisma validate, 39 CFO, 6 erişim, 5 RLS, 2 profil, 22 RBAC, Entegra regression ve hedefli lint başarılı.
- Vercel commit status'u başarılı önizleme bildirir: [deployment kaydı](https://vercel.com/alfasoylus-projects/iotomasyon/GckG94vTTN6sKZyRtjzHc1Hxh7dG). Bu main/production deploy değildir; veri migration'ı uyguladığı sonucuna varılamaz.
- Reader'ın TLS, read-only rol/transaction, SELECT izinleri ve Product görünürlüğü doğrulandı. Bu hesap migration/yazma hesabı değildir.
- [Additive migration](../prisma/migrations/20261003000000_ai_cfo_v1/migration.sql) yalnız üç yeni tablo, indeksler, CHECK/unique/RESTRICT FK ve deny-all RLS içerir. DROP/TRUNCATE/backfill veya mevcut CFO tablo/view/fonksiyon değişikliği yoktur. PostgreSQL sentetik migration testi geçti; production uygulanması doğrulanmadı.
- Kaynak patch/bundle ve aggregate karşılaştırma [özel Drive yedeğinde](https://drive.google.com/file/d/1bFH0mNkNA679Qw6wTvoVla6f0J6VN6Ej/view?usp=drivesdk) saklandı. Bu kaynak yedeği production veritabanı yedeğinin yerine geçmez.

## Finansal kabul: henüz 12/12 değil

Salt okunur rapor `asOf=2026-10-03T18:47:10.546Z`, `current_comparison`, `productionApproval=false`: **8/12**. Bu sonuç tarihli kabul onayı değildir.

| Kontrol | Güncel ölçüm | 03.10 sabit referans | Durum |
| --- | --- | --- | --- |
| MD-3003B1 XML adet30 | 221 | 222 | Zamanı aynı native view/ledger ile uzlaştırılmalı |
| MD ihtiyatlı günlük hız | 5,30 | 5,33 | Mevcut XML motoru değiştirilmedi; referans zamanı doğrulanmalı |
| MD Trendyol komisyon/kayıt | Son120gün %10,4710 / 37 | Tüm geçmiş %12,8758 / 43 | 120 gün kararı tamam; farklı dönemler aynı kabul örneği sayılmaz |
| ANUNNAKI örtü/stok | 124 gün / 169 | 124 gün / 170 | Örtü eşit, stok koşulu farklı; aynı zamanlı referans gerekir |

Eşleşen sekiz kontrol: ticari nakit, genel KMH, amaca bağlı limitin ayrılması, 6 aktif kart borcu, 47 kukla SKU, 1086 sıfır stok, MD Entegra 81 adet ve Koçtaş contribution null.
Güncel çıktılar referansa otomatik kopyalanmaz; geçmiş mutable stok/bakiye bugünkü veriyle yeniden üretilemez. Aynı dönem ve zamanda bağımsız ledger referansı veya arşivli referans snapshot ile yeniden kabul çalıştırılmalıdır.

## Kaynak ve deployment eksikleri

1. **Kargo:** agent min_try/max_try/kargo_try bekler; canlı kaynak alt_sinir/ust_sinir/tarife/ek_maliyet/toplam ve pazaryeri/tarih kolonları taşır. Doğru ücretin kapsamı, kanal ve geçerlilik tarihi doğrulanmadan kör kolon alias'ı yapılmaz. Fiyat tabanı bu haliyle bilinmeyendir.
2. **SET bileşenleri:** agent set_sku/maliyet_try bekler; canlı kaynak grup/model/kanal/kapasite ve maliyet_try_kdv_dahil taşır. Bileşen→set ilişkisinin doğrulanmış sözleşmesi eksik; model doğrudan set_sku varsayılmaz. Eksik değer null/dataQuality kalır.
3. **Nakit projeksiyonu:** fonksiyon result_type pozisyon içerir, ancak net nakit semantiği, kullanılmamış/amaca bağlı limitlerin davranışı ve AI_CFO_PROJECTION_POSITION_COLUMN doğrulanmadı. Sırf kolon adına bakarak genel limit nakit sayılmaz. Bazı aktif bankaların güncellemeleri 7 günden eski; nakit alarmı bu durumda engellenir.
4. **Finansal veri:** Entegra'nın son siparişi 23 Eylül; Hepsiburada API watermark'ı boş. Reklam/iade/VAT ve değişken maliyet kapsamı eksik. Son raporda cost coverage yaklaşık %66,94; 90 ürün maliyeti eksik. Contribution bilinmeyen kalır; sıfıra çevrilmez. Eksik gerçek maliyetler SQL'e uydurularak eklenmez.
5. **Production configuration:** diagnostik kaynak profili yalnız read-only kabul komutuna inject edilir; Vercel production env doğrulandığı anlamına gelmez. Canonical validation, source bindings, session-mode lock bağlantısı ve scheduler production'da doğrulanmadı.
6. **Migration yetkisi ve geçmiş:** erişilebilir secret yalnız AI_CFO_READ_DATABASE_URL reader hesabıdır. Migration uygulayacak DIRECT_URL yönetim bağlantısı bu çalışma ortamında bağlı değildir. Live _prisma_migrations geçmişi/pending listesi ve yeni tablo varlığı doğrulanmadan toplu migrate deploy çalıştırılmaz. Mevcut bekleyen migration'lar da uygulanabileceği için yalnız dosyanın additive olması yeterli değildir.
7. **DB backup/staging:** [MIGRATION-SAFETY.md](MIGRATION-SAFETY.md) gereği staging branch uygulaması, migration incelemesi ve production PITR/manual snapshot kanıtı gerekir; bunlar doğrulanmadı. Github/Drive kod yedeği DB rollback noktası değildir.

## Koşullar tamamlanınca uygulanacak sıra

1. Kaynak grain/semantik eşlemeleri ve aynı dönemli kabul kanıtı tamamlanır; 12/12 sonucu özel arşive alınır.
2. Supabase production backup ve staging migration kanıtı doğrulanır. Yetkili bağlantı güvenli environment üzerinden bağlanır; URI/parola sohbet, dosya veya log'a yazılmaz. Reader rolüne DDL/yazma verilmez.
3. Yetkili environment'ta Prisma migration status/pending liste incelenir. Yalnız beklenen migration'lar doğrulandıktan sonra normal migrate deploy süreci kullanılır; db push/reset/force uygulanmaz. Üç yeni tablonun RLS ve server-role erişimi doğrulanır.
4. Doğrulanmış configuration ile main/deploy ve `/admin/ai-cfo` RBAC smoke check yapılır. İlk canlı aşama deterministic monitor açık, AI/provider kapalıdır. Session mode 5432, mevcut authorizeCron ve Supabase pg_cron/pg_net/Vault kullanılır; morning ≥09:30 İstanbul.
5. Yedi tam gün gölge çalışma ve CFO yanlış alarm incelemesi yapılır. Günde ≤3 yanlış alarm ve sıfır AI çağrısı kanıtı gerekir; kapılar kendiliğinden açılmaz.
6. Yalnız ardından güncel billing/fiyat/kur, 6 çağrı/gün ve 3.000 TL/ay tavanıyla AI açılabilir.

Sorun durumunda ilk geri dönüş AI/monitor'ü kapatıp uygulama sürümünü geri almaktır; yeni audit tabloları/veriler korunur. Production DROP/delete rollback bu talebin parçası değildir.
