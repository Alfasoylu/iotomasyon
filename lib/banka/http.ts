/** Banka yükleme uçlarının ortak kapısı: yetki + dosya + banka + (varsa) elle eşleme okuma. */
import { NextResponse } from "next/server";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { BankaAlan } from "./columns";

export const MAX_BYTES = 10 * 1024 * 1024;

export type Kapi =
  | {
      ok: true;
      buffer: Buffer;
      fileName: string;
      banka: string;
      elleEsleme: Partial<Record<BankaAlan, string>> | undefined;
      userId: string;
      userEmail: string;
      form: FormData;
    }
  | { ok: false; res: NextResponse };

export async function kapi(req: Request): Promise<Kapi> {
  const user = await getCurrentSession();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Oturum yok" }, { status: 401 }) };
  if (!(await checkPermission(user, PERMISSIONS.CFO_WRITE))) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Bu işlem için CFO yazma yetkisi gerekiyor." }, { status: 403 }),
    };
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, res: NextResponse.json({ error: "Form verisi okunamadı." }, { status: 400 }) };
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, res: NextResponse.json({ error: "Dosya bulunamadı (alan adı: file)." }, { status: 400 }) };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, res: NextResponse.json({ error: "Dosya 10 MB'ı aşıyor." }, { status: 400 }) };
  }
  const izinliUzanti = /\.(xlsx|xls|csv)$/i.test(file.name);
  if (!izinliUzanti) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Yalnız .xlsx, .xls veya .csv kabul edilir. PDF bu fazda desteklenmiyor — bankadan xls/csv indirin." },
        { status: 400 }
      ),
    };
  }

  const banka = String(form.get("banka") ?? "").trim();
  if (!banka) {
    return { ok: false, res: NextResponse.json({ error: "Banka seçilmedi." }, { status: 400 }) };
  }

  let elleEsleme: Partial<Record<BankaAlan, string>> | undefined;
  const mappingRaw = form.get("mapping");
  if (typeof mappingRaw === "string" && mappingRaw.trim()) {
    try {
      elleEsleme = JSON.parse(mappingRaw);
    } catch {
      return { ok: false, res: NextResponse.json({ error: "Sütun eşlemesi okunamadı." }, { status: 400 }) };
    }
  }

  return {
    ok: true,
    buffer: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    banka,
    elleEsleme,
    userId: user.id,
    userEmail: user.email,
    form,
  };
}
