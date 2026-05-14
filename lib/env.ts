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

export function getNodeEnv() {
  return nodeEnvSchema.parse(process.env.NODE_ENV ?? "development");
}

export const isProduction = getNodeEnv() === "production";
