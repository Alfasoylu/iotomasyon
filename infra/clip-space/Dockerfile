# Phase 91 — CLIP Image Embedder Space (CPU-only)
# Build context: infra/clip-space/
# HF Spaces port 7860 zorunludur.

FROM python:3.11-slim

# HF Spaces non-root user 1000:1000 standardına saygı göster
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/code/.cache \
    TRANSFORMERS_CACHE=/code/.cache \
    TORCH_HOME=/code/.cache

WORKDIR /code

# Önce requirements (cache friendly), CPU-only torch
COPY requirements.txt .
RUN pip install --no-cache-dir \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      -r requirements.txt

# Uygulama
COPY app.py .

# Cache dizinine yazabilsin
RUN mkdir -p /code/.cache && chmod -R 777 /code/.cache

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
