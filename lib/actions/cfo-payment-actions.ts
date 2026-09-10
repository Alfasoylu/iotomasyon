"use server";

/**
 * CFO / Ödeme takvimi — bir hareketi "gerçekleşti" olarak işaretler.
 *
 * Takvim iki kaynaktan besleniyor: `cfo_cash_event` (çıkışlar ve diğer girişler)
 * ve `cfo_receivable` (pazaryeri hakedişleri). Hangisine yazılacağını satırın
 * türü belirler — id iki tabloda da olabileceği için tahmin yürütülmez.
 *
 * CFO kuralı gereği eski değer silinmez: her işaretleme `cfo_change_log`'a
 * düşer. Yanlışlıkla basılırsa geri alınabilir ve o da loglanır.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

/** Görünümdeki `tur` değeri hangi kaynak tabloya ait olduğunu söyler. */
const TAHSILAT_TURU = "Pazaryeri tahsilatı";

function revalidateP() {
  revalidatePath("/cfo/odemeler");
  revalidatePath("/cfo/nakit-akisi");
  revalidatePath("/cfo");
}

async function guardWrite() {
  const user = await requireUser();
  return (await checkPermission(user, PERMISSIONS.CFO_WRITE)) ? user : null;
}

async function log(
  user: { email: string | null; name: string | null },
  item: string,
  oldValue: string,
  newValue: string,
  note: string,
) {
  await prisma.cfoChangeLog.create({
    data: {
      area: "nakit",
      kind: "teyit",
      item: item.slice(0, 120),
      oldValue,
      newValue,
      source: user.email ?? user.name ?? "kullanıcı",
      note,
    },
  });
}

/**
 * Hareketi gerçekleşmiş say. Görünüm yalnızca `odendi = false` satırları
 * gösterdiği için satır listeden düşer ve yürüyen bakiye yeniden hesaplanır.
 */
export async function markMovementSettledAction(
  id: string,
  tur: string,
  aciklama: string,
): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const tahsilat = tur === TAHSILAT_TURU;
  const affected = tahsilat
    ? await prisma.$executeRaw`
        update cfo_receivable set "isCollected" = true, "updatedAt" = now()
         where id = ${id} and "isCollected" = false`
    : await prisma.$executeRaw`
        update cfo_cash_event set "isSettled" = true, "updatedAt" = now()
         where id = ${id} and "isSettled" = false`;

  if (affected === 0) {
    return { ok: false, message: "Kayıt bulunamadı ya da zaten işaretlenmiş." };
  }

  await log(user, `${tur} — ${aciklama}`.trim(), "bekliyor", "gerçekleşti",
    tahsilat ? "Tahsilat alındı olarak işaretlendi." : "Ödeme yapıldı olarak işaretlendi.");

  revalidateP();
  return { ok: true, message: tahsilat ? "Tahsilat işlendi." : "Ödeme işlendi." };
}

/** Yanlış basılan işareti geri alır; geri alma da deftere yazılır. */
export async function undoMovementSettledAction(
  id: string,
  tur: string,
  aciklama: string,
): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const tahsilat = tur === TAHSILAT_TURU;
  const affected = tahsilat
    ? await prisma.$executeRaw`
        update cfo_receivable set "isCollected" = false, "updatedAt" = now()
         where id = ${id} and "isCollected" = true`
    : await prisma.$executeRaw`
        update cfo_cash_event set "isSettled" = false, "updatedAt" = now()
         where id = ${id} and "isSettled" = true`;

  if (affected === 0) return { ok: false, message: "Geri alınacak kayıt bulunamadı." };

  await log(user, `${tur} — ${aciklama}`.trim(), "gerçekleşti", "bekliyor",
    "İşaret geri alındı; hareket takvime geri döndü.");

  revalidateP();
  return { ok: true, message: "Geri alındı." };
}
