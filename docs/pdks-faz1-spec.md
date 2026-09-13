# PDKS (Personel Devam Kontrol Sistemi) — Faz 1 Teknik Spec (v2)

> Claude Code'a verilmek üzere hazırlanmış mimari ve görev dökümanı.
> Hedef: iotomasyon.com içinde, multi-tenant, PWA tabanlı, sunucu-tarafı geofence (haversine) + Web Push + Vercel Cron hatırlatma.
>
> **v2 değişikliği:** Auth modeli, mevcut iotomasyon yığınına (NextAuth + Prisma) göre yeniden yazıldı. Supabase-Auth + RLS (`auth.uid()`) bağımlılığı kaldırıldı; tenant izolasyonu uygulama/veri-erişim katmanına taşındı. DB-seviyesi RLS, auth modeline dokunmadan ileride eklenebilecek savunma katmanı olarak ertelendi.

---

## 0. ÖN KOŞUL (build'den önce, Claude Code teyit etsin)

- **DB motoru Postgres mu?** iotomasyon CRM'in Prisma datasource'u PostgreSQL ise multiSchema + ileride GUC-RLS mümkün. **MySQL ise** DB-seviyesi RLS tamamen masadan kalkar; izolasyon yalnızca uygulama katmanında olur (bu spec yine çalışır, sadece "ileride RLS" maddesi düşer).
- Mevcut `schema.prisma` datasource ve `previewFeatures` ayarını oku, çakışma var mı bak.

---

## 1. Kapsam ve Fazlama

**Faz 1:**
- Multi-tenant şema (ilk günden tenant katmanı, ayrı `pdks` şeması)
- Aktif check-in / check-out (personel uygulamayı açar, GPS; **kararı sunucu verir**)
- PWA (ana ekrana eklenebilir, iOS push uyumlu)
- Web Push (VAPID)
- Zamanlanmış hatırlatma (Vercel Cron): "bugün giriş yapmamışlara" push
- Tenant-admin paneli: canlı durum, puantaj, CSV export

