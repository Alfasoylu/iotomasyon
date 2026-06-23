import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { runWithTenant, type PdksTenantContext } from "./context";
import {
  PDKS_SESSION_COOKIE,
  PDKS_DEVICE_COOKIE,
  createPdksSessionToken,
  verifyPdksSessionToken,
  pdksSessionCookieOptions,
  pdksDeviceCookieOptions,
} from "./session";

export type PdksSession = PdksTenantContext;

const PASSWORD_HASH_ROUNDS = 10;

/**
 * Telefonu kanonik biçime indirger: yalnızca rakamlar, ülke kodu (90) ve baştaki
 * 0 atılır → "5XXXXXXXXX". Hem personel kaydında hem girişte AYNI normalize
 * kullanılır ki birebir eşleşme tutarlı olsun.
 */
export function normalizePhone(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("90")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

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

/** Şifre/PIN hash'ler (admin: oluşturma + sıfırlama). */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, PASSWORD_HASH_ROUNDS);
}

/** Cihaz token'ının saklanabilir hash'i (yüksek entropili token → SHA-256 yeterli). */
function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type PdksLoginResult =
  | { ok: true; session: PdksSession }
  | { ok: false; reason: "invalid" | "device_mismatch" };

/**
 * Personel girişi: telefon + kalıcı şifre/PIN + cihaz bağlama.
 * Oturum HENÜZ yok → unscoped `prisma` (tenant bağlamı burada kurulur). Telefon
 * birden çok tenant'ta olabilir; şifre (bcrypt) disambiguator'dır.
 *
 * Cihaz kilidi:
 * - deviceIdHash null → bu cihaza BAĞLA (yeni token üret, hash'ini sakla, cookie yaz).
 * - deviceIdHash dolu → sunulan cihaz token'ı eşleşmezse reddet (device_mismatch).
 */
export async function loginWithPassword(
  phone: string,
  password: string,
  deviceToken: string | undefined,
): Promise<PdksLoginResult> {
  const candidates = await prisma.pdksPersonnel.findMany({
    where: { phone: normalizePhone(phone), isActive: true, passwordHash: { not: null } },
    select: { id: true, tenantId: true, role: true, passwordHash: true, deviceIdHash: true },
  });

  for (const p of candidates) {
    if (!p.passwordHash) continue;
    if (!(await compare(password, p.passwordHash))) continue;

    const jar = await cookies();
    if (p.deviceIdHash) {
      if (!deviceToken || hashDeviceToken(deviceToken) !== p.deviceIdHash) {
        return { ok: false, reason: "device_mismatch" };
      }
    } else {
      // İlk giriş → bu cihaza bağla.
      const token = randomBytes(32).toString("hex");
      await prisma.pdksPersonnel.update({
        where: { id: p.id },
        data: { deviceIdHash: hashDeviceToken(token), deviceBoundAt: new Date() },
      });
      jar.set(PDKS_DEVICE_COOKIE, token, pdksDeviceCookieOptions);
    }

    const session: PdksSession = { personnelId: p.id, tenantId: p.tenantId, role: p.role };
    const sessionToken = await createPdksSessionToken(session);
    jar.set(PDKS_SESSION_COOKIE, sessionToken, pdksSessionCookieOptions);
    return { ok: true, session };
  }
  return { ok: false, reason: "invalid" };
}

export async function logoutPdks(): Promise<void> {
  (await cookies()).set(PDKS_SESSION_COOKIE, "", {
    ...pdksSessionCookieOptions,
    maxAge: 0,
  });
}
