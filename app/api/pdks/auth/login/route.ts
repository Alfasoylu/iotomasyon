import { NextResponse, type NextRequest } from "next/server";

import { loginWithCode } from "@/lib/pdks/auth";

export const dynamic = "force-dynamic";

/** POST /api/pdks/auth/login  body: { phone, code } */
export async function POST(req: NextRequest) {
  let body: { phone?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!phone || !code) {
    return NextResponse.json({ error: "Telefon ve kod gerekli" }, { status: 400 });
  }

  const session = await loginWithCode(phone, code);
  if (!session) {
    return NextResponse.json(
      { error: "Telefon veya kod hatalı ya da kodun süresi dolmuş" },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true, role: session.role });
}
