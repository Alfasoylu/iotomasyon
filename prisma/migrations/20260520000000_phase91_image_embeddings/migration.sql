-- Phase 91: Image embeddings for CLIP-based visual product search
--
-- Adds pgvector extension and a 512-dim embedding column to ProductImage.
-- Populated by scripts/backfill-image-embeddings.ts via Hugging Face
-- Inference API (openai/clip-vit-base-patch32, image-feature-extraction).
--
-- Query path (public /api/public/image-search) computes cosine distance
-- against this column with HNSW index for sub-second nearest-neighbor lookup.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "ProductImage" ADD COLUMN "embedding" vector(512);

-- HNSW index for approximate nearest neighbor (cosine distance)
CREATE INDEX "ProductImage_embedding_hnsw_idx"
  ON "ProductImage"
  USING hnsw ("embedding" vector_cosine_ops);
