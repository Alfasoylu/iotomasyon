import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { getSessionSecret, isProduction } from "@/lib/env";

// Lazy — evaluated at request time, NOT at module load time.
// This prevents next build from throwing "Missing SESSION_SECRET"
// when it statically analyses the /campaigns/new import chain.
function getSecret(): Uint8Array {
  return new TextEncoder().encode(getSessionSecret());
}

export const SESSION_COOKIE_NAME = "iotomasyon_session";

// iss/aud (2026-09-14, S-O6): CRM ve PDKS aynı SESSION_SECRET'ı paylaşıyor; audience
// ayrımı bir sistemin token'ının diğerinde geçmesini imkânsız kılar. PDKS tarafı
// lib/pdks/session.ts'de "pdks" audience kullanır.
export const SESSION_ISSUER = "iotomasyon";
export const SESSION_AUDIENCE = "crm";

export type SessionPayload = JWTPayload & {
  userId: string;
  email: string;
  // Widened from "ADMIN" literal to string — accepts all UserRole enum values.
  // Existing tokens with role:"ADMIN" remain valid after this change.
  role: string;
};

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  try {
    const result = await jwtVerify<SessionPayload>(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    return result.payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
