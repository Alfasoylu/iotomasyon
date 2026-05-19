# Görselle Ürün Arama — CLIP + pgvector

Phase 91 ile devreye alınan **görselle ürün arama** akışının kalıcı dökümü.
Bu dosya gelecekteki geliştiricinin (veya 6 ay sonraki size) sistemi
yanlışlıkla bozmasına engel olmak için yazılmıştır. Sistemin **çalışan ve
test edilmiş** halini yansıtır; mimari karar geçmişi için `docs/CHANGELOG.md`
→ Phase 91'e bakın.

---

## 1. Neyi çözer?

Depo personeli telefonla bir ürün fotoğrafı çekip "bu hangi ürün?" diye
sorabilsin. iotomasyon.com kök Depo Arama ekranındaki 📷 butonu bu akışı
açar — metin araması (ad/SKU/barkod) yetersiz kaldığı durumlar için.

Public, login gerektirmeyen bir akıştır; fiyat/maliyet/marj **asla**
dönmez (Codex P0 data contract).

---

## 2. Sistem haritası

```
[Telefon kamera]
      │
      ▼  multipart image (JPEG/PNG/WebP ≤4MB)
[Vercel] POST /api/public/image-search
      │       ↑ 10 req/dk/IP rate-limit (in-memory)
      │       ↑ runtime=nodejs, maxDuration=60s
      ▼
[Hugging Face Space] https://iotomasyon-clip-embed.hf.space/embed
      │       ↑ CPU Basic Free tier, FastAPI + transformers
      │       ↑ openai/clip-vit-base-patch32 → 512-dim L2-normalize
      ▼ embedding (512 float)
[Supabase Postgres]
      │       ↑ pgvector extension v0.8.0
      │       ↑ ProductImage.embedding vector(512) + HNSW index
      ▼ cosine distance, DISTINCT ON productId, en yakın 20
[JSON response]
      └─→ Browser similarity rozet + kart listesi
```

**4 katman**: kamera → Vercel route → HF Space → Postgres. Hiçbiri için
ek bir servis/abonelik yoktur. Toplam aylık maliyet **0 ₺**.

---

## 3. Env vars (Vercel)

| Key | Zorunlu | Değer | Açıklama |
|-----|---------|-------|----------|
| `CLIP_SPACE_URL` | Evet | `https://iotomasyon-clip-embed.hf.space` | Space'in public base URL'i. Sonunda `/` olmamalı; `/embed` kod tarafında eklenir. Local dev için yine bu URL kullanılır (Space herkese açık). |
| `HF_TOKEN` | Hayır | `hf_…` | Space **PUBLIC** olduğu sürece gereksizdir. `lib/hf-clip.ts` set olunca `Authorization: Bearer …` ekler; değilse atlar. Space ileride PRIVATE'a alınırsa zorunlu olur. **Silmeyin** — env'de durabilir, side effect yok. |

Local dev için `.env.local` içine `CLIP_SPACE_URL` eklemek yeterli. DB'de
embedding zaten doluysa local'de de görsel arama çalışır.

---

## 4. Hugging Face Space

