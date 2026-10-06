# SECURITY HARDENING ACCEPTANCE (2026-10-06)

Üretim: Supabase `frbxpodiostxuwlrubkt`. Tüm ölçümler üretimden alınmıştır (katalog + anonim HTTP).

| Kriter | Sonuç | Kanıt |
|---|---|---|
| public financial files = 0 | **0** | `storage.buckets`: `cfo-files` public=**false**; kalan public bucket'lar yalnız `urun-gorsel` (102 jpeg ürün görseli) ve `ip-set` (22 png pazarlama görseli) — finansal belge yok |
| anonymous cfo-files access = denied | **Denied** | eski 5 farklı public URL (png, xlsx, 2×Enpara xls) → HTTP **400 "Bucket not found"** (önce 200 idi); anon key ile `/object/authenticated`, `/object/sign` → 404 NoSuchKey; anon key `/object/list/cfo-files` → `[]` |
| 8 referans private biçime taşındı | **8/8** | `cfo_question_file.url` = `private:cfo-files/<path>`; 0 satır `object/public` içeriyor; 8/8 referans `storage.objects`'te çözülüyor; 8 nesne yerinde (silme/yükleme yok) |
| migration idempotent + rollback | **Doğrulandı** | `__tests__/cfo-files-private-migration.test.ts` (PGlite): 2. çalıştırma değişiklik yok; geçersiz/olmayan/başka-bucket satırlar dokunulmaz; rollback SQL (yedek tablodan) eski URL'leri ve public bayrağını geri getirir |
| authenticated/application access path | **8/8 doğrulandı (sunucu tarafı, service-role, secret gösterilmeden)** | Geçici Edge Function (kendi ortamındaki service key ile; yalnız durum/boyut döndü, sonra 410'a çevrilip kapatıldı): bucket `public=false`; 8/8 referans `private:` biçiminde; 8/8 `object/sign` (`expiresIn=60`, JWT TTL 59–60 sn) üretildi; 8/8 imzalı URL ile okundu (HTTP 200, bayt sayısı > 0) ve `authenticated` indirmesiyle **aynı bayt sayısı**; 8/8 eski public URL anonim **400**. **Kapsam notu:** bu, Storage API + service-role yolunu kanıtlar; Next.js yolunun (`/api/admin/ai-cfo/files/[id]`, ADMIN oturumu gerekir) tarayıcıdan uçtan uca açılışı oturum olmadan yapılamadı — o yol birim testlerle (`cfo-private-files.test.ts`) kapsanıyor. `scripts/verify-cfo-files-private.ts` kendi ortamınızda isteğe bağlı olarak çalıştırılabilir (secret'ı paylaşmadan) |
| internal CFO views anon = denied | **Denied** | anon/authenticated SELECT'i olan view sayısı **0**; `cfo_servet`, `cfo_satis_siparis`, `cfo_nakit_mutabakat`, `cfo_nakit_kapisi`, `cfo_servet_kalem` → erişim yok (#152) |
| public RLS-disabled tables = 0 | **0 / 143** | `pg_class.relrowsecurity` |
| write functions anon execution = denied | **Denied** | `cfo_ay_kazanan_yaz`, `cfo_kilometre_yaz`, `cfo_sicrama_kapat`, `cfo_stok_sicrama_kaydet`, `cfo_take_snapshot`: anon=false, authenticated=false |
| postgres/service_role unchanged | **Değişmedi** | 5 yazma fonksiyonunda service_role=true, postgres=true; 55 view'da service_role+postgres SELECT=true; Prisma uygulaması (postgres) bu işlerden sonra kesintisiz; yeni `cfo_question_file_url_backup` tablosu yalnız eklendi |

