# ANON TABLE GRANTS & EXECUTABLE FUNCTIONS — AUDIT

> **DURUM 2026-10-06:** denetimdeki açıklar kapatıldı (migration `20261006120000_security_defense_in_depth`). Aşağısı denetim anının tarihsel kaydıdır.

Tarih: 2026-10-06 · Üretim: Supabase `frbxpodiostxuwlrubkt` · Yöntem: katalog SELECT'leri + repo taraması. Üretime yazma yok.

## 1. Özet
| Ölçüm | Değer |
|---|---|
| public tablo sayısı | 143 |
| **RLS kapalı public tablo** | **0** |
| anon/authenticated/public rolüne uygulanan policy | **0** (tüm policy'ler yalnız `cfo_acceptance_reader` rolüne) |
| anon'da SELECT (ve yazma) grant'i olan tablo | 56 (hepsi RLS açık) |
| …bunlardan sıfır policy'li (RLS = tam ret) | 15 |
| …bunlardan yalnız `cfo_acceptance_reader_select` policy'li | 41 |
| anon/authenticated SELECT'i olan view | 0 |
| anon çalıştırabilir fonksiyon (public, kendi) | 20 (+ 2 `fm_*` salt-okunur; pgvector eklenti fonksiyonları ayrı) |
| Repo'da anon key / supabase-js / `/rest/v1` / `.rpc(` kullanımı | **0** (tek eşleşme: lockdown migration yorumu) |

Sonuç: grant'ler **tek başına** erişim vermez; erişimi engelleyen tek katman RLS'tir (grant → RLS ret). "RLS var diye güvenli" kabul edilmedi: aşağıda RLS'in tek savunma olduğu yerler risk olarak listelenir.

## 2. Tablolar (56) — sınıflandırma
Uygulama (Prisma, `postgres` rolü, RLS'yi aşar) hiçbirinde anon/authenticated'a **ihtiyaç duymaz**; repoda Data API kullanımı yok → **hiçbiri anon/authenticated Data API için gerekli değil**.

| Sınıf | Tablolar | Risk |
|---|---|---|
| A. Mali/CFO (41, policy: yalnız reader SELECT) | `cfo_banka_hareket`, `cfo_bank_account`, `cfo_cash_event`, `cfo_credit_card`, `cfo_loan`, `cfo_receivable`, `cfo_kart_taksit`, `cfo_statement_import`, `cfo_import_cost/project`, `cfo_order_batch/line`, `cfo_kur`, `cfo_settings`, `cfo_snapshot`, `cfo_question(_file)`, `cfo_note`, `cfo_set_*`, `cfo_kanal_*`, `cfo_kargo_tarife`, `cfo_hamle*`, `cfo_urun_karar`, `cfo_yoldaki_*`, `cfo_stok_istisna`, `cfo_fba_aday`, `cfo_ay_kazanan`, `cfo_change_log(_area_yedek)`, `cfo_pay_obs`, `cfo_kilometre_tasi`, `trendyol_*` (4), `EntegraImportLog` | **Orta-yüksek**: yalnız RLS koruyor; biri RLS'yi kapatır veya `TO public USING(true)` policy eklerse anında anonim tam okuma+YAZMA (grant'ler DELETE/TRUNCATE dahil) |
| B. WhatsApp (5, policy yok) | `WhatsAppContact/Message/Schedule/ScheduleRecipient`, `AlfashomeConfig` | **Orta**: kişi/mesaj verisi; aynı kırılganlık |
| C. PDKS (8, policy yok) | `pdks_personnel`, `pdks_attendance_records`, `pdks_leaves`, `pdks_login_codes`, `pdks_push_subscriptions`, `pdks_tenants`, `pdks_worksites`, `pdks_personnel_worksites` | **Orta-yüksek**: personel/giriş kodu/push abonelik verisi; aynı kırılganlık |
| D. Ürün adayları (2) | `urun_aday`, `urun_aday_gorsel` | Düşük |

Neden toplu revoke şimdi uygulanmadı: kapsam talimatı (yalnız denetim) + üretimde Supabase "default privileges" ve gelecekteki Prisma tabloları etkileşimi. Önerilen kapatma, ayrı onaylı PR'da: `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` (+ 2 `cfo_acceptance_reader` hariç) — `postgres`/`service_role` etkilenmez; Data API kullanımı repoda yok. Uygulama öncesi doğrulama: 24 saatlik API log'unda anon/authenticated REST isteği taraması (bu denetimde log sorgusu şeması kullanılamadığı için yapılamadı → onaydan önce yapılmalı).

## 3. Fonksiyonlar (20 kendi, anon EXECUTE)
Hepsi `SECURITY INVOKER` (secdef=false) → çağıran rolün RLS/grant'leriyle çalışır; anon için tablolar boş/ret döner.
| Fonksiyon | Tür | Risk |
|---|---|---|
| **`cfo_google(jsonb)`** (ARTIK KAPALI — PR #156) | VOLATILE; `extensions.http` ile `cfo-google` Edge Function'ı **gömülü anon JWT** ile çağırır | **YÜKSEK**: anon RPC ile (`/rest/v1/rpc/cfo_google`) Google Search Console/GA4 verisini (salt-okunur) ve servis hesabı e-postasını sorgulatabilir. Ek olarak Edge Function `verify_jwt=true` ama anon key **herkese açık** → fonksiyon doğrudan da çağrılabilir. Öneri: (1) `REVOKE EXECUTE ON FUNCTION cfo_google FROM PUBLIC, anon, authenticated`; (2) Edge Function'da çağıranın `service_role` olduğunu doğrula (veya `verify_jwt` + rol kontrolü); (3) fonksiyon gövdesindeki gömülü token'ı kaldır |
| `cfo_defter_denetim`, `cfo_gumruk_dilim`, `cfo_kar_kopru`, `cfo_kart_karari`, `cfo_kaynak_yeterliligi`, `cfo_model_hakedis`, `cfo_nakit_projeksiyon`, `cfo_onucus`, `_temel`, `_v19` | STABLE analiz; mali tabloları okur | **Orta**: yalnız RLS koruyor (anon → 0 satır). Reader/uygulama kullanır → anon EXECUTE gereksiz |
| `cfo_kargo_tahmin` | STABLE; tarife tablosu | Düşük (tarife RLS'i + reader) |
| `cfo_stok_sicrama_trg`, `cfo_xml_urun_degisim_trg` | trigger fonksiyonları | Düşük: doğrudan çağrılamaz (trigger dönüşü) |
| `cfo_norm`, `urun_aday_sku_num`, `urun_aciklama_uret`, `urun_kutu_tahmin` | IMMUTABLE saf fonksiyon | Düşük (veri okumaz) |
Yazma fonksiyonları (`cfo_ay_kazanan_yaz`, `cfo_kilometre_yaz`, `cfo_sicrama_kapat`, `cfo_stok_sicrama_kaydet`, `cfo_take_snapshot`): anon=**false**, authenticated=**false**, service_role/postgres=true (lockdown PR'ı).
`fm_*`: 2 salt-okunur fonksiyon anon'a açık (PUBLIC EXECUTE varsayılanı); veri RLS/view ile korunur — aynı sınıf (Orta-düşük).
pgvector fonksiyonları (`vector_*`, `halfvec_*`, `sparsevec_*`, ~110; sahip `supabase_admin`): eklenti; zararsız saf fonksiyonlar; eklenti `public` şemasında (advisor uyarısı) — taşıma ayrı iş.

## 4. Önerilen sıra (hepsi ayrı onay gerektirir)
1. ~~`cfo_google` kilidi~~ — TAMAMLANDI (PR #156).
2. Mali analiz fonksiyonlarında `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` (+ `cfo_acceptance_reader`'a açık GRANT).
3. 56 tablodan `anon, authenticated` grant'lerini kaldır (log doğrulamasından sonra).
4. Kalıcılık: `ALTER DEFAULT PRIVILEGES` (#152) zaten yeni nesneleri kapatıyor; global PUBLIC EXECUTE varsayılanı için `supabase_admin`/`postgres` varsayılanları ayrı karar.

## 5. Defense-in-depth migration tasarımı — UYGULANDI (`20261006120000_security_defense_in_depth`; kanıt `SECURITY-HARDENING-ACCEPTANCE.md`)
Amaç: RLS yanlışlıkla kapatılır / geniş bir policy eklenirse 56 tablonun anında açığa çıkmasını engellemek.
1. **Grant katmanı:** `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` (+ sequences); `postgres`, `service_role`, `cfo_acceptance_reader` (policy'li SELECT) korunur. Uygulama öncesi 24 saatlik API log'unda anon/authenticated REST isteği taraması ve Data API bağımlılığı yok teyidi (repo taramasında 0).
2. **Kalıcılık:** `ALTER DEFAULT PRIVILEGES` zaten #152 ile kapalı; global `PUBLIC EXECUTE` varsayılanı için fonksiyon başına `REVOKE EXECUTE … FROM PUBLIC` desenini her yeni fonksiyon migration'ının şablonuna ekle.
3. **Düzeltici kontrol (CI/üretim):** katalog testi: (a) RLS'siz public tablo = 0; (b) `anon/authenticated` rolüne uygulanan policy = 0; (c) anon grant'li tablo = 0; (d) anon EXECUTE'lu kendi fonksiyonu = 0 (pgvector eklenti fonksiyonları ayrı allowlist); başarısızlık merge'ü bloklar. Şema baseline parmak izi (PR baseline) bu denetimi de taşıyabilir.
4. **Policy hijyeni:** `FORCE ROW LEVEL SECURITY` değerlendirilmeli (postgres/Prisma BYPASSRLS ile zaten etkilenmez); geniş `TO public/anon` policy'leri CI'da yasak.
5. **Aşama:** staging'de (PGlite + Supabase benzeri roller) önce test → ayrı onaylı PR → üretim sonrası katalog doğrulaması + reader/service_role regresyon testi.
Gerekçe/öncelik: risk düşük-orta (RLS şu an açık, 0 geniş policy) ama tek savunma katmanı RLS; baseline sonrası yapılmalı.
