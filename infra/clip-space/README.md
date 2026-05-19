---
title: CLIP Embedder
emoji: 📸
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# CLIP Image Embedder (iotomasyon)

FastAPI servisi: `openai/clip-vit-base-patch32` ile 512-dim normalize edilmiş
görsel embedding üretir. Hugging Face Inference API'nin bu modeli ücretsiz
sağlamayı bıraktığı için iotomasyon CRM'in görsel ürün araması için
self-hosted CPU Space.

> **Bu klasör hakkında**: Bu dizin (`infra/clip-space/`) iotomasyon
> monorepo'sundaki **referans kopyadır**. Çalışan Space ayrı bir HF git
> repo'sundadır — buradaki dosyaları değiştirmek production Space'i
> etkilemez. Yeniden deploy için aşağıdaki "Redeploy" bölümüne bakın.
>
> Sistemin tamamı için: [`docs/CLIP-IMAGE-SEARCH.md`](../../docs/CLIP-IMAGE-SEARCH.md).

## Endpoint

- Live URL: https://iotomasyon-clip-embed.hf.space
- HF Space: https://huggingface.co/spaces/iotomasyon/clip-embed

## API

`POST /embed` (multipart/form-data)
- field: `image` = JPEG/PNG/WebP binary (en fazla 4 MB)

Yanıt:
```json
{ "embedding": [0.013, -0.041, ...], "dim": 512 }
```

`GET /` health check:
```json
{ "status": "ok", "model": "openai/clip-vit-base-patch32", "dim": 512, "loaded": true }
```

## Cold-start

İlk request modeli yüklemek için ~10-30s sürer. Sonraki çağrılar ~500ms-3s.
Space ücretsiz CPU tier ile 48 saatlik idle'dan sonra uyuyabilir; bir
istek tekrar uyandırır.

## Redeploy (HF Space'e push)

1. HF Space repo'sunu klonla (ilk seferse):
   ```bash
   git clone https://huggingface.co/spaces/iotomasyon/clip-embed clip-embed-space
   cd clip-embed-space
   ```
   Auth: HF token (write yetkili) ile HTTPS, veya SSH key (HF profile → SSH keys).

2. Bu klasördeki dosyaları HF repo'suna kopyala:
   ```bash
   cp /path/to/iotomasyon/infra/clip-space/{Dockerfile,app.py,requirements.txt,README.md} .
   git add -A
   git commit -m "update: …"
   git push
   ```

3. HF Space otomatik build başlatır (~3-5 dakika). Logs:
   https://huggingface.co/spaces/iotomasyon/clip-embed/logs

4. Build OK olunca `/` health endpoint'ini doğrula:
   ```bash
   curl https://iotomasyon-clip-embed.hf.space/
   ```

## Local test (opsiyonel)

```bash
docker build -t clip-embed .
docker run -p 7860:7860 clip-embed
# Ayrı terminal:
curl -F "image=@test.jpg" http://localhost:7860/embed
```

## ⚠ Değiştirmeyin

- `MODEL_ID = "openai/clip-vit-base-patch32"` — 512-dim üretir; DB schema
  (`vector(512)` + HNSW index) ve istemci kodu buna bağlı. Model değişimi
  full backfill ve migration gerektirir.
- `EMBED_DIM = 512` — aynı sebep.
- `app_port: 7860` — HF Spaces standardı.
