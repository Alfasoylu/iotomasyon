import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeBalance } from "@/lib/banka/write-balance";
import { validateBalance } from "@/lib/banka/balance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });
  if (!(await checkPermission(user, PERMISSIONS.CFO_WRITE))) return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
  let input;
  try { input = validateBalance(await req.json()); }
  catch { return NextResponse.json({ error: "Hesap, bakiye, tarih ve onay bilgilerini kontrol edin." }, { status: 400 }); }
  try {
    const result = await writeBalance(prisma, input, user.email);
    if (!result) return NextResponse.json({ error: "Hesap değişmiş. Sayfayı yenileyip bakiyeyi tekrar kontrol edin." }, { status: 409 });
    for (const path of ["/cfo", "/cfo/borclar", "/cfo/nakit-akisi", "/cfo/defter", "/admin/banka-yukleme"]) revalidatePath(path);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Bakiye kaydedilemedi. Hiçbir değişiklik yapılmadı." }, { status: 500 });
  }
}
