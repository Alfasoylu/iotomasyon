import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
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

/**
 * Aktif PDKS personel oturumunu cookie'den okur (yoksa null).
 *
 * JWT imzası geçerli olsa bile oturum HER istekte DB'ye karşı yeniden
 * doğrulanır (tek ucuz `findUnique` + `select`):
 *  - personel silinmiş / pasife alınmışsa            → null
 *  - tenant'ı değişmişse (token'daki tenantId ≠ DB)   → null
 *  - cihaza bağlıysa ve bu isteğin cihaz cookie'si
 *    `deviceIdHash` ile eşleşmiyorsa (admin cihazı sıfırladı
 *    ya da hesap başka cihaza bağlandı)                → null
 *  - rol DB'den taze okunur (token'daki eski rol kullanılmaz)
 *
 * `cache()` aynı RSC render ağacında (sayfa + withPdksSession + action) tek
 * sorguya indirger; route handler'larda sadece doğrudan çalışır.
 */
export const getPdksSession = cache(async (): Promise<PdksSession | null> => {
  const jar = await cookies();
  const token = jar.get(PDKS_SESSION_COOKIE)?.value;
  const p = await verifyPdksSessionToken(token);
  if (!p?.personnelId || !p.tenantId) return null;

  const personnelId = String(p.personnelId);
  const row = await prisma.pdksPersonnel.findUnique({
    where: { id: personnelId },
    select: { tenantId: true, role: true, isActive: true, deviceIdHash: true },
  });
  if (!row || !row.isActive) return null;
  if (row.tenantId !== String(p.tenantId)) return null;

  if (row.deviceIdHash) {
    const deviceToken = jar.get(PDKS_DEVICE_COOKIE)?.value;
    if (!deviceToken || hashDeviceToken(deviceToken) !== row.deviceIdHash) return null;
  }

  return { personnelId, tenantId: row.tenantId, role: row.role };
});

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
 * Cihaz kilidi — şifreden BAĞIMSIZ ön filtre:
 * - deviceIdHash null → aday (ilk giriş, bu cihaza BAĞLANIR).
 * - deviceIdHash dolu ve sunulan cihaz token'ı eşleşiyor → aday.
 * - deviceIdHash dolu ve eşleşmiyor → aday DEĞİL; bcrypt hiç çalışmaz.
 *
 * Böylece `device_mismatch` yalnızca "bu telefonun tüm aktif hesapları başka
 * cihaza bağlı" durumunda ve şifre denenmeden döner: yanıt, şifrenin doğru olup
 * olmadığı hakkında hiçbir bilgi taşımaz (eski sürümde 403 yalnız bcrypt
 * başarılıysa dönüyordu → şifre oracle'ı). Ön filtre ayrıca aynı telefonu
 * paylaşan personel için gereksiz bcrypt turlarını da eler.
 *
 * Çağıran (route) rate limit'i bu fonksiyondan ÖNCE uygular.
 */
export async function loginWithPassword(
  phone: string,
  password: string,
  deviceToken: string | undefined,
): Promise<PdksLoginResult> {
  const all = await prisma.pdksPersonnel.findMany({
    where: { phone: normalizePhone(phone), isActive: true, passwordHash: { not: null } },
    select: { id: true, tenantId: true, role: true, passwordHash: true, deviceIdHash: true },
  });

  const presentedHash = deviceToken ? hashDeviceToken(deviceToken) : null;
  const candidates = all.filter((p) => !p.deviceIdHash || p.deviceIdHash === presentedHash);

  if (candidates.length === 0) {
    // Telefon kayıtlı ama her hesap başka cihaza bağlı → şifre denenmeden reddet.
    return { ok: false, reason: all.length > 0 ? "device_mismatch" : "invalid" };
  }

  for (const p of candidates) {
    if (!p.passwordHash) continue;
    if (!(await compare(password, p.passwordHash))) continue;

    const jar = await cookies();
    if (!p.deviceIdHash) {
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
