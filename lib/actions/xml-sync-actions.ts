"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runSync } from "@/lib/xml-sync-runner";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

// ── Save / upsert an XML source ─────────────────────────────────────────────

export async function saveXmlSourceAction(
  sourceId: string | null,
  name: string,
  url: string,
  secondaryUrl: string,
  isEnabled: boolean,
  authHeader: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  name = name.trim();
  url = url.trim();
  if (!name) return { ok: false, message: "Kaynak adı boş olamaz." };
  if (!url) return { ok: false, message: "URL boş olamaz." };

  const secondaryUrlTrimmed = secondaryUrl.trim() || null;

  try {
    if (sourceId) {
      await prisma.xmlSyncSource.update({
        where: { id: sourceId },
        data: {
          name,
          url,
          secondaryUrl: secondaryUrlTrimmed,
          isEnabled,
          authHeader: authHeader.trim() || null,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.xmlSyncSource.create({
        data: {
          name,
          url,
          secondaryUrl: secondaryUrlTrimmed,
          isEnabled,
          authHeader: authHeader.trim() || null,
          updatedAt: new Date(),
        },
      });
    }
    revalidatePath("/admin/xml-sync");
    return { ok: true };
  } catch {
    return { ok: false, message: "Kaynak kaydedilemedi." };
  }
}

// ── Delete a source ──────────────────────────────────────────────────────────

export async function deleteXmlSourceAction(sourceId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  try {
    await prisma.xmlSyncSource.delete({ where: { id: sourceId } });
    revalidatePath("/admin/xml-sync");
    return { ok: true };
  } catch {
    return { ok: false, message: "Kaynak silinemedi." };
  }
}

// ── Manual trigger: run sync for one source ──────────────────────────────────

export async function triggerXmlSyncAction(sourceId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const source = await prisma.xmlSyncSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, message: "Kaynak bulunamadı." };

  return runSync(source.id, source.url, source.secondaryUrl ?? null, source.authHeader);
}
