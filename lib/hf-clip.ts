/**
 * CLIP Image Embedding Client (Phase 91)
 *
 * Görsel ürün araması için 512-boyutlu normalize edilmiş CLIP embedding
 * üretir. iotomasyon/clip-embed Hugging Face Space'inde host edilen
 * FastAPI servisini kullanır (CPU Basic / Free tier).
 *
 * Neden self-hosted Space?
 *   HF Inference Providers'ın yeni router'ı `openai/clip-vit-base-patch32`
 *   modelini "Model not supported by provider hf-inference" ile reddediyor;
 *   yani HF Free Tier'da artık model çağrılamıyor. Bunun yerine kendi CPU
 *   Space'imizde aynı modeli host ediyoruz — ücretsiz, sınırsız çağrı, tek
 *   maliyet cold-start gecikmesi (~10-30s).
 *
 * Env:
 *   CLIP_SPACE_URL   — örn. https://iotomasyon-clip-embed.hf.space
 *                      (sonunda / olmaz; /embed endpoint'ine POST yapılır)
 *   HF_TOKEN         — Opsiyonel. Space PUBLIC ise gerekmez. Space PRIVATE
 *                      ise Authorization: Bearer ${HF_TOKEN} ile gönderilir.
 *
 * Cold start: ilk request 10-30s (model lazy-load). Sonraki 1-3s.
 */

const SPACE_PATH = "/embed";

export class HfEmbedError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`CLIP embed failed: ${status} ${body.slice(0, 200)}`);
    this.name = "HfEmbedError";
  }
}

/**
 * Tek görseli CLIP Space üzerinden 512-dim normalize edilmiş embedding'e
 * çevirir. Cold-start için 60s'lik bir AbortController timeout uygular.
 */
export async function embedImage(
  imageBuffer: Buffer | Uint8Array,
  contentType: string = "image/jpeg",
): Promise<number[]> {
  const base = process.env.CLIP_SPACE_URL?.replace(/\/$/, "");
  if (!base) throw new HfEmbedError(0, "CLIP_SPACE_URL env yok");

  const body = imageBuffer instanceof Buffer ? imageBuffer : Buffer.from(imageBuffer);
  const formData = new FormData();
  formData.append(
    "image",
    new Blob([new Uint8Array(body)], { type: contentType }),
    "image.jpg",
  );

  const headers: Record<string, string> = {};
  if (process.env.HF_TOKEN) {
    headers.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  let res: Response;
  try {
    res = await fetch(`${base}${SPACE_PATH}`, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HfEmbedError(504, "CLIP Space cevap vermedi (55s timeout — cold start?)");
    }
    throw new HfEmbedError(0, err instanceof Error ? err.message : "fetch failed");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HfEmbedError(res.status, text);
  }

  const data = (await res.json()) as { embedding?: number[]; dim?: number };
  const vec = data?.embedding;
  if (!Array.isArray(vec) || vec.length !== 512) {
    throw new HfEmbedError(
      res.status,
      `Beklenmeyen yanıt: dim=${vec?.length ?? "n/a"}`,
    );
  }
  return vec;
}

/**
 * pgvector için string formatına çevirir: '[0.1,0.2,...]'.
 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
