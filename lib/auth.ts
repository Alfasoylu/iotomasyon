import "server-only";

import { compare, hash } from "bcryptjs";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminEmail, getAdminPassword } from "@/lib/env";
import { resolvePermission, type ResolvedUser } from "@/lib/permissions";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";

// ── Bootstrap ────────────────────────────────────────────────────────────────

export async function ensureBootstrapAdmin() {
  const { prisma } = await import("@/lib/prisma");
  const existingAdmin = await prisma.user.findFirst();

  if (existingAdmin) {
    return existingAdmin;
  }

  const passwordHash = await hash(getAdminPassword(), 12);

  return prisma.user.create({
    data: {
      email: getAdminEmail().toLowerCase(),
      name: "Admin",
      passwordHash,
      role: "ADMIN",
    },
  });
}

// ── Authentication ───────────────────────────────────────────────────────────

export async function authenticateWithPassword(email: string, password: string) {
  const { prisma } = await import("@/lib/prisma");
  await ensureBootstrapAdmin();

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.isActive) {
    return null;
  }

  const isValid = await compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return user;
}

// ── Session helpers ───────────────────────────────────────────────────────────

export async function createUserSession(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// ── Session reads ────────────────────────────────────────────────────────────
// cache() deduplates within a single React server component render tree.
// This means getCurrentSession() runs at most once per request regardless
// of how many components/actions call it.

export const getCurrentSession = cache(async (): Promise<ResolvedUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);

  if (!payload?.userId) {
    return null;
  }

  const { prisma } = await import("@/lib/prisma");

  // Try to load user with permission overrides.
  // Falls back to empty userPermissions if the Phase 5 tables don't exist yet
  // (i.e. migration hasn't been applied to this environment).
  let user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    userPermissions: Array<{ granted: boolean; permission: { key: string } }>;
  } | null = null;

  try {
    const row = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        userPermissions: {
          select: {
            granted: true,
            permission: { select: { key: true } },
          },
        },
      },
    });
    if (row) {
      user = { ...row, role: row.role as string };
    }
  } catch {
    // Phase 5 tables not yet migrated — load user without permission overrides.
    const row = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (row) {
      user = { ...row, role: row.role as string, userPermissions: [] };
    }
  }

  if (!user || !user.isActive) {
    return null;
  }

  return user;
});

// ── requireUser ───────────────────────────────────────────────────────────────
// Use in page server components and server actions.
// Redirects to /login if not authenticated.

export async function requireUser(): Promise<ResolvedUser> {
  const user = await getCurrentSession();

  if (!user) {
    redirect("/login");
  }

  return user;
}

// ── requirePermission ─────────────────────────────────────────────────────────
// For page server components: redirects to /403 if permission denied.
// Do NOT use in server actions — use checkPermission() instead.

export async function requirePermission(permission: string): Promise<ResolvedUser> {
  const user = await requireUser();
  const permitted = await resolvePermission(user, permission);

  if (!permitted) {
    redirect("/403");
  }

  return user;
}

// ── checkPermission ───────────────────────────────────────────────────────────
// For server actions: returns boolean — caller decides how to respond.
// Server actions must return ActionResult on failure, not call redirect().

export async function checkPermission(
  user: ResolvedUser,
  permission: string,
): Promise<boolean> {
  return resolvePermission(user, permission);
}

// ── isOwner ───────────────────────────────────────────────────────────────────
// Returns true only for the single business owner account (ADMIN_EMAIL env var).
// Used to gate truly owner-only data (e.g. privateNote) — stricter than EXECUTIVE_READ,
// which any executive-role user could have.
//
// This is a single-owner business; ADMIN_EMAIL uniquely identifies the owner.

export function isOwner(user: ResolvedUser): boolean {
  try {
    return user.email.toLowerCase() === getAdminEmail().toLowerCase();
  } catch {
    // getAdminEmail() throws if env var missing — fail closed (deny access).
    return false;
  }
}
