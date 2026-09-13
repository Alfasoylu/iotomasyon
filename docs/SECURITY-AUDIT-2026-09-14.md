# Güvenlik Taraması — 2026-09-14

> Kapsam: `app/`, `lib/`, `services/`, `scripts/`, `proxy.ts`, `next.config.ts`,
> bağımlılıklar (`npm audit --omit=dev`), git geçmişi (sır taraması).
> Yöntem: kaynak kod okuması + statik tarama; canlı ortama sızma testi YAPILMADI.
> Bu dosyada **yalnızca kodda doğrulanan** bulgular var.

## Bu turda düzeltilenler

| Bulgu | Düzeltme |
|---|---|
| CRM `/login`'de CAPTCHA ve brute-force koruması yoktu | Cloudflare Turnstile (`lib/turnstile.ts`, `components/auth/turnstile-widget.tsx`) + bellek içi hız sınırlayıcı (`lib/login-rate-limit.ts`: e-posta başına 5 / IP başına 20 başarısız deneme, 15 dk). Sunucu tarafı doğrulama `lib/actions/auth-actions.ts`. Anahtarlar tanımlı değilse CAPTCHA kapalı, production'da uyarı loglanır. |
| Güvenlik header'ları yoktu | `next.config.ts`: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false`. CSP bilinçli olarak ertelendi (nonce altyapısı gerekiyor). |

## Durum güncellemesi (2026-09-14, ikinci tur)

Aşağıdaki bulguların **tamamı kodda kapatıldı**: K1, Y1, Y2, Y3, Y4 (xlsx → SheetJS 0.20.3),
O1, O2, O3, O4, O5, O6, D1–D8, D10. Ayrıntı: `docs/PDKS.md` → Yapılanlar (2026-09-14 devam).

**Kullanıcı aksiyonu gerektirenler:**
- **K2:** dosya repodan silindi; Hepsiburada şifresini değiştirin ve `git filter-repo`
  ile geçmişi temizleyin (force-push gerektirir, ekibi bilgilendirin).
