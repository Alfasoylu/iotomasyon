import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { getSessionSecret } from "@/lib/env";

/**
 * Yerleşik CAPTCHA — dış servis ve hesap gerektirmez.
 *
 * Sunucu 5 rakamlık bir kod üretir, rakamları SVG **çizgi yolları** olarak çizer
 * (metin öğesi yok → DOM'dan okunamaz), üstüne gürültü ekler. Cevap resimle birlikte
 * istemciye GİTMEZ; yalnız HMAC imzalı bir token gider:
 *
 *   token = nonce.exp.HMAC(secret, nonce|exp|cevap)
 *
 * Doğrulama: kullanıcının yazdığı cevapla HMAC yeniden hesaplanır ve sabit zamanlı
 * karşılaştırılır. Token 5 dakika geçerlidir ve tek kullanımlıktır (örnek başına
 * bellek içi nonce listesi). Brute-force `lib/login-rate-limit.ts` ile kesilir
 * (5 deneme / e-posta): 100.000 olasılık × 5 deneme = %0,005 şans.
 *
 * Anahtar: `CAPTCHA_SECRET` tanımlıysa o, değilse mevcut `SESSION_SECRET` kullanılır;
 * yani ek yapılandırma gerekmez. Cloudflare Turnstile anahtarları tanımlıysa
 * (lib/turnstile.ts) formlar onu tercih eder, bu modül devre dışı kalır.
 */

const CODE_LENGTH = 5;
const TTL_MS = 5 * 60 * 1000;
const MAX_USED = 5_000;

export type CaptchaChallenge = {
  /** `data:image/svg+xml;base64,...` — <img src> olarak kullanılır. */
  image: string;
  /** Formla birlikte geri gönderilir. */
  token: string;
};

export type CaptchaVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "used" | "wrong" };

function secret(): string {
  return process.env.CAPTCHA_SECRET?.trim() || getSessionSecret();
}

function sign(nonce: string, exp: number, answer: string): string {
  return createHmac("sha256", secret()).update(`${nonce}|${exp}|${answer}`).digest("hex");
}

// ── Tek kullanımlık nonce takibi (örnek başına) ──────────────────────────────

const used = new Map<string, number>();

function markUsed(nonce: string, exp: number) {
  if (used.size >= MAX_USED) {
    const now = Date.now();
    for (const [k, e] of used) if (e <= now) used.delete(k);
    if (used.size >= MAX_USED) {
      const oldest = used.keys().next().value;
      if (oldest !== undefined) used.delete(oldest);
    }
  }
  used.set(nonce, exp);
}

// ── Rakam glifleri (2×4 birim kutu, çizgi yolları) ───────────────────────────

type Pt = [number, number];
const GLYPHS: Record<string, Pt[][]> = {
  "0": [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]]],
  "1": [[[0, 1], [1, 0], [1, 4]], [[0.3, 4], [1.7, 4]]],
  "2": [[[0, 0.4], [0.6, 0], [2, 0], [2, 2], [0, 2], [0, 4], [2, 4]]],
  "3": [[[0, 0], [2, 0], [2, 4], [0, 4]], [[0.5, 2], [2, 2]]],
  "4": [[[0, 0], [0, 2], [2, 2]], [[2, 0], [2, 4]]],
  "5": [[[2, 0], [0, 0], [0, 2], [2, 2], [2, 4], [0, 4]]],
  "6": [[[2, 0], [0, 0], [0, 4], [2, 4], [2, 2], [0, 2]]],
  "7": [[[0, 0], [2, 0], [0.8, 4]]],
  "8": [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]], [[0, 2], [2, 2]]],
  "9": [[[2, 2], [0, 2], [0, 0], [2, 0], [2, 4], [0, 4]]],
};

const INK = ["#e8ff5a", "#d9d9d9", "#9ad0ff", "#ffb86b", "#b8f5c8"];
const W = 170;
const H = 58;
const CELL = 30;
const SCALE = 8; // 1 birim = 8px → glif 16×32 px

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)];
}

