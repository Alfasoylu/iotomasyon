# PDKS — Personel Devam Kontrol Sistemi

Çok-kiracılı (multi-tenant), konum-doğrulamalı personel giriş/çıkış (devam takip)
modülü. iotomasyon ana uygulamasının içinde, ayrı bir personel PWA'sı (`/pdks`) ve
yönetici paneli (`/admin/pdks`) olarak yaşar.

> Durum (2026-06-23): temel akış gerçek telefonla uçtan uca doğrulandı. Kod
> Step 1–10 + PWA ikonları tamamlanmış durumda.

## Mimari

- **Şema yerleşimi:** Tüm tablolar `public` şemada, `pdks_` önekli. RLS açık
  (politika yok → `anon`/`authenticated` için deny-all; uygulama `postgres` rolüyle
  bağlanıp RLS'i bypass eder — proje genel güvenlik postürüyle tutarlı).
- **Tenant izolasyonu (uygulama katmanı):** Her istek `lib/pdks/context.ts`
  (`AsyncLocalStorage`) ile tenant bağlamı kurar; `lib/pdks/prisma.ts` içindeki
  scoped Prisma client her sorguya otomatik `tenantId` enjekte eder. "Where'e
  tenantId koymayı unutma" riski tek noktada kapanır.
- **Geofence kararı SUNUCUDA:** İstemci yalnızca ham `latitude/longitude/accuracy`
  gönderir; mesafe (haversine) ve doğruluk/yarıçap kontrolü sunucuda yapılır
  (`lib/pdks/geo.ts`, `app/api/pdks/check-in`).
- **KVKK:** `pdks_personnel.kvkkConsentAt` null ise check-in/out (konum işleme)
  sunucu tarafında engellenir. Varsayılan olarak yalnızca **mesafe** saklanır.

## Veri modeli (Prisma)

| Tablo | Rol |
|---|---|
| `pdks_tenants` | Kiracı (şirket) |
| `pdks_personnel` | Personel; `phone`, `kvkkConsentAt`, `expectedCheckIn`, `lastLateReminderOn` |
| `pdks_worksites` | Şantiye; `latitude/longitude`, `radiusMeters`, `maxAccuracyMeters` |
| `pdks_personnel_worksites` | Personel ↔ şantiye ataması (M:N) |
| `pdks_attendance_records` | Günlük giriş/çıkış; `status` open/closed, mesafeler |
| `pdks_login_codes` | Tek kullanımlık giriş kodu (bcrypt hash, TTL) |
| `pdks_push_subscriptions` | Web Push aboneliği |

## Kimlik doğrulama

- **Personel girişi:** telefon + **kalıcı şifre/PIN** (bcrypt). Admin oluşturur ve
  sıfırlar; SMS yok. Personel kendi telefonunda bir kez girer, oturum 7 gün kalır.
- **Cihaz bağlama (tek cihaz kilidi):** İlk başarılı giriş, personelin cihazına
  uzun ömürlü `pdks_device` cookie token'ı yazar ve hash'ini (`deviceIdHash`,
  SHA-256) saklar. Sonraki girişlerde token eşleşmezse `device_mismatch` (403).
  Cihaz/telefon değişiminde admin **"cihazı sıfırla"** (`resetDeviceAction`) der.
  IP'ye değil cihaza bağlıdır → mobil IP değişiminden etkilenmez.
- Telefon kanonik normalize edilir (`5XXXXXXXXX`); giriş ve kayıt aynı normalize'i
  kullanır. Oturum imzalı cookie ile taşınır (`lib/pdks/session.ts`).
- **Yönetici:** ana uygulama kullanıcısı; `/admin/pdks` `PERMISSIONS.PDKS_MANAGE`
  ile korunur. Personel/şantiye CRUD, şifre/cihaz sıfırlama, puantaj/CSV.

## Geofence ve doğruluk

- **Check-in ve check-out** aynı sunucu-tarafı kontrole tabidir; ikisinde de konum zorunlu.
- En yakın atanmış aktif şantiye haversine ile bulunur (check-out'ta kaydın şantiyesi).
- **Yarıçap kapısı:** mesafe `worksite.radiusMeters`'i (varsayılan 100 m) aşarsa reddedilir.
- **Doğruluk kapısı:** cihaz `accuracy` değeri `worksite.maxAccuracyMeters`'i
  (varsayılan 100 m) aşarsa reddedilir — şantiye-başına ayarlanır (şehir içi/kapalı
  alan GPS'i için gevşetilebilir).

## PWA & bildirim

- `public/pdks/manifest.webmanifest` + `sw.js` + ikonlar (192/512). "Ana Ekrana Ekle"
  ile uygulama gibi yüklenir.
- **Web Push (VAPID):** `PDKS_VAPID_PUBLIC_KEY`, `PDKS_VAPID_PRIVATE_KEY`,
  `PDKS_VAPID_SUBJECT` env'leri gerekir (`npx web-push generate-vapid-keys`).
- **Artan geç-kalma hatırlatması:** `/api/pdks/cron/reminders` her 5 dk çalışır;
  giriş yapmamış personele "5/10/…/60 dakika geç kaldınız" gönderir, 60 dk'da durur.
  `lateReminderLastMin` + `lastLateReminderOn` ile aynı dilim tekrar edilmez.
  **Tetikleme:** Vercel Hobby yalnızca günlük cron'a izin verdiğinden bu uç nokta
  `vercel.json`'da değil; harici bir zamanlayıcı (cron-job.org / GitHub Actions) ile
  her 5 dk `Authorization: Bearer $CRON_SECRET` başlığıyla çağrılır. (Vercel Pro'da
  `vercel.json`'a `*/5 * * * *` cron eklenebilir.)

## Kurulum / test

1. Migration'ları uygula — `scripts/pdks/` (Supabase SQL Editor) veya
   `prisma migrate deploy`.
2. Push için VAPID env'leri (Vercel). Giriş/çıkış testi için zorunlu değil.
3. `/admin/pdks` → şantiye (konum + yarıçap + doğruluk) ve personel ekle, giriş kodu üret.
4. Telefonda `/pdks` → telefon + kod → KVKK onayı → GPS check-in/out.

Hızlı test verisi (sabit kod): `scripts/pdks/test_seed.sql`.

## Bilinen tasarım notları

- Çıkıştan sonra aynı gün ikinci giriş **yeni** kayıt açar (çok-vardiya senaryosu için
  kasıtlı). Pano/puantaj aynı günün en son kaydını gösterir.
- Ham koordinatlar varsayılan olarak DB'ye yazılmaz (KVKK); yalnızca mesafe + doğruluk.
