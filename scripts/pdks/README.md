# PDKS — Manuel kurulum (Supabase SQL Editor)

PDKS (Personel Devam Kontrol Sistemi) mobil PWA'sını test edilebilir duruma
getirmek için bu klasördeki SQL'ler **Supabase SQL Editor**'den sırayla
çalıştırılır. (Production'a yazma işlemi Claude Code web oturumundan onaylanamadığı
için manuel uygulama gerekir.)

Proje: **iotomasyon** · ref `frbxpodiostxuwlrubkt`

## Adımlar

Migration'ları **sırayla** uygulayın (her biri `_prisma_migrations`'a doğru
checksum'la kaydeder; böylece ileride `prisma migrate deploy` yeniden çalıştırmaz):

1. **Temel şema** — `apply_migrations_combined.sql`
   İlk 4 PDKS migration'ı (tablolar + giriş kodları + geç-hatırlatma + KVKK).
2. **Şantiye doğruluk eşiği** — `apply_max_accuracy.sql`
   `pdks_worksites.maxAccuracyMeters`.
3. **Şifre/cihaz/çıkış/bildirim** — `apply_password_device_reminders.sql`
   Şifre+cihaz bağlama+çıkış saati+artan geç-bildirim; varsayılan yarıçap 100 m.
   (Mevcut test personeline `1234` PIN'ini de atar.)

4. **Test verisi** — `test_seed.sql` *(opsiyonel; tabloları ilk kez kuruyorsanız)*
   - Tenant: "Test Şirketi" / Şantiye: radius 100.000 km (geofence testte her konumu kabul eder)
   - Personel: telefon `5551112233`, **şifre/PIN `1234`**
   - KVKK rızası verilmedi → uygulamada önce onay akışı denenir.
   - Test bitince sonundaki `DELETE` satırını çalıştırıp temizleyin.

5. **Ortam değişkenleri (Vercel)** — Web Push için:
   `npx web-push generate-vapid-keys` →
   `PDKS_VAPID_PUBLIC_KEY`, `PDKS_VAPID_PRIVATE_KEY`, `PDKS_VAPID_SUBJECT`.
   Artan geç-bildirim cron'u (`*/5`) **Vercel Pro** ister; Hobby'de harici
   zamanlayıcı ile `/api/pdks/cron/reminders`'ı `Bearer $CRON_SECRET` ile çağırın.

6. **Telefonda test** — `/pdks` aç → Telefon `05551112233`, Şifre `1234` →
   KVKK onayla → Giriş yap (konum izni) → check-in / check-out.

## Doğrulama (bu kod tabanında yapıldı)

- `tsc --noEmit` → 0 hata
- `eslint` (app/pdks, app/api/pdks, components/pdks, components/admin/pdks, lib/pdks) → temiz