function renderSvg(code: string): string {
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" rx="6" fill="#1e1e1e"/>`);

  // Arka plan gürültüsü: çizgiler + noktalar
  for (let i = 0; i < 6; i++) {
    parts.push(
      `<line x1="${rnd(0, W).toFixed(1)}" y1="${rnd(0, H).toFixed(1)}" x2="${rnd(0, W).toFixed(1)}" y2="${rnd(0, H).toFixed(1)}" stroke="${pick(INK)}" stroke-opacity="0.35" stroke-width="${rnd(1, 2).toFixed(1)}"/>`,
    );
  }
  for (let i = 0; i < 30; i++) {
    parts.push(
      `<circle cx="${rnd(0, W).toFixed(1)}" cy="${rnd(0, H).toFixed(1)}" r="${rnd(0.6, 1.6).toFixed(1)}" fill="${pick(INK)}" fill-opacity="0.5"/>`,
    );
  }

  // Rakamlar
  const x0 = (W - CELL * code.length) / 2;
  for (let i = 0; i < code.length; i++) {
    const glyph = GLYPHS[code[i]];
    const cx = x0 + CELL * i + CELL / 2;
    const cy = H / 2 + rnd(-3, 3);
    const rot = rnd(-22, 22).toFixed(1);
    const skew = rnd(-12, 12).toFixed(1);
    const sx = rnd(0.85, 1.1).toFixed(2);
    const color = pick(INK);
    const width = rnd(2.4, 3.4).toFixed(1);
    const paths = glyph
      .map((poly) => {
        const d = poly
          .map(([px, py], idx) => {
            const x = (px - 1) * SCALE + rnd(-1.4, 1.4);
            const y = (py - 2) * SCALE + rnd(-1.4, 1.4);
            return `${idx === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" ");
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
      })
      .join("");
    parts.push(
      `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot}) skewX(${skew}) scale(${sx} 1)">${paths}</g>`,
    );
  }

  // Ön plan: rakamların üstünden geçen bir eğri
  parts.push(
    `<path d="M0 ${rnd(10, H - 10).toFixed(1)} Q ${(W / 2).toFixed(1)} ${rnd(0, H).toFixed(1)} ${W} ${rnd(10, H - 10).toFixed(1)}" fill="none" stroke="${pick(INK)}" stroke-opacity="0.55" stroke-width="1.6"/>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

// ── API ──────────────────────────────────────────────────────────────────────

export function createCaptchaChallenge(): CaptchaChallenge {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += String(randomInt(10));

  const nonce = randomBytes(12).toString("hex");
  const exp = Date.now() + TTL_MS;
  const token = `${nonce}.${exp}.${sign(nonce, exp, code)}`;
  const image = `data:image/svg+xml;base64,${Buffer.from(renderSvg(code), "utf8").toString("base64")}`;

  return { image, token };
}

export function verifyCaptchaAnswer(
  token: string | undefined,
  answer: string | undefined,
): CaptchaVerifyResult {
  if (!token || !answer) return { ok: false, reason: "missing" };

  const [nonce, expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!nonce || !sig || !Number.isFinite(exp) || sig.length !== 64) {
    return { ok: false, reason: "missing" };
  }
  if (exp < Date.now()) return { ok: false, reason: "expired" };
  if (used.has(nonce)) return { ok: false, reason: "used" };

  const normalized = answer.replace(/\D/g, "");
  if (normalized.length !== CODE_LENGTH) {
    // Yanlış cevap da token'ı tüketir — aynı resme tekrar tekrar tahmin yapılamaz.
    markUsed(nonce, exp);
    return { ok: false, reason: "wrong" };
  }

  const expected = Buffer.from(sign(nonce, exp, normalized), "hex");
  const given = Buffer.from(sig, "hex");
  const ok = expected.length === given.length && timingSafeEqual(expected, given);

  markUsed(nonce, exp);
  return ok ? { ok: true } : { ok: false, reason: "wrong" };
}

export function captchaErrorMessage(reason: Exclude<CaptchaVerifyResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "missing":
      return "Lütfen resimdeki rakamları girin.";
    case "expired":
      return "Doğrulama süresi doldu. Yeni resimdeki rakamları girin.";
    case "used":
      return "Bu doğrulama kullanıldı. Yeni resimdeki rakamları girin.";
    case "wrong":
      return "Rakamlar hatalı. Yeni resimdeki rakamları girin.";
  }
}
