"use server";

/**
 * CFO-012 — karar defteri (cfo_hamle) yazma yolu. Yeni karar YALNIZ ölçülebilir metrik + başlangıç + beklenen SAYI + ölçüm tarihiyle
 * kaydedilir (validateNewHamle); durum KARAR_VERILDI. Var olan kod üzerine yazılmaz (ON CONFLICT DO NOTHING), kayıt cfo_change_log'a
 * (area strateji, kind karar) düşer. Ölçüm satırları otomatik yazılır (decision-measure-job, xml-sync günlük).
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkAllPermissions } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { newHamleRow, parseTrNumber, validateNewHamle, type MetricKey } from "@/lib/cfo/decision-memory";
import { INSERT_HAMLE_SQL } from "@/lib/cfo/decision-memory-data";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

export type HamleFormInput = {
  kod: string; baslik: string; kararTarihi: string; alan: string; neden: string; yapilan: string;
  metric: string; baslangicDeger: string; beklenenDeger: string; ilkOlcumTarihi: string; beklenenEtki?: string; kaynak?: string;
};

export async function createHamleAction(input: HamleFormInput): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkAllPermissions(user, PERMISSIONS.CFO_READ, PERMISSIONS.CFO_WRITE))) return PERM_DENIED;
  const h = { ...input, kod: String(input.kod ?? "").trim().toUpperCase(), metric: input.metric as MetricKey,
    baslangicDeger: parseTrNumber(input.baslangicDeger), beklenenDeger: parseTrNumber(input.beklenenDeger) };
  const errors = validateNewHamle(h);
  if (errors.length) return { ok: false, message: errors.join(" · ") };
  try {
    const [r] = await prisma.$queryRawUnsafe<{ n: number }[]>(INSERT_HAMLE_SQL, JSON.stringify(newHamleRow(h as Parameters<typeof newHamleRow>[0])),
      user.email ?? user.name ?? "kullanıcı");
    if (!Number(r?.n)) return { ok: false, message: `${h.kod} kodu zaten var — farklı kod seçin (mevcut karar değiştirilmez).` };
    revalidatePath("/cfo/kararlar");
    return { ok: true, message: `${h.kod} kaydedildi` };
  } catch {
    return { ok: false, message: "Karar kaydedilemedi." };
  }
}
