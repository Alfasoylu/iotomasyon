import "server-only";

import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { runWithTenant, type PdksTenantContext } from "./context";
import {
  PDKS_SESSION_COOKIE,
  createPdksSessionToken,
  verifyPdksSessionToken,
  pdksSessionCookieOptions,
} from "./session";

export type PdksSession = PdksTenantContext;

const CODE_TTL_MIN = 15;
const CODE_HASH_ROUNDS = 10;

/** Aktif PDKS personel oturumunu cookie'den okur (yoksa null). */
export async function getPdksSession(): Promise<PdksSession | null> {
  const token = (await cookies()).get(PDKS_SESSION_COOKIE)?.value;
  const p = await verifyPdksSessionToken(token);
  if (!p?.personnelId || !p.tenantId) return null;
  return {
    personnelId: String(p.personnelId),
    tenantId: String(p.tenantId),
    role: typeof p.role === "string" ? p.role : "employee",
  };
}

/** Oturum varsa handler'ı tenant bağlamı içinde çalıştırır; yoksa null. */
export async function withPdksSession<T>(
  fn: (session: PdksSession) => Promise<T>,
): Promise<T | null> {
  const session = await getPdksSession();
  if (!session) return null;
  return runWithTenant(session, () => fn(session));
}

/**
 * tenant_admin tarafından (scoped bağlam içinde) çağrılır: bir personel için
 * 6 haneli tek kullanımlık giriş kodu üretir, hash'ini saklar, düz kodu döner
 * (admin personele iletir). SMS yok.
 */
export async function issueLoginCode(
  personnelId: string,
  tenantId: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = String(randomInt(100000, 1000000)); // 6 hane, kriptografik
  const codeHash = await hash(code, CODE_HASH_ROUNDS);
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);
  await prisma.pdksLoginCode.create({
    data: { tenantId, personnelId, codeHash, expiresAt },
  });
  return { code, expiresAt };
}

/**
 * Personel girişi: telefon + kod. Oturum HENÜZ yok → unscoped `prisma` kullanılır
 * (tenant bağlamı bu adımda kurulur). Başarılıysa cookie set edilir.
 * Telefon birden çok tenant'ta olabilir; kod (bcrypt) disambiguator'dır.
 */
export async function loginWithCode(
  phone: string,
  code: string,
): Promise<PdksSession | null> {
  const candidates = await prisma.pdksPersonnel.findMany({
    where: { phone, isActive: true },
    select: { id: true, tenantId: true, role: true },
  });

  for (const p of candidates) {
    const codes = await prisma.pdksLoginCode.findMany({
      where: { personnelId: p.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    for (const c of codes) {
      if (await compare(code, c.codeHash)) {
        await prisma.pdksLoginCode.update({
          where: { id: c.id },
          data: { usedAt: new Date() },
        });
        const session: PdksSession = {
          personnelId: p.id,
          tenantId: p.tenantId,
          role: p.role,
        };
        const token = await createPdksSessionToken(session);
        (await cookies()).set(PDKS_SESSION_COOKIE, token, pdksSessionCookieOptions);
        return session;
      }
    }
  }
  return null;
}

export async function logoutPdks(): Promise<void> {
  (await cookies()).set(PDKS_SESSION_COOKIE, "", {
    ...pdksSessionCookieOptions,
    maxAge: 0,
  });
}
