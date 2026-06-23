import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { loginWithPassword } from "@/lib/pdks/auth";
import { PDKS_DEVICE_COOKIE } from "@/lib/pdks/session";

export const dynamic = "force-dynamic";

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

  const deviceToken = (await cookies()).get(PDKS_DEVICE_COOKIE)?.value;
  const result = await loginWithPassword(phone, password, deviceToken);

  if (!result.ok) {
    if (result.reason === "device_mismatch") {
      return NextResponse.json(
        {
          error:
            "Bu hesap başka bir cihaza tanımlı. Yöneticinizden cihaz sıfırlaması isteyin.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Telefon veya şifre hatalı" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, role: result.session.role });
}