- **O1:** Vercel'de `CRON_SECRET` tanımlı olmalı; yoksa cron'lar artık 503 döner.
- **CAPTCHA:** yerleşik resim CAPTCHA'sı varsayılan (anahtar gerekmez). Turnstile
  opsiyonel: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` tanımlanırsa öne geçer.
- **O6:** deploy sonrası herkes (CRM + PDKS) bir kez yeniden giriş yapar.

**Kabul edilen kalanlar:** O7 (bellek içi limiter, Vercel Firewall ile tamamlanabilir),
D9 (public lookup bilinçli açık), `prisma` CLI'ın dev-only bağımlılık advisory'leri.

## Bulgular (ilk tur, tarihsel kayıt)

### KRİTİK

**K1 — Next.js 16.2.6: kimlik doğrulamasız RCE (2 adet) + 9 ek advisory.**
`npm audit` → `next` için kritik: GHSA-p293-qw3h-jr36 (Windows sunucularda RCE),
GHSA-2xp9-vwfh-vxw4 (Image Optimization API, AVIF ile RCE — `next/image` kullanılıyor).
Ayrıca middleware/proxy bypass, Server Action DoS/SSRF, cache confusion.
Düzeltme: `next@16.3.5` (semver-minor). Öncelik 1.
```bash
npm i next@16.3.5 eslint-config-next@16.3.5
```
Sonra `npm run build` + `/login`, `/dashboard`, `/personel`, `/t/{slug}` smoke test.

**K2 — Git'e işlenmiş canlı üçüncü taraf kimlik bilgisi.**
`scripts/hepsiburada-probe.ts:4-5` içinde Hepsiburada merchant id + şifre düz metin;
`ae90a4f` commit'inden beri geçmişte. Dosyayı silmek yetmez.
Yapılacaklar: (1) Hepsiburada şifresini **hemen** değiştir, (2) dosyayı repodan kaldır,
(3) geçmişi temizle (`git filter-repo`) veya en azından rotasyonu belgele.

### YÜKSEK

**Y1 — `runSync` `"use server"` modülünden export edilmiş, auth yok.**
`lib/actions/xml-sync-actions.ts:133`. `"use server"` dosyasındaki her export çağrılabilir
bir server action'dır. `runSync(sourceId, url, secondaryUrl, authHeader)` saldırganın
verdiği URL'i (SSRF) `Authorization` header'ıyla çeker ve DB'ye ürün/stok/görsel yazar.
Düzeltme: `runSync`'i `lib/xml-sync-runner.ts` gibi `"use server"` olmayan bir
modüle taşı, yalnız `triggerXmlSyncAction` (auth'lu) ve cron route çağırsın.

**Y2 — Auth'suz okuma server action'ları.**
`lib/actions/import-snapshot-actions.ts:175` (`getProductImportSnapshotsAction`),
`lib/actions/stock-adjustment-actions.ts:108` (`getProductStockAdjustments`),
`lib/actions/exchange-rate-actions.ts:80,93`. Herhangi bir `productId` için ithalat
maliyeti/tedarikçi anlık görüntüleri ve stok düzeltme günlükleri anonim okunabiliyor.
Düzeltme: `requireUser()` ekle **veya** export'u kaldırıp sayfa içinden servis olarak çağır.

**Y3 — PDKS personel girişi: rate limit yok, PIN min 4 karakter, şifre oracle.**
`app/api/pdks/auth/login/route.ts`, `lib/pdks/auth.ts:78-113`, `lib/validations/pdks.ts:31`.
`device_mismatch` (403) yanıtı yalnız bcrypt başarılıysa dönüyor → cihaz kilidi
şifre tahminini durdurmuyor, sadece oturum vermiyor. 4 haneli PIN = 10k deneme.
Düzeltme: `lib/login-rate-limit.ts` benzeri sınırlayıcı (telefon + IP), PIN min 6,
cihaz kontrolünü bcrypt'ten bağımsız yap ve tüm hatalarda tek tip 401 dön.

**Y4 — Bağımlılıklar (runtime).**
- `sharp` ≤0.35.4-rc: libvips/libheif CVE'leri (yüksek) → `sharp@0.35.4` (major, görsel
  işleme yolları test edilmeli).
- `xlsx` (SheetJS npm): prototype pollution + ReDoS, **npm'de düzeltme yok**. Yükleme
  uçları (`api/products/bulk-import`, `trendyol-finance/import`) yalnız yetkili
  kullanıcıya açık olduğu için risk sınırlı. Seçenek: SheetJS'in kendi CDN'inden
  0.20.x, ya da `exceljs`.
- `@tiptap/*`: `npm audit fix` ile çözülür (prototype pollution / ReDoS).
- `prisma` altındaki `hono`, `valibot`, `mysql2` vb.: **yalnız CLI/dev araçları**,
  runtime'a girmiyor; `prisma` major sürümüyle gelir, acil değil.

### ORTA

**O1 — Cron uçları `CRON_SECRET` yoksa fail-open.**
`app/api/cron/xml-sync/route.ts:20`, `app/api/cron/trendyol-sync/route.ts:29`,
`app/api/pdks/cron/reminders/route.ts:45`. Env eksikse DB yazan uçlar herkese açık;
karşılaştırma sabit zamanlı değil. (PDKS.md'de D1 olarak zaten açık.)
Düzeltme: secret yoksa 503; `crypto.timingSafeEqual`.

**O2 — Sanitizer'sız `dangerouslySetInnerHTML`.**
`app/(app)/products/[id]/page.tsx:519`, kaynak `product.description`. Tiptap'tan
(PRODUCTS_UPDATE yetkili) ve **tedarikçi XML feed'inden** (`xml-sync-actions.ts:239`,
`<aciklama>`) geliyor → tedarikçi feed'i üzerinden admin paneline stored XSS.
Düzeltme: `isomorphic-dompurify` veya `sanitize-html` ile yazarken ve/veya render'da temizle.

**O3 — PDKS oturumu DB ile yeniden doğrulanmıyor.**
`lib/pdks/auth.ts:35-44`, `lib/pdks/session.ts:32-36`. 7 günlük JWT'deki rol/kimlik
her istekte DB'den kontrol edilmiyor; personeli pasife alma, tenant_admin düşürme,
cihaz sıfırlama mevcut oturumları düşürmüyor. CRM tarafı (`lib/auth.ts`) bunu yapıyor.

**O4 — Self-servis tenant kaydı (`/kayit`) rate limit/CAPTCHA'sız, şifre min 6.**
`lib/actions/pdks-register-actions.ts:28-68`. Sınırsız tenant + admin üretimi.
Turnstile bileşeni artık mevcut; aynı widget buraya da takılabilir.

**O5 — `getCurrentSession` DB hatasında yetki override'larını kaybediyor.**
`lib/auth.ts:123-132`: permissions sorgusu hata verirse `userPermissions: []` ile
devam ediyor → kullanıcıya özel **deny** kayıtları geçici olarak yok sayılır.
Düzeltme: yalnız "tablo yok" (P2021) hatasında fallback, diğerlerinde throw.

**O6 — CRM ve PDKS JWT'leri aynı `SESSION_SECRET`'ı `aud`/`iss` olmadan kullanıyor.**
Bugün payload şekilleri farklı olduğu için çapraz kullanılamıyor; `aud` eklenmeli.

**O7 — Bellek içi hız sınırlayıcılar örnek başına.**
`lib/login-rate-limit.ts` ve `api/public/image-search` sayaçları Vercel örnekleri
arasında paylaşılmıyor. Kalıcı çözüm: DB/KV tabanlı sayaç veya Vercel Firewall rate limit kuralı.

### DÜŞÜK

- **D1** `lib/actions/product-image-actions.ts:151`: `file.type` istemciden geliyor (magic byte yok), `ext` ham dosya adından (`/`, `..`, `svg` geçebilir) public bucket'a yazılıyor.
- **D2** `app/api/marketplace/trendyol-finance/import/route.ts:74`: ham `e.message` istemciye dönüyor; 40×15 MB kabul.
- **D3** `app/api/public/image-search/route.ts:122`: anonim uçta upstream hata mesajı sızıyor.
- **D4** `app/c/[token]/interest/route.ts`: token'lı anonim uçta rate limit yok, `productId` doğrulanmıyor.
- **D5** `app/t/[slug]/sw.js/route.ts`: `slug` doğrulanmadan JS gövdesine interpolasyon; `SLUG_RE` ile doğrula, bilinmeyen tenant → 404.
- **D6** `app/api/pdks/push/unsubscribe/route.ts:19`: `deleteMany` `personnelId` ile kısıtlanmamış.
- **D7** `app/(app)/layout.tsx:537`: `/no-access` yönlendirmesi `(app)` içinde → döngü riski.
- **D8** Birçok action ham `err.message` döndürüyor (Prisma detayları): `bulk-import/route.ts:143`, `xml-sync-actions.ts:434`, `inventory-count-actions.ts:106`, `purchase-order-actions.ts:102`, `trendyol-return-actions.ts:48,113`.
- **D9** `api/public/lookup`: anonim, kısıtsız tam katalog (isim/SKU/barkod/stok) — bilinçli, ama scraping riski.
- **D10** `scripts/.dump.ts` untracked ama gitignore'da değil; yanlışlıkla commit edilebilir.

## Doğrulanıp temiz bulunanlar

- `proxy.ts` prefix listesi eksik olsa da `app/(app)/layout.tsx:501` `requireUser()` çağırıyor; tüm `(app)` sayfaları korunuyor. `/admin/pdks/*` sayfaları `requirePermission(PDKS_MANAGE)`.
- Tenant-admin paneli `/t/{slug}/yonetim`: `requireTenantAdminFor(slug)` + tenant-scope'lu `prismaPdks` (fail-closed).
- 150 server action incelendi; Y1/Y2'dekiler dışında hepsi `requireUser`/`checkPermission`/`requirePermission`/`isOwner`/`requireTenantAdminFor` ile korunuyor.
- Ham SQL: tüm `$queryRaw`/`$executeRaw` tagged template / `Prisma.sql` (parametreli). `$queryRawUnsafe` yalnız bakım scriptlerinde.
- `eval`/`new Function` yok; open-redirect deseni yok.
- `.env*` hiç commit edilmemiş (geçmiş dahil); `SUPABASE_SERVICE_ROLE_KEY` yalnız sunucuda okunuyor.
- Oturum çerezi `httpOnly` + `sameSite=lax` + production'da `secure`; JWT HS256, 7 gün.

## Önerilen sıra

1. `next@16.3.5` yükselt (K1) — aynı gün.
2. Hepsiburada şifresini değiştir, `scripts/hepsiburada-probe.ts`'i kaldır (K2) — aynı gün.
3. `runSync`'i actions modülünden çıkar (Y1); auth'suz okuma action'larını kapat (Y2).
4. PDKS login limiter + PIN 6 + tek tip 401 (Y3); `/kayit`'a Turnstile (O4).
5. Cron fail-closed (O1); description sanitize (O2); PDKS oturum DB kontrolü (O3).
6. `npm audit fix` (tiptap, fast-uri, nanoid) + `sharp@0.35.4` ayrı PR.
