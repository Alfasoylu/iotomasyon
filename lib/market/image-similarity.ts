import { embedImage } from "@/lib/hf-clip";
import { MARKET_FETCH_HOSTS, safeFetch } from "./safe-fetch";
import type { Db } from "./store";

// Reuses the existing CLIP pipeline (lib/hf-clip.ts → ProductImage.embedding, 512-d, cosine). An external image (allowlisted host only)
// is embedded and compared with ALFAS product images. The similarity is EVIDENCE for matching.ts — never an exact-match verdict by itself.
// Future China-sourcing images can be compared in the same space once their hosts are reviewed and added to the allowlist.
export const IMAGE_HOSTS = [...MARKET_FETCH_HOSTS.trendyolImages] as const;

export async function embedExternalImage(url: string, deps: { fetcher?: typeof safeFetch; embed?: typeof embedImage } = {}): Promise<number[]> {
  const r = await (deps.fetcher ?? safeFetch)(url, { allowedHosts: IMAGE_HOSTS, timeoutMs: 15_000, maxBytes: 4_000_000,
    allowedContentTypes: ["image/jpeg", "image/png", "image/webp"], headers: { "User-Agent": "iotomasyon-market-scout/1.0" } });
  if (r.status !== 200) throw new Error(`image_http_${r.status}`);
  const ct = (r.headers["content-type"] ?? "image/jpeg").split(";")[0];
  return (deps.embed ?? embedImage)(r.body, ct);
}

const vectorLiteral = (v: number[]) => {
  if (v.length !== 512 || !v.every(Number.isFinite)) throw new Error("embedding_invalid");
  return `[${v.join(",")}]`;
};
/** Nearest ALFAS products by image (cosine similarity = 1 − distance). */
export async function nearestAlfasByImage(db: Db, embedding: number[], limit = 5) {
  const lit = vectorLiteral(embedding);
  const rows = (await db.query<{ product_id: string; sku: string; name: string; distance: number }>(`select distinct on (pi."productId") pi."productId" as product_id,
      p.sku, p.name, (pi.embedding <=> $1::vector)::float8 as distance from public."ProductImage" pi join public."Product" p on p.id = pi."productId"
    where pi.embedding is not null and p."isActive" order by pi."productId", pi.embedding <=> $1::vector limit 500`, [lit])).rows;
  return rows.sort((a, b) => a.distance - b.distance).slice(0, Math.max(1, Math.min(limit, 20)))
    .map(r => ({ productId: r.product_id, sku: r.sku, name: r.name, similarity: Math.round((1 - Number(r.distance)) * 1000) / 1000 }));
}