| | |
|---|---|
| Repo (HF) | `iotomasyon/clip-embed` |
| URL | https://huggingface.co/spaces/iotomasyon/clip-embed |
| Endpoint | https://iotomasyon-clip-embed.hf.space |
| SDK | Docker (port 7860) |
| Tier | CPU Basic — **ücretsiz** |
| Model | `openai/clip-vit-base-patch32` (512-dim) |
| Kaynak (repo'da) | [`infra/clip-space/`](../infra/clip-space/) — Dockerfile, app.py, requirements.txt, README.md |

**Önemli**: Space ayrı bir git repo'dur (HF Spaces). `infra/clip-space/`
sadece **referans kopyası**dır — burayı değiştirmek Space'i etkilemez.
Space'i yeniden deploy etmek için adımlar: [`infra/clip-space/README.md`](../infra/clip-space/README.md).

### Cold start davranışı

- İlk request: ~10-30 sn (PyTorch model lazy-load)
- Sonraki requestler: ~500ms-3sn (warm)
- 48 saat idle sonrası uyuyabilir; bir request tekrar uyandırır
- Vercel route 55 sn `AbortController` timeout uygular; bu sınır
  geçilirse istemciye 503 + "Görsel servisi şu anda meşgul" döner

### Sağlık kontrolü

```bash
curl https://iotomasyon-clip-embed.hf.space/
# → {"status":"ok","model":"openai/clip-vit-base-patch32","dim":512,"loaded":true|false}
```

`loaded: false` ise model henüz indirilmemiş — bir `/embed` request'i
tetikler.

---

## 5. Database

### pgvector extension

Supabase Postgres üzerinde **manuel olarak aktive edilmiştir** (Supabase
MCP üzerinden `CREATE EXTENSION IF NOT EXISTS vector` çalıştırıldı, v0.8.0).
Migration dosyası bu komutu içerir ama prod DB zaten enable'dı — `prisma
migrate deploy` re-run güvenli (`IF NOT EXISTS`).

DB reset / yeniden kurulum senaryosunda: migration dosyası tek başına
yeterli; ekstra manuel adım gerekmez.

### ProductImage.embedding

| Alan | Tip | Not |
|---|---|---|
| `embedding` | `vector(512)` | Prisma'da `Unsupported("vector(512)")?` olarak tanımlı (Prisma client doğrudan okumaz/yazmaz — `$queryRaw` ile manipüle edilir) |
| Index | HNSW, `vector_cosine_ops` | Approximate nearest neighbor için. Backfill sırasında index güncellenir; performans için ayrı işlem gerekmez. |

Migration: [`prisma/migrations/20260520000000_phase91_image_embeddings/migration.sql`](../prisma/migrations/20260520000000_phase91_image_embeddings/migration.sql)

### Mevcut durumu sorgula

```sql
SELECT
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS done,
  COUNT(*) FILTER (WHERE embedding IS NULL)     AS pending,
  COUNT(*)                                       AS total
FROM "ProductImage";
```

---

## 6. Backfill (tek seferlik)

Script: [`scripts/backfill-image-embeddings.ts`](../scripts/backfill-image-embeddings.ts)

```bash
# Tüm pending görseller için
CLIP_SPACE_URL=https://iotomasyon-clip-embed.hf.space \
DATABASE_URL=postgres://... \
DIRECT_URL=postgres://... \
  npx tsx scripts/backfill-image-embeddings.ts

# Limit ve daha uzun bekleme (rate-limit korkuyorsanız)
npx tsx scripts/backfill-image-embeddings.ts --limit=100 --sleep=500
```

Script **idempotent**: `WHERE embedding IS NULL` ile çalışır, başarılı
embedding'leri tekrar denemez. Başarısız olanları (image fetch 404,
Space 5xx) sadece log'lar, devam eder — script yeniden çalıştırılınca
o satırlar yeniden denenir.

Tipik tempo: ~1 görsel/sn (200ms sleep + ~800ms Space inference). ~5000
ürün görseli için ~2-2.5 saat. Background'da çalıştırmak güvenlidir.

### Stale CDN URL'leri

xmlbankasi.com gibi tedarikçi görselleri 404 dönebilir. Backfill bunları
sadece skip eder; ürün diğer ProductImage kayıtları varsa onlardan
embed alınır.

---

## 7. Vercel endpoint

[`app/api/public/image-search/route.ts`](../app/api/public/image-search/route.ts)

| | |
|---|---|
| Method | `POST` multipart, field `image` |
| Runtime | `nodejs` (Buffer + pgvector binary için zorunlu) |
| maxDuration | 60s (HF cold-start için pay) |
| Allowed types | `image/jpeg`, `image/png`, `image/webp` |
| Max size | 4 MB |
| Rate-limit | 10 req/dk/IP (in-memory; serverless cold-start'ta sıfırlanır) |
| Yetki | YOK (public, `/api/public/lookup` ile aynı pattern) |
| Response | `{ products: [{ id, name, sku, barcode, stockQuantity, minimumStock, imageUrl, similarity }] }` |

### Veri akışı

1. Multipart parse → Blob → Buffer
2. `embedImage(buffer, contentType)` → 512-dim normalize vec
3. `toVectorLiteral(vec)` → `'[0.1,0.2,...]'` string
4. `$queryRaw`: `pi.embedding <=> $1::vector` cosine distance, `DISTINCT ON productId`, order asc limit 200
5. JS sort + slice(0, 20)
6. `similarity = 1 - distance`

---

## 8. UI

[`components/public/depo-search.tsx`](../components/public/depo-search.tsx)

- Metin input'unun sağında 📷 butonu
- Mobile: `capture="environment"` → arka kamera tetiklenir
- Yükleme sırasında amber banner: "İlk arama 20-30 saniye sürebilir (model uyanıyor)."
- Her kartta `%XX` benzerlik rozeti
- "✕ Kaldır" → metin aramasına geri dön
- Fiyat/maliyet asla render edilmez

---

## 9. Sorun giderme

| Belirti | Olası neden | Çözüm |
|---|---|---|
| Browser'da "Görsel servisi şu anda meşgul" 503 | Space uyuyor, ilk request 55s timeout'u aştı | 30 sn bekle, tekrar dene. İkinci istek warm'a denk gelir. |
| `CLIP_SPACE_URL env yok` 500 | Vercel env eksik | `vercel env add CLIP_SPACE_URL` → redeploy |
| HF Space `/` health 503 | Space çökmüş veya restart oluyor | https://huggingface.co/spaces/iotomasyon/clip-embed → Logs → restart |
| `Beklenmeyen yanıt: dim=…` | Model değişti veya bozuldu | `infra/clip-space/app.py` `MODEL_ID` ve `EMBED_DIM` doğrulayın. **Model boyutunu değiştirmek migration gerektirir** (madde 10'a bakın) |
| Backfill `HfEmbedError: 503` flood | Space cold start ya da OOM | Script otomatik 30s bekler; sürekli ise Space restart |
| Browser'da arka kamera açılmıyor | iOS Safari + getUserMedia kısıtı | File picker fallback çalışır (capture attribute hint, zorunluluk değil) |
| `pi.embedding <=> ... operator does not exist` | pgvector extension yok | `CREATE EXTENSION IF NOT EXISTS vector;` çalıştır (Supabase SQL editor) |

---

## 10. ⚠ Bozmamak için "yapma" listesi

Aşağıdakiler **bilerek seçilmiş** mimari kararlardır. Değiştirmek için
önce buradaki "neden" notunu okuyun:

### 10.1. HF Inference API'a geri DÖNMEYİN

HF'in `api-inference.huggingface.co` ve yeni `router.huggingface.co`
endpoint'leri `openai/clip-vit-base-patch32` modelini **2026 başında
deprecate etti** (`"Model not supported by provider hf-inference"`).
Phase 91 changelog'unda iki başarısız endpoint denemesi belgeli
(commit `3f46be9`, `ff565e7`). Self-hosted Space tek geçerli yoldur.

Eğer "daha basit" diye `@huggingface/inference` paketini koymak
isterseniz: çalışmaz. Önce HF'in CLIP'i tekrar Inference API'da
desteklediğinden emin olun (deneme: `curl -X POST … router.huggingface.co/openai/clip-vit-base-patch32 …`).

### 10.2. Model boyutunu değiştirmeyin (512 → başka)

`ProductImage.embedding` `vector(512)` olarak tanımlı + HNSW index 512
üzerine kurulu. Modeli `clip-vit-large` (768-dim) gibi değiştirirseniz:
- `ALTER COLUMN` ile boyut değişmez — drop + recreate gerekir
- Tüm 5000+ embedding'i **sıfırdan** backfill etmek gerekir (~2-3 saat)
- HNSW index drop + recreate gerekir

Yapacaksanız ayrı bir migration phase açın; in-place değişiklik
production'ı bozar.

### 10.3. `HF_TOKEN` env var'ı silmeyin

Şu an public Space olduğu için kullanılmıyor. Ama Space ileride PRIVATE
yapılırsa (örn. Space'i quota altına almak için), `lib/hf-clip.ts`
otomatik olarak `Authorization` header ekler. Token var olduğu sürece
gereksiz yere fail etmez — yokken Space private'a alınırsa 401 başlar.

### 10.4. Rate-limit'i veritabanına taşımayın

In-memory `Map` cold-start'ta sıfırlanır — kararlı kota değil. Bu
**bilinçli** bir karar: asıl koruma Space'in CPU kuyruğu + Vercel
function timeout. DB-backed rate-limit complexity getirir, mevcut abuse
seviyesi yok.

### 10.5. Backfill script'ini "auto-cron" yapmayın

Tek seferliktir. Yeni ProductImage eklendiğinde (XML sync veya manuel
yükleme) embedding **NULL** kalır — bir sonraki backfill çalıştırması
yakalar. Otomasyon istiyorsanız ya `xml-sync-actions.ts` içine inline
embed çağırın, ya da gerçekten cron yazın; **iki yol bir arada olmasın**.

### 10.6. `pi.embedding <=> $1::vector` cosine operator'unü değiştirmeyin

pgvector 3 operator sunar: `<=>` cosine, `<#>` inner product, `<->` L2.
CLIP embedding'leri **L2-normalize** edildiği için cosine ve inner
product matematiksel olarak eşdeğer; ama HNSW index `vector_cosine_ops`
ile kurulu — operator değişirse index kullanılmaz, full scan olur.

### 10.7. `Unsupported("vector(512)")` Prisma type'ını değiştirmeyin

Prisma 6+ pgvector için native type sunmuyor. `Bytes` veya `String`
yapmak yanlış sonuç verir. Daima `$queryRaw` + string literal
(`'[0.1,…]'::vector`) kullanın.

---

## 11. Maliyet

| | Aylık |
|---|---|
| HF Space (CPU Basic) | **0 ₺** |
| Vercel function calls | mevcut Vercel quota içinde |
| Supabase storage (pgvector ~10MB) | mevcut Supabase quota içinde |
| HF Inference API | YOK (kullanılmıyor) |
| **Toplam** | **0 ₺** |

Eğer kullanım büyürse (Space dakikada 10+ request alıyorsa) HF Space'i
**CPU Upgrade** ($0.03/saat) veya **GPU Basic** ($0.40/saat) tier'ına
geçirmek mümkün — fiyat-performans hesabı yeniden yapılmalı.

---

## 12. Phase 91 commit zinciri

| Commit | Açıklama |
|---|---|
| `fdd785d` | İlk plan — HF Inference API (deprecate olmuş, terkedildi) |
| `bc77637` | Changelog ilk taslak |
| `3f46be9` | HF endpoint swap (api-inference ↔ router) — ikisi de fail |
| `ff565e7` | **Self-hosted Space migration** (asıl çözüm) |
| `4c347df` | Backfill script PrismaPg adapter fix |
| `26a495f` | Changelog final revize |
