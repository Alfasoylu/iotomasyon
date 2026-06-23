import "server-only";

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { getSessionSecret, isProduction } from "@/lib/env";

/**
 * PDKS personel oturumu — mevcut CRM auth'u (lib/session.ts) ile AYNI jose/JWT
 * aracını kullanır ama AYRI cookie'dir. PDKS saha personeli CRM User'ı değildir;
 * bu yüzden CRM oturumundan bağımsız, kendi cookie'siyle kimliklenir.
 *
 * NOT: Proje NextAuth KULLANMIYOR (spec'in varsaydığının aksine) — auth özel
 * jose-JWT + cookie. Bu modül o tutarlı araca yaslanır.
 */
function getSecret(): Uint8Array {
  return new TextEncoder().encode(getSessionSecret());
}

export const PDKS_SESSION_COOKIE = "pdks_session";

export type PdksSessionPayload = JWTPayload & {
  personnelId: string;
  tenantId: string;
  role: string; // 'tenant_admin' | 'employee'
};

export async function createPdksSessionToken(payload: {
  personnelId: string;
  tenantId: string;
  role: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyPdksSessionToken(
  token: string | undefined,
): Promise<PdksSessionPayload | null> {
  if (!token) return null;
  try {
    const result = await jwtVerify<PdksSessionPayload>(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return result.payload;
  } catch {
    return null;
  }
}

export const pdksSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
