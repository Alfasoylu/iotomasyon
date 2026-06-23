"use server";

import { revalidatePath } from "next/cache";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { prismaPdks } from "@/lib/pdks/prisma";
import { issueLoginCode, normalizePhone } from "@/lib/pdks/auth";
import {
  personnelSchema,
  type PersonnelInput,
  worksiteSchema,
  type WorksiteInput,
} from "@/lib/validations/pdks";
import type { ActionResult } from "@/types/actions";
import type { ResolvedUser } from "@/lib/permissions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

type PersonnelField = keyof PersonnelInput;

/** Yetki kapısı: oturum + pdks.manage. */
async function guard(): Promise<ResolvedUser | null> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.PDKS_MANAGE))) return null;
  return user;
}

function revalidatePdks() {
  revalidatePath("/admin/pdks");
  revalidatePath("/admin/pdks/personel");
}

export async function createPersonnelAction(
  values: PersonnelInput,
): Promise<ActionResult<PersonnelField>> {
  const parsed = personnelSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await guard();
  if (!user) return PERM_DENIED;

  await runWithPdksAdmin(user, async (tenantId) => {
    await prismaPdks.pdksPersonnel.create({
      data: {
        tenantId,
        fullName: parsed.data.fullName,
        phone: normalizePhone(parsed.data.phone),
        expectedCheckIn: parsed.data.expectedCheckIn || null,
        role: "employee",
      },
    });
  });

  revalidatePdks();
  return { ok: true };
}

export async function updatePersonnelAction(
  id: string,
  values: PersonnelInput,
): Promise<ActionResult<PersonnelField>> {
  const parsed = personnelSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await guard();
  if (!user) return PERM_DENIED;

  const { count } = await runWithPdksAdmin(user, () =>
    // updateMany: scoped extension where'e tenantId ekler → başka tenant'ı etkilemez.
    prismaPdks.pdksPersonnel.updateMany({
      where: { id },
      data: {
        fullName: parsed.data.fullName,
        phone: normalizePhone(parsed.data.phone),
        expectedCheckIn: parsed.data.expectedCheckIn || null,
      },
    }),
  );
  if (count === 0) return { ok: false, message: "Personel bulunamadı." };

  revalidatePdks();
  return { ok: true };
}

export async function setPersonnelActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;

  const { count } = await runWithPdksAdmin(user, () =>
    prismaPdks.pdksPersonnel.updateMany({ where: { id }, data: { isActive } }),
  );
  if (count === 0) return { ok: false, message: "Personel bulunamadı." };

  revalidatePdks();
  return { ok: true };
}

export type IssueCodeResult = {
  ok: boolean;
  message?: string;
  code?: string;
  expiresAt?: string;
};

/** Personel için tek kullanımlık 6 haneli giriş kodu üretir; düz kodu döner. */
export async function issueLoginCodeAction(personnelId: string): Promise<IssueCodeResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;

  return runWithPdksAdmin(user, async (tenantId) => {
    const p = await prismaPdks.pdksPersonnel.findFirst({ where: { id: personnelId } });
    if (!p) return { ok: false, message: "Personel bulunamadı." };
    if (!p.phone) {
      return { ok: false, message: "Önce telefon numarası ekleyin (giriş telefonla yapılır)." };
    }
    const { code, expiresAt } = await issueLoginCode(personnelId, tenantId);
    return { ok: true, code, expiresAt: expiresAt.toISOString() };
  });
}

// ── Şantiye (worksite) ───────────────────────────────────────────────────────

type WorksiteField = keyof WorksiteInput;

function revalidateWorksites() {
  revalidatePath("/admin/pdks");
  revalidatePath("/admin/pdks/santiye");
}

export async function createWorksiteAction(
  values: WorksiteInput,
): Promise<ActionResult<WorksiteField>> {
  const parsed = worksiteSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await guard();
  if (!user) return PERM_DENIED;

  await runWithPdksAdmin(user, async (tenantId) => {
    await prismaPdks.pdksWorksite.create({
      data: {
        tenantId,
        name: parsed.data.name,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        radiusMeters: parsed.data.radiusMeters,
        maxAccuracyMeters: parsed.data.maxAccuracyMeters,
      },
    });
  });

  revalidateWorksites();
  return { ok: true };
}

export async function updateWorksiteAction(
  id: string,
  values: WorksiteInput,
): Promise<ActionResult<WorksiteField>> {
  const parsed = worksiteSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const user = await guard();
  if (!user) return PERM_DENIED;

  const { count } = await runWithPdksAdmin(user, () =>
    prismaPdks.pdksWorksite.updateMany({
      where: { id },
      data: {
        name: parsed.data.name,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        radiusMeters: parsed.data.radiusMeters,
        maxAccuracyMeters: parsed.data.maxAccuracyMeters,
      },
    }),
  );
  if (count === 0) return { ok: false, message: "Şantiye bulunamadı." };

  revalidateWorksites();
  return { ok: true };
}

export async function setWorksiteActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;

  const { count } = await runWithPdksAdmin(user, () =>
    prismaPdks.pdksWorksite.updateMany({ where: { id }, data: { isActive } }),
  );
  if (count === 0) return { ok: false, message: "Şantiye bulunamadı." };

  revalidateWorksites();
  return { ok: true };
}

/**
 * Bir şantiyeye atanan personel kümesini (tam liste ile) günceller.
 * Yalnızca aktif bağlamdaki tenant'a ait personel atanabilir (cross-tenant engeli).
 */
export async function setWorksiteAssignmentsAction(
  worksiteId: string,
  personnelIds: string[],
): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;

  const result = await runWithPdksAdmin(user, async (tenantId): Promise<ActionResult> => {
    const ws = await prismaPdks.pdksWorksite.findFirst({ where: { id: worksiteId } });
    if (!ws) return { ok: false, message: "Şantiye bulunamadı." };

    // Yalnızca bu tenant'a ait personel id'leri geçerli.
    const valid = await prismaPdks.pdksPersonnel.findMany({
      where: { id: { in: personnelIds } },
      select: { id: true },
    });
    const validIds = valid.map((v) => v.id);

    await prismaPdks.pdksPersonnelWorksite.deleteMany({ where: { worksiteId } });
    if (validIds.length > 0) {
      await prismaPdks.pdksPersonnelWorksite.createMany({
        data: validIds.map((pid) => ({ tenantId, worksiteId, personnelId: pid })),
        skipDuplicates: true,
      });
    }
    return { ok: true };
  });

  revalidateWorksites();
  return result;
}
