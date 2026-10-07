import { z } from "zod";

// /api/admin/ai-cfo/runner istek kapısı (saf; route ve test aynı kodu kullanır). Sıra: yetki → origin → ortam → boyut → şema.
export const RUNNER_BODY_LIMIT = 1024;
const input = z.object({ action: z.enum(["monitor", "morning", "deep_review"]) }).strict();
export type RunnerAction = z.infer<typeof input>["action"];
export type RunnerGuardResult = { ok: true; action: RunnerAction } | { ok: false; status: number; error: string };

export function runnerRequestGuard(req: { authorized: boolean; origin: string | null; url: string; vercelEnv?: string; declaredLength: number; body: string }): RunnerGuardResult {
  if (!req.authorized) return { ok: false, status: 401, error: "unauthorized" };
  if (!req.origin || req.origin !== new URL(req.url).origin) return { ok: false, status: 403, error: "origin_invalid" };
  // Preview/development dağıtımları üretim verisine çalışma kaydı yazamaz (VERCEL_ENV yoksa yerel geliştirme).
  if (req.vercelEnv && req.vercelEnv !== "production") return { ok: false, status: 403, error: "production_only" };
  if (req.declaredLength > RUNNER_BODY_LIMIT || Buffer.byteLength(req.body, "utf8") > RUNNER_BODY_LIMIT) return { ok: false, status: 413, error: "body_too_large" };
  let parsed: unknown;
  try { parsed = JSON.parse(req.body); } catch { return { ok: false, status: 400, error: "invalid_request" }; }
  const result = input.safeParse(parsed);
  return result.success ? { ok: true, action: result.data.action } : { ok: false, status: 400, error: "invalid_request" };
}
