import "server-only";

import { prisma } from "@/lib/prisma";
import { hashPassword, normalizePhone } from "./auth";
import { DEFAULT_WEEK_SCHEDULE } from "./schedule";
import { TR_HOLIDAYS_2026 } from "./holidays";

/** Deneme süresi (gün). */
export const TRIAL_DAYS = 30;

/** Slug regex: 3-30, küçük harf/rakam/tire; baş-son tire yok. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** Serbest metni slug adayına indirger (kullanıcıya öneri için). */
export function slugify(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** Slug DB'de boşta mı? (büyük/küçük duyarsız değil — slug zaten küçük harf.) */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  if (!SLUG_RE.test(slug)) return false;
  const existing = await prisma.pdksTenant.findUnique({ where: { slug }, select: { id: true } });
  return !existing;
}

export type CreateTenantInput = {
  companyName: string;
  slug: string;
  adminFullName: string;
  adminPhone: string;
  password: string;
  ownerEmail?: string | null;
};

export type CreateTenantResult =
  | { ok: true; tenantId: string; slug: string }
  | { ok: false; reason: "slug_taken" | "slug_invalid" };

/**
 * Self-servis kayıt: yeni tenant'ı MAKUL VARSAYILANLARLA oluşturur ve ilk
 * tenant-admin personelini açar. Tenant henüz yok → unscoped `prisma`.
 *
 * Varsayılanlar (yönetici sonradan kendine göre optimize eder):
 *  - Haftalık program: DEFAULT_WEEK_SCHEDULE (Pzt–Cuma 08:30–18:30, Cmt 08:30–13:00)
 *  - Resmi tatiller: 2026 Türkiye tam günleri
 *  - 30 gün deneme (subscriptionStatus='trial', trialEndsAt=now+30g)
 */
export async function createTenantWithDefaults(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return { ok: false, reason: "slug_invalid" };
  if (!(await isSlugAvailable(slug))) return { ok: false, reason: "slug_taken" };

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const passwordHash = await hashPassword(input.password);

  const tenant = await prisma.pdksTenant.create({
    data: {
      name: input.companyName.trim(),
      slug,
      workScheduleJson: JSON.stringify(DEFAULT_WEEK_SCHEDULE),
      holidaysJson: JSON.stringify(TR_HOLIDAYS_2026),
      subscriptionStatus: "trial",
      trialEndsAt,
      ownerEmail: input.ownerEmail?.trim() || null,
      personnel: {
        create: {
          fullName: input.adminFullName.trim(),
          phone: normalizePhone(input.adminPhone),
          email: input.ownerEmail?.trim() || null,
          role: "tenant_admin",
          passwordHash,
          isActive: true,
        },
      },
    },
    select: { id: true, slug: true },
  });

  return { ok: true, tenantId: tenant.id, slug: tenant.slug };
}

export type TenantAccess = { active: boolean; status: string; daysLeft: number | null };

/**
 * Erişim kapısı kararı: deneme veya ödenmiş dönem geçerli mi?
 * (Faz 2'de /personel ve tenant paneli bu sonuca göre kilitlenecek.)
 */
export function tenantAccessStatus(t: {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}): TenantAccess {
  const now = Date.now();
  const daysFrom = (d: Date | null) =>
    d ? Math.ceil((d.getTime() - now) / (24 * 60 * 60 * 1000)) : null;

  if (t.subscriptionStatus === "active") {
    const end = t.currentPeriodEnd?.getTime() ?? Infinity;
    return { active: end >= now, status: "active", daysLeft: daysFrom(t.currentPeriodEnd) };
  }
  if (t.subscriptionStatus === "trial") {
    const end = t.trialEndsAt?.getTime() ?? 0;
    return { active: end >= now, status: "trial", daysLeft: daysFrom(t.trialEndsAt) };
  }
  // past_due | canceled | bilinmeyen → erişim yok
  return { active: false, status: t.subscriptionStatus, daysLeft: null };
}
