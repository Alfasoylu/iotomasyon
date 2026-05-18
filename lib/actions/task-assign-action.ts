"use server";

/**
 * Phase 87 — Görev Atama Server Action
 *
 * TASKS_ASSIGN permission gated.
 * Reassigns an existing FollowUpTask to a different user (or removes assignment).
 */

import { revalidatePath } from "next/cache";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type AssignTaskResult =
  | { ok: true }
  | { ok: false; error: string };

export async function assignTaskAction(
  taskId: string,
  assignedToId: string | null,
): Promise<AssignTaskResult> {
  const user = await getCurrentSession();
  if (!user) return { ok: false, error: "Oturum açık değil." };

  if (!(await checkPermission(user, PERMISSIONS.TASKS_ASSIGN))) {
    return { ok: false, error: "Görev atama yetkiniz yok." };
  }

  // Verify task exists
  const task = await prisma.followUpTask.findUnique({
    where: { id: taskId },
    select: { id: true },
  });
  if (!task) return { ok: false, error: "Görev bulunamadı." };

  await prisma.followUpTask.update({
    where: { id: taskId },
    data: { assignedToId: assignedToId ?? null },
  });

  revalidatePath("/admin/task-board");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");

  return { ok: true };
}
