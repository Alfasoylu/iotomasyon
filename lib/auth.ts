import "server-only";

import { compare, hash } from "bcryptjs";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminEmail, getAdminPassword } from "@/lib/env";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";

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

export async function createUserSession(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export const getCurrentSession = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);

  if (!payload?.userId) {
    return null;
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return user;
});

export async function requireUser() {
  const user = await getCurrentSession();

  if (!user) {
    redirect("/login");
  }

  return user;
}
