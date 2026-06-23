"use server";

import { revalidatePath } from "next/cache";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { prismaPdks } from "@/lib/pdks/prisma";
import { hashPassword, normalizePhone } from "@/lib/pdks/auth";
import { trTimeOnDateToUtc } from "@/lib/pdks/timesheet";
import {
  personnelSchema,
  type PersonnelInput,
  passwordSchema,
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
  values: PersonnelInput & { password: string },
): Promise<ActionResult<PersonnelField | "password">> {
  const parsed = personnelSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const pw = passwordSchema.safeParse(values.password);
  if (!pw.success) {
    return {
      ok: false,
      message: pw.error.issues[0]?.message ?? "Şifre geçersiz.",
      fieldErrors: { password: [pw.error.issues[0]?.message ?? "Şifre geçersiz."] },
    };
  }
  const user = await guard();
  if (!user) return PERM_DENIED;

  const passwordHash = await hashPassword(pw.data);
  await runWithPdksAdmin(user, async (tenantId) => {
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
        expectedCheckOut: parsed.data.expectedCheckOut || null,
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

/** Personelin şifresini/PIN'ini sıfırlar (admin yeni şifreyi belirler). */
export async function resetPasswordAction(
  personnelId: string,
  newPassword: string,
): Promise<ActionResult> {
  const pw = passwordSchema.safeParse(newPassword);
  if (!pw.success) {
    return { ok: false, message: pw.error.issues[0]?.message ?? "Şifre geçersiz." };
  }
  const user = await guard();
  if (!user) return PERM_DENIED;

  const passwordHash = await hashPassword(pw.data);
  const { count } = await runWithPdksAdmin(user, () =>
    prismaPdks.pdksPersonnel.updateMany({ where: { id: personnelId }, data: { passwordHash } }),
  );
  if (count === 0) return { ok: false, message: "Personel bulunamadı." };

  revalidatePdks();
  return { ok: true };
}

/**
 * Personelin cihaz bağını kaldırır; bir sonraki giriş yeni cihaza bağlanır.
 * (Telefon değişimi / cihaz kaybı durumunda kullanılır.)
 */
export async function resetDeviceAction(personnelId: string): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;

  const { count } = await runWithPdksAdmin(user, () =>
    prismaPdks.pdksPersonnel.updateMany({
      where: { id: personnelId },
      data: { deviceIdHash: null, deviceBoundAt: null },
    }),
  );
  if (count === 0) return { ok: false, message: "Personel bulunamadı." };

  revalidatePdks();
  return { ok: true };
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

// ── Puantaj düzeltme (attendance) ─────────────────────────────────────────────

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function revalidatePuantaj() {
  revalidatePath("/admin/pdks");
  revalidatePath("/admin/pdks/puantaj");
}

/** Bir devam kaydının giriş/çıkış saatini düzeltir (TR saati). Çıkış boş → kayıt açık. */
export async function updateAttendanceAction(
  recordId: string,
  checkInTime: string,
  checkOutTime: string,
): Promise<ActionResult> {
  const ci = checkInTime.trim();
  const co = checkOutTime.trim();
  if (!TIME_RE.test(ci)) return { ok: false, message: "Giriş saati HH:MM olmalı." };
  if (co && !TIME_RE.test(co)) return { ok: false, message: "Çıkış saati HH:MM olmalı." };

  const user = await guard();
  if (!user) return PERM_DENIED;

  return runWithPdksAdmin(user, async (): Promise<ActionResult> => {
    const rec = await prismaPdks.pdksAttendanceRecord.findFirst({ where: { id: recordId } });
    if (!rec) return { ok: false, message: "Kayıt bulunamadı." };

    const checkInAt = trTimeOnDateToUtc(rec.workDate, ci);
    if (!checkInAt) return { ok: false, message: "Giriş saati geçersiz." };
    const checkOutAt = co ? trTimeOnDateToUtc(rec.workDate, co) : null;
    if (co && !checkOutAt) return { ok: false, message: "Çıkış saati geçersiz." };
    if (checkOutAt && checkOutAt.getTime() < checkInAt.getTime()) {
      return { ok: false, message: "Çıkış, girişten önce olamaz." };
    }

    await prismaPdks.pdksAttendanceRecord.updateMany({
      where: { id: recordId },
      data: { checkInAt, checkOutAt, status: checkOutAt ? "closed" : "open" },
    });
    revalidatePuantaj();
    return { ok: true };
  });
}

/** Yanlış girilmiş bir devam kaydını siler. */
export async function deleteAttendanceAction(recordId: string): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;

  const { count } = await runWithPdksAdmin(user, () =>
    prismaPdks.pdksAttendanceRecord.deleteMany({ where: { id: recordId } }),
  );
  if (count === 0) return { ok: false, message: "Kayıt bulunamadı." };
  revalidatePuantaj();
  return { ok: true };
}

/** Unutulan bir gün için manuel devam kaydı oluşturur (konum/şantiye olmadan). */
export async function createManualAttendanceAction(
  personnelId: string,
  ymd: string,
  checkInTime: string,
  checkOutTime: string,
): Promise<ActionResult> {
  if (!YMD_RE.test(ymd)) return { ok: false, message: "Tarih YYYY-AA-GG olmalı." };
  const ci = checkInTime.trim();
  const co = checkOutTime.trim();
  if (!TIME_RE.test(ci)) return { ok: false, message: "Giriş saati HH:MM olmalı." };
  if (co && !TIME_RE.test(co)) return { ok: false, message: "Çıkış saati HH:MM olmalı." };

  const user = await guard();
  if (!user) return PERM_DENIED;

  return runWithPdksAdmin(user, async (tenantId): Promise<ActionResult> => {
    const p = await prismaPdks.pdksPersonnel.findFirst({ where: { id: personnelId } });
    if (!p) return { ok: false, message: "Personel bulunamadı." };

    const workDate = new Date(`${ymd}T00:00:00.000Z`);
    const checkInAt = trTimeOnDateToUtc(workDate, ci);
    if (!checkInAt) return { ok: false, message: "Giriş saati geçersiz." };
    const checkOutAt = co ? trTimeOnDateToUtc(workDate, co) : null;
    if (checkOutAt && checkOutAt.getTime() < checkInAt.getTime()) {
      return { ok: false, message: "Çıkış, girişten önce olamaz." };
    }

    await prismaPdks.pdksAttendanceRecord.create({
      data: {
        tenantId,
        personnelId,
        worksiteId: null,
        workDate,
        checkInAt,
        checkOutAt,
        status: checkOutAt ? "closed" : "open",
      },
    });
    revalidatePuantaj();
    return { ok: true };
  });
}
