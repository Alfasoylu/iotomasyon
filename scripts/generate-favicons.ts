/**
 * Sharp ile Soylu logosundan favicon + OG image üret.
 *
 * Çıktılar (Next.js App Router'ın metadata file convention'ına göre):
 *   app/icon.png            — 192×192 kare, charcoal bg üzerinde center logo
 *   app/apple-icon.png      — 180×180 kare, aynı
 *   app/opengraph-image.png — 1200×630 yatay, logo + tagline
 *   app/twitter-image.png   — 1200×630 (aynı OG)
 *
 * Bunlar Next.js otomatik olarak <head>'e ve OG meta'lara ekler.
 * Eski app/favicon.ico (Vercel triangle) silinecek.
 */
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CWD = process.cwd();
const LOGO_PATH = path.join(CWD, "public", "soylu-logo.png");
const APP_DIR = path.join(CWD, "app");

// Charcoal (dark theme background) — uygulamayla tutarlı
const BG = { r: 17, g: 24, b: 39, alpha: 1 }; // ~#111827

async function makeSquare(targetSize: number, padding: number): Promise<Buffer> {
  // Logo'yu (targetSize - padding*2) içine sığdır, charcoal kare üstüne center
  const inner = targetSize - padding * 2;
  const resizedLogo = await sharp(LOGO_PATH)
    .resize(inner, inner, {
      fit: "inside",
      background: BG,
    })
    .toBuffer();

  return sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: BG,
    },
  })
    .composite([
      {
        input: resizedLogo,
        gravity: "center",
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function makeOgImage(): Promise<Buffer> {
  // 1200×630, charcoal bg, logo merkez-sol, tagline yanında
  // Logo max 400px wide (logo aspect 1636:839 ≈ 1.95)
  const logoW = 400;
  const logoH = Math.round(logoW * (839 / 1636)); // ≈ 205

  const resizedLogo = await sharp(LOGO_PATH)
    .resize(logoW, logoH, {
      fit: "inside",
      background: BG,
    })
    .toBuffer();

  // Tagline SVG — sağda dikey center
  const tagline = `
    <svg width="600" height="630" xmlns="http://www.w3.org/2000/svg">
      <style>
        .eyebrow { fill: #F97316; font-family: 'Helvetica', sans-serif; font-size: 18px; font-weight: 600; letter-spacing: 3px; }
        .title { fill: #ffffff; font-family: 'Helvetica', sans-serif; font-size: 48px; font-weight: 700; }
        .subtitle { fill: #94a3b8; font-family: 'Helvetica', sans-serif; font-size: 22px; }
      </style>
      <text x="0" y="280" class="eyebrow">B2B · TOPTAN · MONTAJ</text>
      <text x="0" y="335" class="title">ALFA SOYLU</text>
      <text x="0" y="380" class="title">ELEKTRONİK</text>
      <text x="0" y="420" class="subtitle">Güvenlik Kameraları &amp; Elektronik Sistemler</text>
    </svg>
  `;

  return sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: BG,
    },
  })
    .composite([
      {
        input: resizedLogo,
        top: Math.round((630 - logoH) / 2),
        left: 80,
      },
      {
        input: Buffer.from(tagline),
        top: 0,
        left: 540,
      },
      // Alt aksan çizgisi
      {
        input: {
          create: {
            width: 1200,
            height: 6,
            channels: 4,
            background: { r: 249, g: 115, b: 22, alpha: 1 },
          },
        },
        top: 624,
        left: 0,
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  console.log("Logo path:", LOGO_PATH);
  await readFile(LOGO_PATH); // varlık kontrolü

  console.log("Generating app/icon.png (192×192)...");
  const icon = await makeSquare(192, 20);
  await writeFile(path.join(APP_DIR, "icon.png"), icon);

  console.log("Generating app/apple-icon.png (180×180)...");
  const appleIcon = await makeSquare(180, 18);
  await writeFile(path.join(APP_DIR, "apple-icon.png"), appleIcon);

  console.log("Generating app/opengraph-image.png (1200×630)...");
  const og = await makeOgImage();
  await writeFile(path.join(APP_DIR, "opengraph-image.png"), og);

  console.log("Generating app/twitter-image.png (1200×630, aynı OG)...");
  await writeFile(path.join(APP_DIR, "twitter-image.png"), og);

  console.log("\nDone. Output files:");
  const stats = await Promise.all(
    ["icon.png", "apple-icon.png", "opengraph-image.png", "twitter-image.png"].map(
      async (f) => {
        const buf = await readFile(path.join(APP_DIR, f));
        return `  app/${f}: ${(buf.length / 1024).toFixed(1)} KB`;
      },
    ),
  );
  stats.forEach((s) => console.log(s));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
