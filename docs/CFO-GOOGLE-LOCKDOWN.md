# cfo_google KİLİDİ (2026-10-06)

## Çağrı zinciri (tam)
`SQL istemcisi (postgres / service_role / cfo_acceptance_reader)` → `public.cfo_google(jsonb)` (SECURITY DEFINER) → HTTP POST `…/functions/v1/cfo-google` (başlık `x-cfo-internal`) → Edge Function `cfo-google` → Google Search Console / GA4 (salt-okunur).
- **Uygulama (Next.js) tarafında hiçbir referans yok** (repo taraması: `cfo_google`/`cfo-google` yalnız lockdown yorumunda). Çağıranlar SQL istemcileridir; CFO ajanı reader rolüyle, operatör postgres/service_role ile.
- Cron/pg_cron yok; başka fonksiyon/view bu fonksiyona bağlı değil.

## Bulgu (düzeltme öncesi, üretimde doğrulandı)
Anonim `POST /functions/v1/cfo-google` (yalnız herkese açık anon key) → **200** (servis hesabı e-postası + GSC/GA4 listesi); anonim `POST /rest/v1/rpc/cfo_google` → **200**. İki yol da gömülü anon JWT / `verify_jwt` ile anon key'in herkese açık olması yüzünden açıktı.

## Düzeltme
1. `cfo_secret.CFO_GOOGLE_INTERNAL_TOKEN` — 64 karakter rastgele sır, DB içinde üretildi (loglara/PR'a/fixture'a yazılmadı); yalnız `cfo_secret`'te (RLS `USING(false)`).
2. Edge Function (`supabase/functions/cfo-google`, v2): `verify_jwt=false`; **yalnız** `x-cfo-internal` başlığı ve sabit-zamanlı karşılaştırma ile yetki; anon JWT yetki sayılmaz; başlıksız istek DB'ye gitmeden 401; girdi doğrulama; hata gövdeleri jenerik; **yanıttan `service_account` kaldırıldı**.
3. `public.cfo_google()` yeniden yazıldı: SECURITY DEFINER, `search_path` sabit, sırrı `cfo_secret`'ten okur, **gömülü JWT yok**. `EXECUTE`: PUBLIC/anon/authenticated **yok**; postgres, service_role, cfo_acceptance_reader **var** (reader önceki akışı bozmamak için korundu; fonksiyon sırrı döndürmez; reader `cfo_secret`'i doğrudan okuyamaz).
4. Migration `20261006110000_cfo_google_lockdown` (üretime uygulandı + kayıtlı). Sır migration'da yok.

## Üretim kabulü
| Test | Sonuç |
|---|---|
| anonim doğrudan Edge çağrısı (anon JWT) | **401 unauthorized** |
| başlıksız / sahte `x-cfo-internal` / GET | **401** |
| anonim `rpc/cfo_google` | **401, 42501 permission denied for function** |
| yetkili sunucu yolu (postgres → cfo_google → Edge → Google) | **çalışır**: yalnız `search_console`, `ga4_accounts` anahtarları, GSC 200, GA4 200, `service_account` yok |
| fonksiyon gövdesinde JWT | yok |
| fonksiyon ACL | `postgres, service_role, cfo_acceptance_reader` |

## Sır döndürme (rotasyon)
`UPDATE cfo_secret SET value = <yeni 64 karakter>, updated_at = now() WHERE key='CFO_GOOGLE_INTERNAL_TOKEN'` — Edge Function ve SQL fonksiyonu her çağrıda okur; yeniden dağıtım gerekmez. Eski gömülü anon JWT zaten herkese açık anon key'dir (rotasyon gerektirmez).

## Geri alma
Önerilmez (anon'a açık köprüyü geri getirir). Gerekirse: Edge Function v1'e dön + eski gövdeyi geri yükle + EXECUTE'u yeniden ver.
