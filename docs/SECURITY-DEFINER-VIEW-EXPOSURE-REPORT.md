# SECURITY DEFINER VIEW EXPOSURE REPORT (2026-10-06)

## Bulgu
Advisor `security_definer_view` (ERROR): `public` şemasında **43** owner=postgres view (security_invoker değil) vardı; 40'ı (+3 `fm_memory_*`, bunlarda anon zaten kapalıydı) Supabase varsayılan yetkileriyle `anon` ve `authenticated` rollerine SELECT veriyordu. View'lar sahibin yetkisiyle çalıştığı için tablolardaki RLS atlanıyor; `cfo_servet` (net servet), `cfo_satis_siparis` (sipariş satırları), `cfo_nakit_*`, `cfo_servet_kalem` (banka/kredi/kart bakiyeleri) vb. Data API (`/rest/v1`) üzerinden anahtarı bilen herkese okunabilir durumdaydı. (Tablolar RLS+policy'siz olduğundan korunuyordu; view'lar bu korumayı deliyordu.)

## Bağımlılık denetimi
| Kaynak | Sonuç |
|---|---|
| Repo (`app`, `lib`, `services`, `components`, `hooks`, `scripts`, `infra`, `.github`) | `@supabase/*` paketi, `createClient`, `/rest/v1`, anon anahtarı **yok**. Supabase'e tek erişim Storage REST (`SUPABASE_SERVICE_ROLE_KEY`) |
| Uygulama | Tüm view okumaları `prisma.$queryRaw` (**postgres**, BYPASSRLS) |
| CFO ajanı | `cfo_acceptance_reader` (salt-okunur, kendi SELECT'i var) — `lib/cfo-agent/sources.ts` |
| Edge Function'lar | `cfo-google`: service_role ile yalnız `cfo_secret` okur (view yok); `stage-loader`: devre dışı (410) |
| DB içi | view→view ve fonksiyon→view bağımlılıkları sahip/invoker rolleriyle (postgres/service_role) çalışır |
| Canlı trafik | Son 24 saatte `edge_logs` (API ağ geçidi) kaynağı **yok**, PostgREST yalnız sistem logu (şema önbelleği) → Data API trafiği yok |
| `public` policy'leri | `public/anon/authenticated` rollerine policy veren **hiçbiri yok** |
| Vercel env | Listeleme yetkisi yok (403) — dış istemci (n8n vb.) anon anahtarı kullanımı doğrulanamadı; yukarıdaki trafik kanıtı bunu destekliyor |

## Sınıflandırma (43 view)
1. **Uygulama, Prisma/postgres** (sayfa/API): `cfo_alacak_borc`, `cfo_ay_kazanan_ozet`, `cfo_aylik_urun_kar`, `cfo_satis_birim`, `cfo_ciro_hedef`, `cfo_ithalat_oneri`, `cfo_ithalat_oneri_ozet`, `cfo_nakit_dibi`, `cfo_odeme_gunluk`, `cfo_servet`, `cfo_servet_kalem`, `cfo_yaklasan_odeme`, `cfo_olu_stok`, `cfo_olu_stok_ozet`, `cfo_xml_kalibrasyon`, `cfo_stok_deger`, `cfo_stok_sicrama_durum`, `cfo_yoldaki_kapsam`, `urun_aday_skor`
2. **CFO ajanı, reader bağlantısı**: `cfo_nakit_kapisi`, `cfo_satis_birim_duz`, `cfo_satis_siparis`, `cfo_servet(_kalem/_likidite)`, `cfo_stok_hareket_hiz`, `cfo_yolda_sku`, `cfo_yoldaki_kapsam`, `cfo_olu_stok`, `cfo_odeme_gunluk`
3. **service_role**: hiçbir view kullanmıyor (yetkisi korunuyor)
4. **Data API'de anon/authenticated gerektiren**: **0**
5. **Doğrudan kod referansı yok, yalnız DB fonksiyon/view bağımlılığı**: `candidate_board`, `cfo_bekleyen_karar`, `cfo_gecikmis_karar`, `cfo_hamle_erken_uyari`, `cfo_hamle_hikaye`, `cfo_kur_etkisi`, `cfo_nakit_mutabakat`, `cfo_satis_atfedilmemis`, `cfo_satis_kapsam`, `cfo_snapshot_delta`, `cfo_snapshot_gunluk`, `cfo_xml_hareket`, `cfo_xml_urun_hareket`, `urun_aday_katalog`, `urun_aday_puan`
6. **Reader-yüzlü hafıza view'ları** (anon zaten kapalıydı): `fm_memory_balance_day`, `fm_memory_fx_monthly`, `fm_memory_stock_company_day`

## Düzeltme (en dar)
Migration `20261005290000_security_definer_views_lockdown`: security_invoker olmayan tüm `public` view'lardan `PUBLIC/anon/authenticated` yetkisi kaldırılır. **View tanımı, SECURITY DEFINER semantiği, sahip değişmedi**; postgres/service_role/reader yetkileri aynı.
Gelecek nesneler: `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES/FUNCTIONS/SEQUENCES FROM anon, authenticated` (migration'ı çalıştıran rol = `postgres`). `service_role`/`postgres` varsayılanları korunur; mevcut nesnelere dokunmaz. Yeni nesneye Data API erişimi gerekirse açık `GRANT` yazılır. Kısıt: PUBLIC EXECUTE global varsayılanı kaldırılmadı (tüm şemaları etkilerdi) — yeni SECURITY DEFINER fonksiyonlar açıkça `REVOKE EXECUTE … FROM PUBLIC` almalı. `supabase_admin` kaynaklı varsayılanlar (Supabase iç nesneleri) değiştirilmedi.

## Acceptance (üretim, katalog)
| Kontrol | Sonuç |
|---|---|
| security_invoker olmayan view: anon SELECT/INSERT/UPDATE/DELETE | **0 / 43** |
| aynısı authenticated | **0 / 43** |
| postgres SELECT / service_role SELECT | 43 / 43 (değişmedi) |
| reader SELECT | 39 (öncesiyle aynı; 4 view reader'a hiç açık değildi) |
| `cfo_servet` anon/authenticated/service/reader | false/false/true/true; sahip olarak 1 satır okunuyor |
| Advisor `security_definer_view` ve `rls_disabled_in_public` | **ERROR yok** (kalan: INFO/WARN) |
| Varsayılan yetkiler (postgres, public) | tablo/fonksiyon/sequence: yalnız postgres+service_role |
Test: `__tests__/security-definer-views.test.ts` (PGlite, Supabase benzeri varsayılan yetkilerle): öncesi sızıntı kanıtı → sonrası anon/authenticated reddi, postgres/service_role/reader değişmedi, yeni nesneler otomatik açılmıyor, Prisma tarzı create→RLS→insert→select çalışıyor, çift uygulama, rolsüz DB'de no-op.

## Kalan (karar bekleyen, uygulanmadı)
- 56 tabloda `anon`/`authenticated` tablo yetkisi duruyor; RLS+policy'siz olduğundan satır görmezler/yazamazlar (savunma derinliği için `REVOKE ALL` önerilir).
- 20 `public` fonksiyonunda anon EXECUTE: invoker olduklarından (artık view/tablo yetkisi yok) fiilen çalışmazlar; `cfo_*`/`urun_*` iç fonksiyonlarda `REVOKE EXECUTE … FROM anon, authenticated` önerilir.
- Advisor WARN'ları: 30 fonksiyonda mutable search_path; `vector` eklentisi `public` şemasında.
