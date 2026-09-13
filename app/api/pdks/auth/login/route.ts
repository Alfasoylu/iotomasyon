import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { loginWithPassword, normalizePhone } from "@/lib/pdks/auth";
import { pdksLoginLimiter } from "@/lib/pdks/rate-limit";
import { PDKS_DEVICE_COOKIE } from "@/lib/pdks/session";
import { formatRetryAfter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "Telefon veya şifre hatalı";

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** POST /api/pdks/auth/login  body: { phone, password } */
export async function POST(req: NextRequest) {
  let body: { phone?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (!phone || !password) {
    return NextResponse.json({ error: "Telefon ve şifre gerekli" }, { status: 400 });
  }
  // NOT: Giriş tarafında PIN uzunluğu doğrulanmaz — mevcut 4 haneli PIN'ler
  // çalışmaya devam eder; 6 karakter kuralı yalnız şifre ATANIRKEN uygulanır.

  // 1) Brute-force sınırı — DB sorgusu ve bcrypt'ten ÖNCE (maliyeti de korur).
  const ip = getClientIp(req);
  const phoneKey = normalizePhone(phone) || phone;
  const limit = pdksLoginLimiter.check(ip, phoneKey);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Çok fazla başarısız deneme. ${formatRetryAfter(limit.retryAfterSec)} sonra tekrar deneyin.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  // 2) Şifre + cihaz.
  const deviceToken = (await cookies()).get(PDKS_DEVICE_COOKIE)?.value;
  const result = await loginWithPassword(phone, password, deviceToken);

  if (!result.ok) {
    pdksLoginLimiter.record(ip, phoneKey);
    // Her başarısız sonuç AYNI durum kodu (401). device_mismatch mesajı şifre
    // denenmeden üretildiğinden (bkz. loginWithPassword) şifre hakkında bilgi
    // sızdırmaz; kullanıcıya "yöneticinizden cihaz sıfırlaması isteyin" yönlendirmesi
    // için korunur.
    return NextResponse.json(
      {
        error:
          result.reason === "device_mismatch"
            ? "Bu hesap başka bir cihaza tanımlı. Yöneticinizden cihaz sıfırlaması isteyin."
            : GENERIC_ERROR,
      },
      { status: 401 },
    );
  }

  pdksLoginLimiter.clear(phoneKey);
  return NextResponse.json({ ok: true, role: result.session.role });
}