## Açık riskler (bu aşamada UYGULANMADI — `docs/ANON-GRANTS-FUNCTIONS-AUDIT.md`)
1. ~~`cfo_google(jsonb)` anon'a açık~~ → kapatıldı (madde 5).
2. 56 tabloda anon tam tablo grant'i — yalnız RLS koruyor (0 anon policy); PDKS/WhatsApp/mali tablolar.
3. 10 mali analiz fonksiyonu anon EXECUTE (RLS ile boş döner).
4. **Geçmiş maruziyet: BİLİNMİYOR (historical exposure unknown).** `cfo-files` bucket'ı kapanana kadar public idi (Enpara banka ekstreleri, ticari fatura, ekran görüntüleri dahil). Bu dönemde dosyalara kimlerin eriştiği araştırılmadı ve kanıtlanabilir bir sonuç yoktur; "hiç erişilmedi" diye kabul EDİLMEMELİDİR. Forensic inceleme şimdilik yapılmamıştır (karar); ihtiyaç doğarsa Supabase storage/CDN log'ları saklama süresi içinde incelenmeli.
5. `cfo_google` — **KAPATILDI** (PR #156, `docs/CFO-GOOGLE-LOCKDOWN.md`); #156 merge'üne kadar üretimde zaten uygulanmıştır.

## Geri alma planı (cfo-files)
```sql
UPDATE cfo_question_file f SET url = b.old_url FROM cfo_question_file_url_backup b WHERE b.id = f.id AND f.url = b.new_url;
UPDATE storage.buckets SET public = true WHERE id = 'cfo-files';  -- yalnız bilinçli olarak yeniden public yapılacaksa
```
Not: kod `public=true` bucket'ı reddeder; geri alma uygulama indirmesini de kapatır — rollback yalnız acil durumda.

## Doğrulama kalıntıları (temizlik notu)
- Geçici Edge Function `tmp-cfo-files-verify`: v3 = 410 stub (verify_jwt=true), işlevsiz; Supabase panelinden silinebilir (MCP silme aracı yok).
- `cfo_secret.TMP_CFO_FILES_VERIFY_TOKEN`: değeri boşaltıldı (satır duruyor).
- `cfo_google` (#156) merge edildi; `_prisma_migrations` checksum'ları repoyla eşit (20261005290000 / 300000 / 20261006110000 doğrulandı).

## Backlog (security) — 1-3 KAPANDI (defense-in-depth bölümü)
1. `cfo_acceptance_reader → cfo_google` EXECUTE **least-privilege incelemesi** (şu an korunuyor; fonksiyon sır döndürmez ama reader'ın Google verisini tetikleyebilmesi gerekli mi?).
2. 56 tablo anon/authenticated grant **defense-in-depth** (`ANON-GRANTS-FUNCTIONS-AUDIT.md` §5).
3. Kalan **çalıştırılabilir fonksiyon** yetki incelemesi (10 analiz fonksiyonu anon EXECUTE, `fm_*` 2 salt-okunur, pgvector eklenti fonksiyonları).

## Defense-in-depth — UYGULANDI (2026-10-06, migration `20261006120000_security_defense_in_depth`, kullanıcı onaylı)
Üretimde uygulandı + `_prisma_migrations` kaydı (checksum repo ile eşit). Katalog doğrulaması (öncesi → sonrası):

| Kriter | Sonuç |
|---|---|
| anon/authenticated → public tablo/view/matview erişimi | 56 tablo → **0** |
| anon/authenticated → sequence ACL girdisi | 90 → **0** |
| anon/authenticated → kendi fonksiyon EXECUTE | 19 → **0** |
| `cfo_google` reader EXECUTE | **reddedildi**; postgres + service_role **çalışıyor** (`search_console`, `ga4_accounts`) |
| postgres (uygulama) davranışı | değişmedi: sahip rol; `cfo_nakit_projeksiyon(30)` 31 satır, `cfo_onucus()` 21 satır, `fm_stock_freshness` FRESH |
| service_role davranışı | değişmedi: 31/31 fonksiyonda EXECUTE; service_role+reader tablo yetki özeti hash'i öncesi=sonrası (`cfc28c44…`) |
| CFO reader salt-okunur akışı | değişmedi: 129 ilişki SELECT (öncesi=sonrası); 17 salt-okunur fonksiyon açıkça verildi; yalnız `cfo_google` + 2 trigger fonksiyonu reader'dan çıktı |
| RLS kapalı public tablo | **0** |
| anon/authenticated/public'e açık policy | **0** |
| temiz DB (baseline + migration) ↔ üretim parmak izi | **17/17 grup birebir** (acl 328, fnacl 48, seqacl 15 güncellendi); Step 1 21 grup birebir |
| finansal veri değişikliği | **0** (yalnız GRANT/REVOKE) |
| anonim REST (anon key) | tablo/view okuma, insert ve RPC → **401 / 42501 permission denied** |

CI kapısı: `__tests__/security-defense-in-depth.test.ts` (temiz DB üzerinde: anon/auth ilişki/sequence/fonksiyon = 0, RLS-off = 0, geniş policy = 0, service_role eksik = 0, reader salt-okunur kümesi korunur). Yeni bir migration anon'a açık nesne bırakırsa CI kırılır.

## Faz kapanışı
**Security hardening fazı KAPANDI (2026-10-06).** Kalan maddeler (yeni kritik açık çıkmadıkça sonraya): geçmiş cfo-files maruziyeti **bilinmiyor**; `tmp-cfo-files-verify` Edge Function (410) panelden silinebilir; `cfo_secret`'teki düz metin kimlik bilgilerinin ortam değişkenlerine taşınması (CFO-GOREV açık riski); pgvector eklentisinin `public` şemasından taşınması.
