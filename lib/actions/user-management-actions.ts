"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ALL_USER_ROLES, type UserRole } from "@/lib/user-roles";
import { isUserRoleSupported } from "@/lib/user-role-support";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;
const ROLE_UNAVAILABLE_MESSAGE =
  "Seçilen rol bu veritabanında henüz aktif değil. Phase 5 migrasyonu uygulanmalı.";

export async function updateUserRoleAction(
  targetUserId: string,
  role: UserRole,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.USERS_UPDATE))) return PERM_DENIED;

  if (targetUserId === user.id) {
    return { ok: false, message: "Kendi rolünüzü değiştiremezsiniz." };
  }

  if (!ALL_USER_ROLES.includes(role)) {
    return { ok: false, message: "Geçersiz rol." };
  }

  if (!(await isUserRoleSupported(role))) {
    return { ok: false, message: ROLE_UNAVAILABLE_MESSAGE };
  }

  try {
    await prisma.user.update({
      where: { id: targetUserId },
      data: { role },
    });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${targetUserId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Kullanıcı rolü güncellenemedi." };
  }
}

/**
 * Set or remove a per-user permission override.
 * granted = true  -> explicit grant
 * granted = false -> explicit deny
 * granted = null  -> remove override (fall back to role default)
 */
export async function setUserPermissionAction(
  targetUserId: string,
  permissionKey: string,
  granted: boolean | null,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.PERMISSIONS_MANAGE))) return PERM_DENIED;

  try {
    const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
    if (!permission) return { ok: false, message: "İzin bulunamadı." };

    if (granted === null) {
      await prisma.userPermission.deleteMany({
        where: { userId: targetUserId, permissionId: permission.id },
      });
    } else {
      await prisma.userPermission.upsert({
        where: { userId_permissionId: { userId: targetUserId, permissionId: permission.id } },
        update: { granted },
        create: { userId: targetUserId, permissionId: permission.id, granted },
      });
    }
    revalidatePath(`/admin/users/${targetUserId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "İzin güncellenemedi." };
  }
}

export async function toggleUserActiveAction(
  targetUserId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.USERS_UPDATE))) return PERM_DENIED;

  if (targetUserId === user.id) {
    return { ok: false, message: "Kendi hesabınızı devre dışı bırakamazsınız." };
  }

  try {
    await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
    });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${targetUserId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Kullanıcı durumu güncellenemedi." };
  }
}

export async function updateUserProfileAction(
  targetUserId: string,
  values: { name: string; email: string },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.USERS_UPDATE))) return PERM_DENIED;

  const name = values.name.trim();
  const email = values.email.trim().toLowerCase();

  if (!name || name.length < 2) {
    return { ok: false, message: "Ad en az 2 karakter olmalıdır." };
  }
  if (!email || !email.includes("@")) {
    return { ok: false, message: "Geçerli bir e-posta adresi girin." };
  }

  try {
    await prisma.user.update({
      where: { id: targetUserId },
      data: { name, email },
    });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${targetUserId}`);
    return { ok: true };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return { ok: false, message: "Bu e-posta adresi zaten başka bir kullanıcıya ait." };
    }
    return { ok: false, message: "Kullanıcı bilgileri güncellenemedi." };
  }
}

export async function updateUserPasswordAction(
  targetUserId: string,
  newPassword: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.USERS_UPDATE))) return PERM_DENIED;

  if (!newPassword || newPassword.length < 8) {
    return { ok: false, message: "Şifre en az 8 karakter olmalıdır." };
  }

  try {
    const passwordHash = await hash(newPassword, 12);
    await prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash },
    });
    revalidatePath(`/admin/users/${targetUserId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Şifre güncellenemedi." };
  }
}

export async function createUserAction(values: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.USERS_CREATE))) return PERM_DENIED;

  if (!values.email?.trim() || !values.name?.trim() || !values.password?.trim()) {
    return { ok: false, message: "E-posta, isim ve şifre gereklidir." };
  }

  if (values.password.length < 8) {
    return { ok: false, message: "Şifre en az 8 karakter olmalıdır." };
  }

  if (!ALL_USER_ROLES.includes(values.role)) {
    return { ok: false, message: "Geçersiz rol." };
  }

  if (!(await isUserRoleSupported(values.role))) {
    return { ok: false, message: ROLE_UNAVAILABLE_MESSAGE };
  }

  try {
    const passwordHash = await hash(values.password, 12);
    const newUser = await prisma.user.create({
      data: {
        email: values.email.trim().toLowerCase(),
        name: values.name.trim(),
        passwordHash,
        role: values.role,
      },
    });
    revalidatePath("/admin/users");
    return { ok: true, redirectTo: `/admin/users/${newUser.id}` };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return { ok: false, message: "Bu e-posta adresi zaten kayıtlı." };
    }
    return { ok: false, message: "Kullanıcı oluşturulamadı." };
  }
}
