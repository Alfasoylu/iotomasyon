# SECURITY HARDENING ACCEPTANCE (2026-10-06)

Üretim: Supabase `frbxpodiostxuwlrubkt`. Tüm ölçümler üretimden alınmıştır (katalog + anonim HTTP).

| Kriter | Sonuç | Kanıt |
|---|---|---|
| public financial files = 0 | **0** | `storage.buckets`: `cfo-files` public=**false**; kalan public bucket'lar yalnız `urun-gorsel` (102 jpeg ürün görseli) ve `ip-set` (22 png pazarlama görseli) — finansal belge yok |
| anonymous cfo-files access = denied | **Denied** | eski 5 farklı public URL (png, xlsx, 2×Enpara xls) → HTTP **400 "Bucket not found"** (önce 200 idi); anon key ile `/object/authenticated`, `/object/sign` → 404 NoSuchKey; anon key `/object/list/cfo-files` → `[]` |
| 8 referans private biçime taşındı | **8/8** | `cfo_question_file.url` = `private:cfo-files/<path>`; 0 satır `object/public` içeriyor; 8/8 referans `storage.objects`'te çözülüyor; 8 nesne yerinde (silme/yükleme yok) |
| migration idempotent + rollback | **Doğrulandı** | `__tests__/cfo-files-private-migration.test.ts` (PGlite): 2. çalıştırma değişiklik yok; geçersiz/olmayan/başka-bucket satırlar dokunulmaz; rollback SQL (yedek tablodan) eski URL'leri ve public bayrağını geri getirir |
| authenticated/application access path | **Kod yolu test edildi; canlı 8/8 doğrulama BEKLİYOR (service-role anahtarı sandbox'ta yok)** | Uygulama yolu: `/api/admin/ai-cfo/files/[id]` (ADMIN + CFO_READ + EXECUTIVE_READ) → service key ile `/object/authenticated`. Birim test (`cfo-private-files.test.ts`): private bucket doğrulaması, path doğrulaması, public bucket'ta indirme reddi, imzalı URL (`signedCfoFileUrl`, 60 sn) üretimi. Sandbox'ta service-role anahtarı yok → canlı doğrulama için `scripts/verify-cfo-files-private.ts` hazır (8 dosya için authenticated indirme + imzalı URL + eski URL reddi) |
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