**Faz 1 dışı (şema engellemeyecek):**
- WhatsApp API (Faz 2 — cron'a ikinci kanal)
- Self-servis tenant kaydı + billing (tenant'lar elle açılır)
- Pasif/arka plan otomatik konum (web'de mümkün değil)
- DB-seviyesi RLS (ileride GUC tabanlı, opsiyonel savunma derinliği)

---

## 2. Teknoloji Yığını

- **Host:** Mevcut iotomasyon.com (Next.js App Router, Vercel)
- **Yerleşim:** `iotomasyon.com/pdks` altında modül
- **Auth:** Mevcut **NextAuth** (tek auth sistemi — ayrıca Supabase Auth KURULMAYACAK)
- **DB + ORM:** Mevcut **Postgres + Prisma**, `pdks` şeması altında (Prisma `multiSchema`)
- **Tenant izolasyonu:** Prisma client extension + `AsyncLocalStorage` (uygulama katmanı)
- **PWA:** manifest.json + service worker
- **Push:** `web-push` + VAPID
- **Zamanlama:** Vercel Cron

---

## 3. Auth Modeli ve Tenant İzolasyonu (v2 — en kritik bölüm)

**İlke: Tek uygulamada tek auth sistemi.** NextAuth + Supabase Auth bir arada çalıştırılmaz (çift login, iki kullanıcı tablosu, senkron derdi). PDKS, mevcut NextAuth'u kullanır.

**İzolasyon nasıl sağlanır:**
- DB `auth.uid()` policy'leri YOK.
- Her isteğin oturumundan türetilen `tenantId` bir `AsyncLocalStorage` context'ine konur.
- Merkezi bir Prisma client extension, `pdks` şemasındaki tenant-sahipli tablolara yapılan her sorguya `tenantId` filtresini/verisini otomatik enjekte eder.
- Böylece "tenant_id filtresini unutma" riski tek noktada kapanır.

**Çalışan login UX'i (saha personeli):**
- Supabase Auth GETİRMEDEN, NextAuth'a bir **Credentials/OTP provider** eklenir.
- Personel telefon + OTP (SMS) ya da admin'in verdiği tek kullanımlık kod ile girer.
- `authorize()` → ilgili `Personnel` kaydını döner.
- NextAuth `session` callback'i oturuma `personnelId`, `tenantId`, `role` ekler.

**Ertelenen savunma derinliği (Faz sonrası, opsiyonel):**
- Postgres GUC tabanlı RLS: bağlantı başına `set_config('app.tenant_id', ...)` + `current_setting('app.tenant_id')` kullanan policy'ler. Auth modeline dokunmadan üstüne eklenebilir. Dış (ödeyen) tenant'lar gelmeden önce devreye alınması önerilir.

---

## 4. Rol Modeli

| Rol | Kapsam | Yetki |
|-----|--------|-------|
| `platform_admin` | Tüm tenant'lar (sen) | Tenant açma/kapama; tenant-bağımsız (unscoped) client kullanır |
| `tenant_admin` | Tek tenant | Personel/şantiye yönetimi, raporlar |
| `employee` | Tek tenant, kendi kaydı | Check-in/out, kendi geçmişi |

> `platform_admin` izolasyon extension'ını baypas eden ayrı bir "unscoped" Prisma client örneği üzerinden çalışır. Diğer roller her zaman scoped client kullanır.

---

## 5. Veri Modeli (Prisma — `pdks` şeması)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "pdks"]   // public: mevcut CRM, pdks: bu modül
}

model PdksTenant {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  personnel   Personnel[]
  worksites   Worksite[]
  records     AttendanceRecord[]
  subs        PushSubscription[]

  @@map("tenants")
  @@schema("pdks")
}

model Personnel {
  id              String    @id @default(uuid())
  tenantId        String
  tenant          PdksTenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Mevcut CRM kullanıcısıyla (varsa) opsiyonel bağ — yalnızca CRM'e de giren adminler için.
  // Saha çalışanları CRM User'ı OLMAK ZORUNDA DEĞİL; OTP ile kimliklenir.
  crmUserId       String?

  fullName        String
  phone           String?
  email           String?
  role            String    @default("employee")  // 'tenant_admin' | 'employee'
  expectedCheckIn String?                          // "08:30" gibi; hatırlatma eşiği
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())

  worksites       PersonnelWorksite[]
  records         AttendanceRecord[]
  subs            PushSubscription[]

  @@index([tenantId])
  @@map("personnel")
  @@schema("pdks")
}

model Worksite {
  id           String   @id @default(uuid())
  tenantId     String
  tenant       PdksTenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name         String
  latitude     Float
  longitude    Float
  radiusMeters Int      @default(150)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())

  personnel    PersonnelWorksite[]
  records      AttendanceRecord[]

  @@index([tenantId])
  @@map("worksites")
  @@schema("pdks")
}

model PersonnelWorksite {
  tenantId    String           // üniform izolasyon için join tablosunda da tutulur
  personnelId String
  worksiteId  String
  personnel   Personnel @relation(fields: [personnelId], references: [id], onDelete: Cascade)
  worksite    Worksite  @relation(fields: [worksiteId], references: [id], onDelete: Cascade)

  @@id([personnelId, worksiteId])
  @@index([tenantId])
  @@map("personnel_worksites")
  @@schema("pdks")
}

model AttendanceRecord {
  id                String    @id @default(uuid())
  tenantId          String
  tenant            PdksTenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  personnelId       String
  personnel         Personnel @relation(fields: [personnelId], references: [id], onDelete: Cascade)
  worksiteId        String?
  worksite          Worksite? @relation(fields: [worksiteId], references: [id])

  workDate          DateTime  @db.Date            // raporlama/sorgu kolaylığı
  checkInAt         DateTime?
  checkOutAt        DateTime?
  checkInDistanceM  Int?                          // HER ZAMAN saklanır
  checkOutDistanceM Int?
  checkInAccuracyM  Int?
  checkOutAccuracyM Int?
  checkInLat        Float?                        // OPSİYONEL (KVKK — Bölüm 11)
  checkInLng        Float?
  status            String    @default("open")    // 'open' | 'closed'
  createdAt         DateTime  @default(now())

  @@index([tenantId, workDate])
  @@index([personnelId, workDate])
  @@map("attendance_records")
  @@schema("pdks")
}

