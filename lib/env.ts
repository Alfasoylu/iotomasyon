import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");
const databaseUrlSchema = z.string().min(1);
const sessionSecretSchema = z.string().min(32);
const adminEmailSchema = z.email();
const adminPasswordSchema = z.string().min(8);

function readRequiredEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getDatabaseUrl() {
  return databaseUrlSchema.parse(readRequiredEnv("DATABASE_URL"));
}

export function getDirectUrl() {
  return databaseUrlSchema.parse(readRequiredEnv("DIRECT_URL"));
}

export function getSessionSecret() {
  return sessionSecretSchema.parse(readRequiredEnv("SESSION_SECRET"));
}

export function getAdminEmail() {
  return adminEmailSchema.parse(readRequiredEnv("ADMIN_EMAIL"));
}

export function getAdminPassword() {
  return adminPasswordSchema.parse(readRequiredEnv("ADMIN_PASSWORD"));
}

// ── Cloudflare Turnstile (opsiyonel) ─────────────────────────────────────────
// İkisi de tanımlıysa /login CAPTCHA'sı devreye girer. Bkz. lib/turnstile.ts.

export function getTurnstileSiteKey(): string | undefined {
  const value = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return value ? value : undefined;
}

export function getTurnstileSecretKey(): string | undefined {
  const value = process.env.TURNSTILE_SECRET_KEY?.trim();
  return value ? value : undefined;
}

export function getNodeEnv() {
  return nodeEnvSchema.parse(process.env.NODE_ENV ?? "development");
}

export const isProduction = getNodeEnv() === "production";
