"use server";

/**
 * CFO / Ölü stok — bulgu defteri üzerindeki üç aksiyon.
 *
 * Neden var: ölü stok tespiti tek başına para kazandırmaz; hapsolmuş sermayeyi
 * serbest bırakan şey aksiyondur. Bu üç eylem bulgunun ömrünü yönetir:
 *   Kontrol ettim → baktım, henüz karar yok, bir sonraki kontrol tarihini ilerlet
 *   Aksiyon aldım → fiyat/kampanya/tasfiye uygulandı, sonucu bekliyorum
 *   Kapat         → iş bitti, bağlı sermaye serbest kaldı (released_capital_try)
 *
 * Kapanan bulgunun serbest bıraktığı tutar aylık olarak toplanır; "temizlenen
 * sermaye" tablosu odur. Hedef o sayının büyümesi.
 *
 * Her eylem cfo_change_log'a yazar — eski değer silinmez (CFO kuralı).
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

/** KIRMIZI bulgular iki haftada bir, SARI'lar ayda bir elden geçer. */
const RECHECK_DAYS: Record<string, number> = { KIRMIZI: 14, SARI: 30 };

function revalidateD() {
  revalidatePath("/cfo/olu-stok");
  revalidatePath("/cfo");
}

async function guardWrite() {
  const user = await requireUser();
  return (await checkPermission(user, PERMISSIONS.CFO_WRITE)) ? user : null;
}

type Finding = {
  id: bigint;
  sku: string | null;
  product_name: string | null;
  status: string | null;
  alarm: string | null;
  tied_capital_try: unknown;
  action_taken: string | null;
};

async function loadFinding(id: bigint): Promise<Finding | null> {
  const rows = await prisma.$queryRaw<Finding[]>`
    select id, sku, product_name, status, alarm, tied_capital_try, action_taken
      from cfo_dead_stock_finding where id = ${id} limit 1`;
  return rows[0] ?? null;
}

async function log(
  user: { email: string | null; name: string | null },
  kind: string,
  item: string,
  oldValue: string,
  newValue: string,
  note: string,
) {
  await prisma.cfoChangeLog.create({
    data: {
      area: "olu_stok",
      kind,
      item: item.slice(0, 120),
      oldValue,
      newValue,
      source: user.email ?? user.name ?? "kullanıcı",
      note,
    },
  });
}

/** "Kontrol ettim" — baktım, karar yok; kontrol tarihini ileri al. */
export async function markCheckedAction(id: string, note?: string): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const findingId = BigInt(id);
  const f = await loadFinding(findingId);
  if (!f) return { ok: false, message: "Bulgu bulunamadı." };

  const days = RECHECK_DAYS[f.alarm ?? ""] ?? 30;
  const trimmed = note?.trim();

  await prisma.$executeRaw`
    update cfo_dead_stock_finding
       set last_checked_at = current_date,
           next_review_at  = current_date + ${days}::int,
           watch_note      = coalesce(${trimmed ?? null}, watch_note),
           updated_at      = now()
     where id = ${findingId}`;

  await log(user, "teyit", `${f.sku ?? ""} ${f.product_name ?? ""}`.trim(),
    "kontrol bekliyor", `kontrol edildi, sonraki ${days} gün sonra`,
    trimmed ? `Kontrol notu: ${trimmed}` : "Kontrol edildi, karar verilmedi.");

  revalidateD();
  return { ok: true, message: `Kontrol işlendi. Sonraki kontrol ${days} gün sonra.` };
}

/** "Aksiyon aldım" — fiyat/kampanya/tasfiye uygulandı, sonuç bekleniyor. */
export async function markActionTakenAction(id: string, action: string): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const trimmed = action.trim();
  if (trimmed.length < 3) return { ok: false, message: "Ne yaptığınızı yazın (en az 3 karakter)." };

  const findingId = BigInt(id);
  const f = await loadFinding(findingId);
  if (!f) return { ok: false, message: "Bulgu bulunamadı." };

  await prisma.$executeRaw`
    update cfo_dead_stock_finding
       set status            = 'aksiyon_alindi',
           action_taken      = ${trimmed},
           action_applied_at = now(),
           last_checked_at   = current_date,
           next_review_at    = current_date + 14,
           updated_at        = now()
     where id = ${findingId}`;

  await log(user, "aksiyon", `${f.sku ?? ""} ${f.product_name ?? ""}`.trim(),
    f.action_taken ?? "(aksiyon yok)", trimmed,
    "Ölü stok aksiyonu uygulandı; etkisi 14 gün sonra ölçülecek.");

  revalidateD();
  return { ok: true, message: "Aksiyon kaydedildi. 14 gün sonra etkisi ölçülecek." };
}

/**
 * "Kapat" — iş bitti. Serbest kalan sermaye yazılır.
 * Tutar verilmezse bulgunun bağlı sermayesi tamamen serbest kalmış sayılır.
 */
export async function closeFindingAction(
  id: string,
  releasedTry?: number | null,
  note?: string,
): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const findingId = BigInt(id);
  const f = await loadFinding(findingId);
  if (!f) return { ok: false, message: "Bulgu bulunamadı." };

  const tied = f.tied_capital_try == null ? null : Number(f.tied_capital_try);
  const released = releasedTry != null && Number.isFinite(releasedTry) ? releasedTry : tied;
  const trimmed = note?.trim();

  await prisma.$executeRaw`
    update cfo_dead_stock_finding
       set status               = 'kapandi',
           released_capital_try = ${released},
           watch_note           = coalesce(${trimmed ?? null}, watch_note),
           last_checked_at      = current_date,
           next_review_at       = null,
           updated_at           = now()
     where id = ${findingId}`;

  await log(user, "karar", `${f.sku ?? ""} ${f.product_name ?? ""}`.trim(),
    f.status ?? "acik", "kapandi",
    `Bulgu kapatıldı. Serbest kalan sermaye: ${released ?? 0} TL.${trimmed ? ` ${trimmed}` : ""}`);

  revalidateD();
  return { ok: true, message: "Bulgu kapatıldı, serbest kalan sermaye kaydedildi." };
}