model PushSubscription {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      PdksTenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  personnelId String
  personnel   Personnel @relation(fields: [personnelId], references: [id], onDelete: Cascade)
  endpoint    String   @unique
  p256dh      String
  auth        String
  createdAt   DateTime @default(now())

  @@index([tenantId])
  @@map("push_subscriptions")
  @@schema("pdks")
}
```

> Not: DB fonksiyonu yazılacaksa rezerve kelimeyle çakıştırma. `current_role` Postgres'te yerleşiktir → kullanılacaksa `current_personnel_role()` gibi adlandır. (Faz 1'de izolasyon Prisma katmanında olduğu için bu fonksiyonlara büyük ihtimalle gerek kalmaz.)

---

## 6. Tenant İzolasyon Katmanı (Prisma extension + AsyncLocalStorage)

**Context store:**
```ts
// lib/pdks/context.ts
import { AsyncLocalStorage } from "async_hooks";
export const tenantContext =
  new AsyncLocalStorage<{ tenantId: string; personnelId: string; role: string }>();
```

**Scoped client (otomatik tenant enjeksiyonu):**
```ts
// lib/pdks/prisma.ts
import { prisma } from "@/lib/prisma";          // mevcut CRM prisma instance
import { tenantContext } from "./context";

const SCOPED = ["Personnel","Worksite","PersonnelWorksite","AttendanceRecord","PushSubscription"];

export const prismaPdks = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = tenantContext.getStore();
        if (ctx && model && SCOPED.includes(model)) {
          if (["findMany","findFirst","findUnique","count","aggregate","updateMany","deleteMany"].includes(operation)) {
            (args as any).where = { ...(args as any).where, tenantId: ctx.tenantId };
          }
          if (operation === "create") {
            (args as any).data = { ...(args as any).data, tenantId: ctx.tenantId };
          }
          // DİKKAT: id ile tekil update/delete ve createMany ayrıca ele alınmalı (aşağı bak)
        }
        return query(args);
      },
    },
  },
});
```

**Kritik uyarılar (Claude Code uygulasın):**
- `update`/`delete` tekil işlemler genelde `where: { id }` alır; bunlara tenantId enjekte etmek yetmez → önce kaydın `tenantId`'sini doğrula veya `updateMany/deleteMany` + `tenantId` koşuluna çevir.
- `createMany` için her satıra tenantId eklenmeli.
- `PdksTenant` modeli scoped DEĞİL (tenant'ın kendisi); sadece `platform_admin` unscoped client ile yönetir.
- Her API route'unda: NextAuth oturumu → `tenantContext.run({ tenantId, personnelId, role }, () => handler())`.

---

## 7. Check-in / Check-out Akışı

**Altın kural: geofence kararını CLIENT vermez, SUNUCU verir.** Client sadece `latitude, longitude, accuracy` gönderir.

`POST /api/pdks/check-in`
```
1. Oturum → personnel + atanmış şantiyeler (scoped client)
2. accuracy > 100m → reddet ("Konum doğruluğu yetersiz, açık alana çıkın")
3. Her şantiyeye haversine; en yakını seç
4. mesafe <= worksite.radiusMeters ise:
   - O gün (workDate) açık kayıt var mı? → mükerrer engelle
   - AttendanceRecord create (checkInAt=now, distance, accuracy, workDate, status='open')
