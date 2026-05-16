"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { testTrendyolConnection } from "@/lib/trendyol-api";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const configSchema = z.object({
  supplierId: z.string().trim().max(50),
  apiKey: z.string().trim().max(200),
  apiSecret: z.string().trim().max(200),
  isEnabled: z.boolean(),
});

export type TrendyolConfigValues = z.infer<typeof configSchema>;

export async function saveTrendyolConfigAction(values: TrendyolConfigValues): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const parsed = configSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Form alanlarını kontrol edin." };

  try {
    await prisma.trendyolConfig.upsert({
      where: { id: "singleton" },
      update: {
        supplierId: parsed.data.supplierId,
        apiKey: parsed.data.apiKey,
        apiSecret: parsed.data.apiSecret,
        isEnabled: parsed.data.isEnabled,
        updatedAt: new Date(),
      },
      create: {
        id: "singleton",
        supplierId: parsed.data.supplierId,
        apiKey: parsed.data.apiKey,
        apiSecret: parsed.data.apiSecret,
        isEnabled: parsed.data.isEnabled,
        updatedAt: new Date(),
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "Yapılandırma kaydedilemedi." };
  }
}

export async function testTrendyolConnectionAction(): Promise<ActionResult & { connectionMessage?: string }> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const config = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
  if (!config || !config.supplierId || !config.apiKey || !config.apiSecret) {
    return { ok: false, message: "Önce API yapılandırmasını kaydedin.", connectionMessage: "Yapılandırma eksik." };
  }

  const result = await testTrendyolConnection({
    supplierId: config.supplierId,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
  });

  return { ok: result.ok, message: result.message, connectionMessage: result.message };
}
