"use server";

/**
 * CFO belge kütüphanesi (CFO-027): yükleme ve arşivleme. Belge KANITTIR — bu dosyadaki hiçbir işlem defter (kredi, kart, banka,
 * maliyet, komisyon) değiştirmez. Dosya private bucket'a (cfo-files/belge/) gider; motora/AI bağlamına ham dosya girmez.
 * Tablo migration 20261009240000_cfo_belge ile gelir; yoksa işlem açık bir hata döner.
 */

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkAllPermissions } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";
import { getStorageConfig } from "@/lib/storage/supabase-storage";
import { uploadPrivateCfoFile } from "@/lib/cfo-agent/private-files";
import { validateDocument } from "@/lib/cfo/documents";

async function guardWrite() {
  const user = await requireUser();
  return (await checkAllPermissions(user, PERMISSIONS.CFO_READ, PERMISSIONS.CFO_WRITE)) ? user : null;
}

async function tableReady() {
  const [r] = await prisma.$queryRaw<{ t: string | null }[]>`select to_regclass('public.cfo_belge')::text as t`;
  return r?.t != null;
}

export async function uploadDocumentAction(form: FormData): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Belge yüklemek için CFO yazma yetkisi gerekir." };
  if (!(await tableReady())) return { ok: false, message: "Belge kütüphanesi tablosu üretimde henüz yok (migration 20261009240000 onay bekliyor)." };

  const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v.trim() : ""; };
  const input = { category: str("category"), title: str("title"), description: str("description"),
    periodStart: str("periodStart") || null, periodEnd: str("periodEnd") || null, validUntil: str("validUntil") || null };
  const file = form.get("file");
  const f = file instanceof File && file.size > 0 ? file : null;
  const errors = validateDocument(input, f ? { size: f.size, type: f.type, name: f.name } : null);
  if (errors.length) return { ok: false, message: errors.join(" ") };

  const bytes = Buffer.from(await f!.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [dup] = await prisma.$queryRaw<{ id: string; baslik: string }[]>`select id, baslik from cfo_belge where sha256 = ${sha256} and arsiv_at is null limit 1`;
  if (dup) return { ok: false, message: `Bu dosya zaten yüklü: "${dup.baslik}".` };

  const storage = getStorageConfig();
  if (!storage.ok) return { ok: false, message: storage.reason };
  const safe = f!.name.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "").slice(-80) || "belge";
  const path = `belge/${randomUUID()}_${safe}`;
  const up = await uploadPrivateCfoFile(storage.config, path, new File([bytes], f!.name, { type: f!.type }));
  if (!up.ok) return { ok: false, message: up.reason };

  const who = user.email ?? user.name ?? "kullanıcı";
  await prisma.$transaction(async tx => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`insert into cfo_belge (kategori, baslik, aciklama, donem_baslangic, donem_bitis, gecerlilik_bitis,
        dosya_ref, dosya_adi, mime, boyut, sha256, yukleyen)
      values (${input.category}, ${input.title}, ${input.description}, ${input.periodStart}::date, ${input.periodEnd}::date, ${input.validUntil}::date,
        ${up.privateRef}, ${f!.name}, ${f!.type}, ${f!.size}, ${sha256}, ${who}) returning id`;
    await tx.cfoChangeLog.create({ data: { area: "veri", item: `belge ${row.id} yüklendi`, oldValue: null, newValue: `${input.category}: ${input.title}`.slice(0, 200),
      source: who, kind: "teyit", note: "Belge kanıt olarak eklendi; hiçbir defter değişmedi. Özet Cowork okumasından sonra." } });
  });
  revalidatePath("/cfo/belgeler");
  return { ok: true, message: "Belge yüklendi. Özet ve çıkarılan sayılar Cowork okumasından sonra görünür; defter değişmedi." };
}

export async function archiveDocumentAction(id: string, archived: boolean): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "CFO yazma yetkisi gerekir." };
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await tableReady())) return { ok: false, message: "Belge bulunamadı." };
  const n = await prisma.$executeRaw`update cfo_belge set arsiv_at = ${archived ? new Date() : null} where id = ${id}`;
  if (!n) return { ok: false, message: "Belge bulunamadı." };
  await prisma.cfoChangeLog.create({ data: { area: "veri", item: `belge ${id} ${archived ? "arşivlendi" : "arşivden çıkarıldı"}`, oldValue: null, newValue: null,
    source: user.email ?? user.name ?? "kullanıcı", kind: null, note: null } });
  revalidatePath("/cfo/belgeler");
  return { ok: true };
}
