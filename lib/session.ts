import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { env, isProduction } from "@/lib/env";

const secret = new TextEncoder().encode(env.SESSION_SECRET);
export const SESSION_COOKIE_NAME = "iotomasyon_session";

export type SessionPayload = JWTPayload & {
  userId: string;
  email: string;
  role: "ADMIN";
};

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  try {
    const result = await jwtVerify<SessionPayload>(token, secret, {
      algorithms: ["HS256"],
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
