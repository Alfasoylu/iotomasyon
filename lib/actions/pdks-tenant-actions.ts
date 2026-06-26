"use server";

import { revalidatePath } from "next/cache";

import { prismaPdks } from "@/lib/pdks/prisma";
import { hashPassword, normalizePhone } from "@/lib/pdks/auth";
import { requireTenantAdminFor, runAsTenantAdmin } from "@/lib/pdks/tenant-admin";
import { personnelSchema, passwordSchema, worksiteSchema } from "@/lib/validations/pdks";

export type TResult = { ok: true } | { ok: false; message: string };

const DENIED: TResult = { ok: false, message: "Bu işlem için yetkiniz yok (oturum/rol)." };

function revalidate(slug: string) {
  revalidatePath(`/t/${slug}/yonetim`);
}

// ── Personel ───────────────────────────────────────────────────────────────

export async function tCreatePersonnel(
  slug: string,
  values: { fullName: string; phone: string; expectedCheckIn: string; expectedCheckOut: string; password: string },
): Promise<TResult> {
  const session = await requireTenantAdminFor(slug);
  if (!session) return DENIED;

  const parsed = personnelSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Form geçersiz." };
  const pw = passwordSchema.safeParse(values.password);
  if (!pw.success) return { ok: false, message: pw.error.issues[0]?.message ?? "Şifre geçersiz." };

  const passwordHash = await hashPassword(pw.data);
  await runAsTenantAdmin(session, async (tenantId) => {
    await prismaPdks.pdksPersonnel.create({
      data: {
        tenantId,
        fullName: parsed.data.fullName,
        phone: normalizePhone(parsed.data.phone),
        expectedCheckIn: parsed.data.expectedCheckIn || null,
        expectedCheckOut: parsed.data.expectedCheckOut || null,
        passwordHash,
        role: "employee",
      },
    });
  });
  revalidate(slug);
  return { ok: true };
}

export async function tUpdatePersonnel(
  slug: string,
  id: string,
  values: { fullName: string; phone: string; expectedCheckIn: string; expectedCheckOut: string },
): Promise<TResult> {
  const session = await requireTenantAdminFor(slug);
  if (!session) return DENIED;
  const parsed = personnelSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Form geçersiz." };

  const { count } = await runAsTenantAdmin(session, () =>
    prismaPdks.pdksPersonnel.updateMany({
      where: { id },
      data: {
        fullName: parsed.data.fullName,
        phone: normalizePhone(parsed.data.phone),
        expectedCheckIn: parsed.data.expectedCheckIn || null,
        expectedCheckOut: parsed.data.expectedCheckOut || null,
      },
    }),
  );
  if (count === 0) return { ok: false, message: "Personel bulunamadı." };
  revalidate(slug);
  return { ok: true };
}

export async function tSetPersonnelActive(slug: string, id: string, isActive: boolean): Promise<TResult> {
  const session = await requireTenantAdminFor(slug);
  if (!session) return DENIED;
  const { count } = await runAsTenantAdmin(session, () =>
    prismaPdks.pdksPersonnel.updateMany({ where: { id }, data: { isActive } }),
  );
  if (count === 0) return { ok: false, message: "Personel bulunamadı." };
  revalidate(slug);
  return { ok: true };
}

export async function tResetPassword(slug: string, id: string, newPassword: string): Promise<TResult> {
  const session = await requireTenantAdminFor(slug);
  if (!session) return DENIED;
  const pw = passwordSchema.safeParse(newPassword);
  if (!pw.success) return { ok: false, message: pw.error.issues[0]?.message ?? "Şifre geçersiz." };
  const passwordHash = await hashPassword(pw.data);
  const { count } = await runAsTenantAdmin(session, () =>
    prismaPdks.pdksPersonnel.updateMany({ where: { id }, data: { passwordHash } }),
  );
  if (count === 0) return { ok: false, message: "Personel bulunamadı." };
  revalidate(slug);
  return { ok: true };
}

export async function tResetDevice(slug: string, id: string): Promise<TResult> {
  const session = await requireTenantAdminFor(slug);
  if (!session) return DENIED;
  const { count } = await runAsTenantAdmin(session, () =>
    prismaPdks.pdksPersonnel.updateMany({ where: { id }, data: { deviceIdHash: null, deviceBoundAt: null } }),
  );
  if (count === 0) return { ok: false, message: "Personel bulunamadı." };
  revalidate(slug);
  return { ok: true };
}

// ── Şantiye ──────────────────────────────────────────────────────────────────

export async function tCreateWorksite(
  slug: string,
  values: { name: string; latitude: number; longitude: number; radiusMeters: number; maxAccuracyMeters: number },
): Promise<TResult> {
  const session = await requireTenantAdminFor(slug);
  if (!session) return DENIED;
  const parsed = worksiteSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Form geçersiz." };

  await runAsTenantAdmin(session, async (tenantId) => {
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
  revalidate(slug);
  return { ok: true };
}

export async function tSetWorksiteActive(slug: string, id: string, isActive: boolean): Promise<TResult> {
  const session = await requireTenantAdminFor(slug);
  if (!session) return DENIED;
  const { count } = await runAsTenantAdmin(session, () =>
    prismaPdks.pdksWorksite.updateMany({ where: { id }, data: { isActive } }),
  );
  if (count === 0) return { ok: false, message: "Şantiye bulunamadı." };
  revalidate(slug);
  return { ok: true };
}

/** Bir şantiyeye atanan personel kümesini tam liste ile günceller. */
export async function tSetWorksiteAssignments(
  slug: string,
  worksiteId: string,
  personnelIds: string[],
): Promise<TResult> {
  const session = await requireTenantAdminFor(slug);
  if (!session) return DENIED;

  const result = await runAsTenantAdmin(session, async (tenantId): Promise<TResult> => {
    const ws = await prismaPdks.pdksWorksite.findFirst({ where: { id: worksiteId } });
    if (!ws) return { ok: false, message: "Şantiye bulunamadı." };
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
  revalidate(slug);
  return result;
}
