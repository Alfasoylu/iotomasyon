/**
 * Phase 91 — Image Embedding Backfill (self-hosted CLIP Space)
 *
 * Tüm ProductImage kayıtlarını iotomasyon/clip-embed Hugging Face
 * Space'inde host edilen CLIP modeli üzerinden embed eder ve pgvector
 * kolonuna yazar. Tek seferlik (re-run idempotent: NULL olanları tekrar
 * dener).
 *
 * Çalıştırma:
 *   CLIP_SPACE_URL=https://iotomasyon-clip-embed.hf.space \
 *   DATABASE_URL=postgres://... DIRECT_URL=postgres://... \
 *     npx tsx scripts/backfill-image-embeddings.ts [--limit=N]
 *
 * Space CPU Basic free tier — rate-limit yok ama eş zamanlılık 1. Script
 * her görselden sonra 200ms bekler.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { embedImage, toVectorLiteral, HfEmbedError } from "@/lib/hf-clip";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or DIRECT_URL env required");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const ARGS = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
) as Record<string, string>;

const LIMIT = ARGS.limit ? parseInt(ARGS.limit, 10) : Number.MAX_SAFE_INTEGER;
const SLEEP_MS = ARGS.sleep ? parseInt(ARGS.sleep, 10) : 200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Image fetch ${res.status} ${url}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function main() {
  console.log("[backfill] Phase 91 image embedding backfill");
  console.log(`[backfill] CLIP_SPACE_URL: ${process.env.CLIP_SPACE_URL ?? "MISSING"}`);
  console.log(`[backfill] LIMIT: ${LIMIT === Number.MAX_SAFE_INTEGER ? "all" : LIMIT}`);
  console.log(`[backfill] SLEEP_MS: ${SLEEP_MS}`);

  if (!process.env.CLIP_SPACE_URL) {
    console.error("CLIP_SPACE_URL env required");
    process.exit(1);
  }

  // Pending: embedding IS NULL ve url not null
  const pending = await prisma.$queryRaw<Array<{ id: string; url: string }>>`
    SELECT id, url
    FROM "ProductImage"
    WHERE embedding IS NULL
      AND url IS NOT NULL
    ORDER BY "createdAt" ASC
    LIMIT ${LIMIT}
  `;

  console.log(`[backfill] pending: ${pending.length} rows`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    const progress = `[${i + 1}/${pending.length}]`;
    try {
      const { buffer, contentType } = await fetchImageBuffer(row.url);
      const embedding = await embedImage(buffer, contentType);
      const literal = toVectorLiteral(embedding);
      await prisma.$executeRaw`
        UPDATE "ProductImage"
        SET embedding = ${literal}::vector
        WHERE id = ${row.id}
      `;
      success++;
      if ((i + 1) % 10 === 0 || i === pending.length - 1) {
        console.log(`${progress} OK (success=${success}, failed=${failed})`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${progress} FAIL ${row.id}: ${msg.slice(0, 150)}`);
      // Cold start veya 429 ise daha uzun bekle
      if (err instanceof HfEmbedError && (err.status === 503 || err.status === 429)) {
        console.log(`[backfill] backing off 30s for ${err.status}…`);
        await sleep(30000);
      }
    }
    await sleep(SLEEP_MS);
  }

  console.log(`[backfill] DONE: success=${success}, failed=${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[backfill] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});
