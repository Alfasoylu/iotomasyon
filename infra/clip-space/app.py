"""CLIP image embedding micro-service for iotomasyon CRM (Phase 91).

POST /embed (multipart) -> { embedding: [512 floats], dim: 512 }
GET  /                  -> { status, model, dim }

Model lazy-loads on first request to keep cold-start lighter.
"""

import io
import threading
from typing import Optional

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

MODEL_ID = "openai/clip-vit-base-patch32"
EMBED_DIM = 512

app = FastAPI(title="CLIP Embedder")

_model: Optional[CLIPModel] = None
_processor: Optional[CLIPProcessor] = None
_load_lock = threading.Lock()


def _ensure_loaded() -> None:
    global _model, _processor
    if _model is not None and _processor is not None:
        return
    with _load_lock:
        if _model is None or _processor is None:
            print(f"[clip] loading {MODEL_ID}", flush=True)
            _processor = CLIPProcessor.from_pretrained(MODEL_ID)
            m = CLIPModel.from_pretrained(MODEL_ID)
            m.eval()
            _model = m
            print("[clip] loaded", flush=True)


@app.get("/")
def root():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "dim": EMBED_DIM,
        "loaded": _model is not None,
    }


@app.post("/embed")
async def embed(image: UploadFile = File(...)):
    _ensure_loaded()
    try:
        data = await image.read()
        if not data:
            raise HTTPException(400, "empty image")
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"bad image: {exc}")

    with torch.no_grad():
        inputs = _processor(images=img, return_tensors="pt")  # type: ignore[union-attr]
        feats = _model.get_image_features(**inputs)  # type: ignore[union-attr]
        feats = feats / feats.norm(dim=-1, keepdim=True)

    vec = feats[0].cpu().tolist()
    if len(vec) != EMBED_DIM:
        raise HTTPException(500, f"unexpected dim {len(vec)}")
    return {"embedding": vec, "dim": EMBED_DIM}
