"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { testHepsiburadaConnection } from "@/lib/hepsiburada-api";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const configSchema = z.object({
  merchantId: z.string().trim().max(100),
  username: z.string().trim().max(200),
  password: z.string().trim().max(500),
  storeName: z.string().trim().max(100).optional(),
  isEnabled: z.boolean(),
});

export type HepsiburadaConfigValues = z.infer<typeof configSchema>;

export async function saveHepsiburadaConfigAction(
  values: HepsiburadaConfigValues,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const parsed = configSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Form alanlarını kontrol edin." };

  try {
    await prisma.hepsiburadaConfig.upsert({
      where: { id: "singleton" },
      update: {
        merchantId: parsed.data.merchantId,
        username: parsed.data.username,
        password: parsed.data.password,
        storeName: parsed.data.storeName ?? null,
        isEnabled: parsed.data.isEnabled,
        updatedAt: new Date(),
      },
      create: {
        id: "singleton",
        merchantId: parsed.data.merchantId,
        username: parsed.data.username,
        password: parsed.data.password,
        storeName: parsed.data.storeName ?? null,
        isEnabled: parsed.data.isEnabled,
        updatedAt: new Date(),
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "Yapılandırma kaydedilemedi." };
  }
}

export async function testHepsiburadaConnectionAction(): Promise<
  ActionResult & { connectionMessage?: string }
> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const config = await prisma.hepsiburadaConfig.findUnique({ where: { id: "singleton" } });
  if (!config || !config.merchantId || !config.username || !config.password) {
    return {
      ok: false,
      message: "Önce API yapılandırmasını kaydedin.",
      connectionMessage: "Yapılandırma eksik.",
    };
  }

  const result = await testHepsiburadaConnection({
    merchantId: config.merchantId,
    username: config.username,
    password: config.password,
  });

  return { ok: result.ok, message: result.message, connectionMessage: result.message };
}
