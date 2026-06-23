# PDKS — Manuel kurulum (Supabase SQL Editor)

PDKS (Personel Devam Kontrol Sistemi) mobil PWA'sını test edilebilir duruma
getirmek için bu klasördeki SQL'ler **Supabase SQL Editor**'den sırayla
çalıştırılır. (Production'a yazma işlemi Claude Code web oturumundan onaylanamadığı
için manuel uygulama gerekir.)

Proje: **iotomasyon** · ref `frbxpodiostxuwlrubkt`

## Adımlar

1. **Şema** — `apply_migrations_combined.sql`
   4 PDKS migration'ını (Faz 1 tablolar + giriş kodları + geç-hatırlatma + KVKK)
   tek transaction'da uygular ve `_prisma_migrations`'a doğru checksum'larla kaydeder
   (böylece ileride `prisma migrate deploy` bunları yeniden çalıştırmaz).

2. **Test verisi** — `test_seed.sql` *(opsiyonel, sadece test için)*
   - Tenant: "Test Şirketi" / Şantiye: radius 100.000 km (geofence testte her konumu kabul eder)
   - Personel: telefon `5551112233`, giriş kodu `123456` (2035'e kadar geçerli)
   - KVKK rızası verilmedi → uygulamada önce onay akışı denenir.
   - Test bitince sonundaki `DELETE` satırını çalıştırıp temizleyin.

3. **Ortam değişkenleri (Vercel)** — Web Push için:
   `npx web-push generate-vapid-keys` →
   `PDKS_VAPID_PUBLIC_KEY`, `PDKS_VAPID_PRIVATE_KEY`, `PDKS_VAPID_SUBJECT`
   (yalnızca push test edilecekse gerekli; giriş/çıkış testi için şart değil).

4. **Telefonda test** — `/pdks` aç → Telefon `5551112233`, Kod `123456` →
   KVKK onayla → Giriş yap (konum izni) → check-in / check-out.

## Doğrulama (bu kod tabanında yapıldı)

- `tsc --noEmit` → 0 hata
- `eslint` (app/pdks, app/api/pdks, components/pdks, components/admin/pdks, lib/pdks) → temiz
