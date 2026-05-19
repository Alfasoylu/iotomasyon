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

## Kullanım

`POST /embed` (multipart/form-data)
- field: `image` = JPEG/PNG/WebP binary (en fazla 4 MB)

Yanıt:
```json
{ "embedding": [0.013, -0.041, ...], "dim": 512 }
```

`GET /` health check.

## Cold-start

İlk request modeli yüklemek için ~10-30s sürer. Sonraki çağrılar ~500ms.
Space ücretsiz CPU tier ile 48 saatlik idle'dan sonra uyuyabilir; bir
istek tekrar uyandırır.
