/** Entegra yükleme uçlarının ortak kapısı: yetki + dosya okuma. */
import { NextResponse } from "next/server";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const MAX_BYTES = 10 * 1024 * 1024;

export type Kapi =
  | { ok: true; buffer: Buffer; fileName: string; userId: string; userEmail: string; form: FormData }
  | { ok: false; res: NextResponse };

export async function kapi(req: Request): Promise<Kapi> {
  const user = await getCurrentSession();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Oturum yok" }, { status: 401 }) };
  if (!(await checkPermission(user, PERMISSIONS.CFO_WRITE))) {
    return { ok: false, res: NextResponse.json({ error: "Bu işlem için CFO yazma yetkisi gerekiyor." }, { status: 403 }) };
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

  return {
    ok: true,
    buffer: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    userId: user.id,
    userEmail: user.email,
    form,
  };
}

export function eksikSutunYaniti(eksik: string[]) {
  return NextResponse.json(
    {
      error:
        `Dosyada beklenen sütunlar yok: ${eksik.join(", ")}. ` +
        `Entegra'dan "sipariş dışa aktarım" dosyasını olduğu gibi yükleyin ` +
        `(.xlsx veya .csv).`,
    },
    { status: 400 }
  );
}
