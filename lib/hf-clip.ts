/**
 * Hugging Face CLIP Image Embedding Client (Phase 91)
 *
 * Görsel ürün araması için 512-boyutlu CLIP embedding üretir.
 * Provider: Hugging Face Inference API (free tier).
 * Model: openai/clip-vit-base-patch32 (image-feature-extraction pipeline).
 *
 * Env: HF_TOKEN (Hugging Face Settings → Access Tokens → Read-level).
 *
 * Cold start (free tier): ilk sorgu 20-30s; sonraki 1-3s. Çağıran taraf
 * bu süreyi UI'da kullanıcıya açıkça gösterir.
 */

const HF_ENDPOINT =
  "https://router.huggingface.co/hf-inference/models/openai/clip-vit-base-patch32/pipeline/image-feature-extraction";

const FALLBACK_ENDPOINT =
  "https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32";

export class HfEmbedError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`HF embed failed: ${status} ${body.slice(0, 200)}`);
    this.name = "HfEmbedError";
  }
}

/**
 * Tek görseli HF Inference üzerinden 512-dim CLIP embedding'ine çevirir.
 * `imageBuffer`: jpeg/png/webp binary. `contentType`: MIME tip.
 *
 * Cold-start durumunda HF API 503 "loading" döndürebilir; bu durumda
 * x-wait-for-model header ile yeniden dener.
 */
export async function embedImage(
  imageBuffer: Buffer | Uint8Array,
  contentType: string = "image/jpeg",
): Promise<number[]> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new HfEmbedError(0, "HF_TOKEN env yok");

  const body = imageBuffer instanceof Buffer ? imageBuffer : Buffer.from(imageBuffer);

  // İlk deneme: yeni Inference Providers router endpoint'i
  let res = await fetch(HF_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "x-wait-for-model": "true",
    },
    body,
  });

  // 404 fallback: eski api-inference endpoint
  if (res.status === 404) {
    res = await fetch(FALLBACK_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
        "x-wait-for-model": "true",
      },
      body,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HfEmbedError(res.status, text);
  }

  const data = await res.json();
  // Yanıt şekli olası varyantlar:
  //   [0.1, 0.2, ...]                 (düz array, 512 float)
  //   [[0.1, 0.2, ...]]               (batch boyutu 1 ile sarılı)
  //   { embedding: [...] }            (bazı pipeline'lar)
  const arr = Array.isArray(data)
    ? Array.isArray(data[0]) ? data[0] : data
    : data?.embedding ?? null;

  if (!Array.isArray(arr) || arr.length !== 512) {
    throw new HfEmbedError(
      res.status,
      `Beklenmeyen yanıt boyutu: ${Array.isArray(arr) ? arr.length : typeof arr}`,
    );
  }
  return arr as number[];
}

/**
 * pgvector için string formatına çevirir: '[0.1,0.2,...]'.
 * SQL'e $queryRaw ile cast: 'literal::vector'.
 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
