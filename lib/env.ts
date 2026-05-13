import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(8),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function readRequiredEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const rawEnv = {
  DATABASE_URL: readRequiredEnv("DATABASE_URL"),
  DIRECT_URL: readRequiredEnv("DIRECT_URL"),
  SESSION_SECRET: readRequiredEnv("SESSION_SECRET"),
  ADMIN_EMAIL: readRequiredEnv("ADMIN_EMAIL"),
  ADMIN_PASSWORD: readRequiredEnv("ADMIN_PASSWORD"),
  NODE_ENV: process.env.NODE_ENV ?? "development",
};

export const env = envSchema.parse(rawEnv);
export const isProduction = env.NODE_ENV === "production";
