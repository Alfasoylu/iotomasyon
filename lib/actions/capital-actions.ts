"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

export async function saveCapitalConfigAction(
  totalCapitalTry: string,
  reservePct: string,
  desiredTurnoverMonths: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const total = parseFloat(totalCapitalTry);
  const reserve = parseFloat(reservePct);
  const turnover = parseFloat(desiredTurnoverMonths);

  if (!isFinite(total) || total <= 0) {
    return { ok: false, message: "Toplam sermaye geçerli bir sayı olmalı." };
  }
  if (!isFinite(reserve) || reserve < 0 || reserve > 80) {
    return { ok: false, message: "Rezerv oranı 0–80 arasında olmalı." };
  }
  if (!isFinite(turnover) || turnover <= 0 || turnover > 24) {
    return { ok: false, message: "Devir süresi 1–24 ay arasında olmalı." };
  }

  try {
    // Upsert — only one config row ever (use first or create)
    const existing = await prisma.capitalConfig.findFirst();
    if (existing) {
      await prisma.capitalConfig.update({
        where: { id: existing.id },
        data: { totalCapitalTry: total, reservePct: reserve, desiredTurnoverMonths: turnover, updatedById: user.id },
      });
    } else {
      await prisma.capitalConfig.create({
        data: { totalCapitalTry: total, reservePct: reserve, desiredTurnoverMonths: turnover, updatedById: user.id },
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Sermaye ayarları kaydedilemedi." };
  }
}
