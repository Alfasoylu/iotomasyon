import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(8),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const rawEnv = {
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  SESSION_SECRET:
    process.env.SESSION_SECRET ??
    "development-session-secret-should-be-overridden",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@iotomasyon.local",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "ChangeMe123!",
  NODE_ENV: process.env.NODE_ENV ?? "development",
};

export const env = envSchema.parse(rawEnv);
export const isProduction = env.NODE_ENV === "production";