5. Değilse → reddet ("İşyeri sınırı dışındasınız: ~Xm uzakta")
```

`POST /api/pdks/check-out` → günün açık kaydını bul, `checkOutAt`=now, status='closed'.

**Haversine (sunucu, metre):**
```js
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
```

---

## 8. PWA Kurulumu

- `public/manifest.json`: ad, ikonlar, `display: standalone`, start_url `/pdks`
- Service worker: push + (opsiyonel) offline kabuk
- **iOS uyarısı:** Push SADECE PWA ana ekrana eklendiyse ve iOS 16.4+ ise çalışır. İlk girişte iOS kullanıcısına "Paylaş → Ana Ekrana Ekle" yönlendirmesi göster. Android'de zorunlu değil.
- Markete girmez; link + ana ekrana ekleme ile dağıtılır.

---

## 9. Push Bildirimleri

- VAPID çifti (env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)
- `POST /api/pdks/subscribe` → subscription'ı `PushSubscription`'a yaz (scoped)
- `web-push` ile gönder; expired/invalid endpoint dönerse kaydı sil

---

## 10. Zamanlanmış Hatırlatma (Vercel Cron)

`vercel.json`:
```json
{ "crons": [{ "path": "/api/pdks/cron/reminders", "schedule": "0 6 * * *" }] }
```
> UTC — TR saatine göre ofset ayarla. Route'u `CRON_SECRET` ile koru. Cron platform-seviyesi çalıştığı için unscoped client + manuel `tenantId` döngüsü kullanır.

```
1. Aktif tenant'lar + aktif personel
2. Bugün (workDate) checkIn OLMAYANLAR
3. expectedCheckIn saati geçmişse → push
   "Günaydın! Henüz giriş yapmadınız, lütfen check-in yapmayı unutmayın."
4. (Faz 2) push yoksa/başarısızsa → WhatsApp şablon mesajı
```

---

## 11. KVKK / Gizlilik

- **Aydınlatma + açık rıza:** İlk girişte konum işlemeye onay; onay kaydı tutulur.
- **Veri minimizasyonu:** `checkInDistanceM` her zaman saklanır. Ham koordinat (`checkInLat/Lng`) **varsayılan kapalı**; yalnızca ihtilaf çözümü gerekçesiyle, tenant bazında açılabilir.
- **Amaç sınırlaması:** Konum yalnızca mesai doğrulaması için; sürekli takip yok.
- **Saklama süresi:** Eski kayıtlara silme/anonimleştirme politikası.

---

## 12. Tenant-Admin Paneli (Faz 1)

- Canlı durum: kim içeride/dışarıda (bugünkü açık kayıtlar)
- Personel CRUD + şantiye CRUD (harita üzerinde pin + yarıçap)
- Personel-şantiye atama
- Günlük/aylık puantaj (giriş, çıkış, toplam süre)
- CSV / XLSX export
- Eksik giriş raporu

---

## 13. Güvenlik / Sahtecilik — Dürüst Sınırlar

Web geolocation spoof edilebilir; native'in aksine %100 engellenemez. Faz 1 hafifletmeleri: accuracy eşiği (>100m reddet), sunucu-tarafı zaman+mesafe doğrulaması, anomali tespiti (imkânsız seyahat). Gerekirse Faz 2'de selfie/foto teyidi.

---

## 14. Build Sırası (v2 — Claude Code için)

0. **DB motoru teyidi** (Bölüm 0) — Postgres mu? multiSchema/RLS uygunluğu.
1. Prisma şeması `pdks` altında (Bölüm 5) → migration
2. **Tenant izolasyon katmanı** (Bölüm 6): context + scoped client + tekil-işlem koruması
3. NextAuth'a Credentials/OTP provider + session'a `tenantId/personnelId/role` (Bölüm 3)
4. Check-in/out API'leri + haversine (Bölüm 7)
5. PWA kabuğu + manifest + service worker (Bölüm 8)
6. Personel mobil ekranı (büyük Giriş/Çıkış butonu + durum)
7. Push: VAPID + subscribe + gönderim (Bölüm 9)
8. Vercel Cron hatırlatma (Bölüm 10)
9. Tenant-admin paneli (Bölüm 12)
10. KVKK onay akışı + export (Bölüm 11–12)

---

## 15. Ortam Değişkenleri

```
DATABASE_URL=                 # mevcut CRM Postgres (pdks şeması aynı DB'de)
NEXTAUTH_SECRET=              # mevcut
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
CRON_SECRET=
# (SMS OTP kullanılacaksa) SMS_PROVIDER_API_KEY=
```
