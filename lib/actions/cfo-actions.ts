"use server";

/**
 * Faz 90 — CFO Modülü Server Actions
 *
 * Kural: her mutasyon CfoChangeLog'a bir satır yazar. Eski değer silinmez.
 * Yetki: cfo.write (finansal sır — ADMIN/OWNER dışına RolePermission ile verilmez).
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";
import { computeCfo } from "@/lib/cfo/engine";
import { loadCfoData } from "@/lib/cfo/queries";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

function revalidateCfo() {
  for (const p of ["/cfo", "/cfo/borclar", "/cfo/nakit-akisi", "/cfo/alacaklar", "/cfo/gumruk", "/cfo/sermaye", "/cfo/ayarlar"]) {
    revalidatePath(p);
  }
}

async function guard() {
  const user = await requireUser();
  const ok = await checkPermission(user, PERMISSIONS.CFO_WRITE);
  return ok ? user : null;
}

/**
 * Çağrı yerleri tablo adı geçiriyor (okunur ve yerel olarak doğru). Ama
 * `cfo_change_log.area` artık KONU sözlüğüyle sınırlı — DB'de CHECK var, sözlük
 * dışı değer INSERT'i reddeder. Tablo adını burada konuya çeviriyoruz; böylece
 * çağrı yerleri sade kalıyor ve log sorgulanabilir oluyor.
 * Sözlüğün tamamı: docs/CFO-GOREV.md §7
 */
const AREA_BY_TABLE: Record<string, string> = {
  cfo_bank_account: "banka",
  cfo_cash_event: "nakit",
  cfo_credit_card: "kart",
  cfo_loan: "kredi",
  cfo_receivable: "alacak",
  cfo_settings: "veri",
};

async function logChange(area: string, item: string, oldValue: unknown, newValue: unknown, source: string, note?: string) {
  await prisma.cfoChangeLog.create({
    data: {
      area: AREA_BY_TABLE[area] ?? area,
      kind: "duzeltme",
      item,
      oldValue: oldValue == null ? null : String(oldValue),
      newValue: newValue == null ? null : String(newValue),
      source, note: note ?? null,
    },
  });
}

// ── Banka bakiyesi ───────────────────────────────────────────────────────────

export async function updateBankBalanceAction(input: {
  id: string; balanceTry: number | null; kmhLimitTry?: number; note?: string; source?: string;
}): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;
  try {
    const prev = await prisma.cfoBankAccount.findUnique({ where: { id: input.id } });
    if (!prev) return { ok: false, message: "Hesap bulunamadı." };
    await prisma.cfoBankAccount.update({
      where: { id: input.id },
      data: {
        balanceTry: input.balanceTry,
        ...(input.kmhLimitTry != null ? { kmhLimitTry: input.kmhLimitTry } : {}),
        dataTag: input.balanceTry == null ? "GUNCELLEME_GEREKLI" : "KESIN",
        lastUpdatedAt: new Date(),
        ...(input.note ? { note: input.note } : {}),
      },
    });
    await logChange("cfo_bank_account", `${prev.name} bakiye`, prev.balanceTry?.toString() ?? "BİLİNMİYOR",
      input.balanceTry ?? "BİLİNMİYOR", input.source ?? user.email);
    revalidateCfo();
    return { ok: true, message: "Bakiye güncellendi." };
  } catch {
    return { ok: false, message: "Bakiye güncellenemedi." };
  }
}

// ── Kredi kartı ──────────────────────────────────────────────────────────────

export async function updateCardAction(input: {
  id: string; totalDebtTry?: number | null; minOverrideTry?: number | null;
  currentMonthState?: "ODENDI" | "ODENMEDI" | "TEYIT_EDILMELI" | "KISMI_ODENDI";
  statementDay?: number | null; dueDay?: number | null; source?: string;
}): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;
  try {
    const prev = await prisma.cfoCreditCard.findUnique({ where: { id: input.id } });
    if (!prev) return { ok: false, message: "Kart bulunamadı." };
    await prisma.cfoCreditCard.update({
      where: { id: input.id },
      data: {
        ...(input.totalDebtTry !== undefined ? { totalDebtTry: input.totalDebtTry, dataTag: input.totalDebtTry == null ? "GUNCELLEME_GEREKLI" : "KESIN" } : {}),
        ...(input.minOverrideTry !== undefined ? { minOverrideTry: input.minOverrideTry } : {}),
        ...(input.currentMonthState ? { currentMonthState: input.currentMonthState } : {}),
        ...(input.statementDay !== undefined ? { statementDay: input.statementDay } : {}),
        ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
        lastUpdatedAt: new Date(),
      },
    });
    if (input.totalDebtTry !== undefined) {
      await logChange("cfo_credit_card", `${prev.bank} ${prev.holder ?? ""} borç`.trim(),
        prev.totalDebtTry?.toString() ?? "BİLİNMİYOR", input.totalDebtTry ?? "BİLİNMİYOR", input.source ?? user.email);
    }
    if (input.currentMonthState) {
      await logChange("cfo_credit_card", `${prev.bank} ${prev.holder ?? ""} ödeme durumu`.trim(),
        prev.currentMonthState, input.currentMonthState, input.source ?? user.email);
    }
    revalidateCfo();
    return { ok: true, message: "Kart güncellendi." };
  } catch {
    return { ok: false, message: "Kart güncellenemedi." };
  }
}

// ── Kredi ────────────────────────────────────────────────────────────────────

export async function updateLoanAction(input: {
  id: string; interestRatePct?: number | null; currentMonthState?: "ODENDI" | "ODENMEDI" | "TEYIT_EDILMELI" | "KISMI_ODENDI";
  status?: "AKTIF" | "KAPANDI" | "BEKLEMEDE"; earlyPayoffTry?: number | null; nextPaymentDate?: Date | null; source?: string;
}): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;
  try {
    const prev = await prisma.cfoLoan.findUnique({ where: { id: input.id } });
    if (!prev) return { ok: false, message: "Kredi bulunamadı." };
    await prisma.cfoLoan.update({
      where: { id: input.id },
      data: {
        ...(input.interestRatePct !== undefined ? { interestRatePct: input.interestRatePct } : {}),
        ...(input.currentMonthState ? { currentMonthState: input.currentMonthState } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.earlyPayoffTry !== undefined ? { earlyPayoffTry: input.earlyPayoffTry } : {}),
        ...(input.nextPaymentDate !== undefined ? { nextPaymentDate: input.nextPaymentDate } : {}),
        lastUpdatedAt: new Date(),
      },
    });
    if (input.interestRatePct !== undefined) {
      await logChange("cfo_loan", `${prev.bank} — ${prev.name} faiz oranı`,
        prev.interestRatePct?.toString() ?? "YOK", input.interestRatePct, input.source ?? user.email);
    }
    if (input.status) {
      await logChange("cfo_loan", `${prev.bank} — ${prev.name} durum`, prev.status, input.status, input.source ?? user.email);
    }
    revalidateCfo();
    return { ok: true, message: "Kredi güncellendi." };
  } catch {
    return { ok: false, message: "Kredi güncellenemedi." };
  }
}

// ── Pazaryeri hakedişi ───────────────────────────────────────────────────────

export async function upsertReceivablesAction(input: {
  channel: string; source: string;
  rows: Array<{ dueDate: string; amountTry: number }>;
  replaceFuture?: boolean;
}): Promise<ActionResult & { count?: number }> {
  const user = await guard();
  if (!user) return PERM_DENIED;
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (input.replaceFuture) {
      await prisma.cfoReceivable.deleteMany({
        where: { channel: input.channel, isCollected: false, dueDate: { gte: today } },
      });
    }
    await prisma.cfoReceivable.createMany({
      data: input.rows.map((r) => ({
        channel: input.channel,
        dueDate: new Date(r.dueDate),
        amountTry: r.amountTry,
        certainty: "KESIN" as const,
        source: input.source,
      })),
    });
    const total = input.rows.reduce((a, r) => a + r.amountTry, 0);
    await logChange("cfo_receivable", `${input.channel} ödeme takvimi`, null,
      `${input.rows.length} ödeme / ${Math.round(total).toLocaleString("tr-TR")} TL`, input.source);
    revalidateCfo();
    return { ok: true, message: `${input.rows.length} hakediş kaydedildi.`, count: input.rows.length };
  } catch {
    return { ok: false, message: "Hakedişler kaydedilemedi." };
  }
}

export async function markReceivableCollectedAction(id: string): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;
  try {
    const r = await prisma.cfoReceivable.update({ where: { id }, data: { isCollected: true } });
    await logChange("cfo_receivable", `${r.channel} ${r.dueDate.toLocaleDateString("tr-TR")}`, "Bekliyor", "Tahsil edildi", user.email);
    revalidateCfo();
    return { ok: true, message: "Tahsilat işaretlendi." };
  } catch {
    return { ok: false, message: "İşaretlenemedi." };
  }
}

// ── Nakit olayı ──────────────────────────────────────────────────────────────

export async function settleCashEventAction(id: string): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;
  try {
    const e = await prisma.cfoCashEvent.update({ where: { id }, data: { isSettled: true } });
    await logChange("cfo_cash_event", e.description, "Bekliyor", "Gerçekleşti", user.email);
    revalidateCfo();
    return { ok: true, message: "Ödeme gerçekleşti olarak işaretlendi." };
  } catch {
    return { ok: false, message: "İşaretlenemedi." };
  }
}

// ── Ayarlar ──────────────────────────────────────────────────────────────────

export async function updateCfoSettingsAction(input: {
  usdTryRate?: number; kmhMonthlyRatePct?: number; cardMinPct?: number;
  last14dRevenueTry?: number; last14dRevenueDate?: Date;
  customsReserveTarget?: number; customsReserveDate?: Date; customsReserveSaved?: number;
  usdWealthTarget?: number; wealthTargetDate?: Date;
  stockCostUsd?: number; blockedStockUsd?: number;
}): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;
  try {
    const prev = await prisma.cfoSettings.findFirst();
    if (!prev) {
      await prisma.cfoSettings.create({ data: { ...input, updatedByEmail: user.email } });
    } else {
      await prisma.cfoSettings.update({ where: { id: prev.id }, data: { ...input, updatedByEmail: user.email } });
      if (input.last14dRevenueTry != null) {
        await logChange("cfo_settings", "Son 14 gün cirosu",
          prev.last14dRevenueTry?.toString() ?? null, input.last14dRevenueTry, user.email);
      }
      if (input.usdTryRate != null && Number(prev.usdTryRate) !== input.usdTryRate) {
        await logChange("cfo_settings", "USD/TRY kuru", prev.usdTryRate.toString(), input.usdTryRate, user.email);
      }
    }
    revalidateCfo();
    return { ok: true, message: "Ayarlar güncellendi." };
  } catch {
    return { ok: false, message: "Ayarlar güncellenemedi." };
  }
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

/** Anlık net ticari serveti hesaplayıp snapshot olarak kaydeder (trend için). */
export async function takeCfoSnapshotAction(note?: string): Promise<ActionResult> {
  const user = await guard();
  if (!user) return PERM_DENIED;
  try {
    const { raw } = await loadCfoData();
    const o = computeCfo(raw);
    await prisma.cfoSnapshot.create({
      data: {
        netWorthTry: o.narrowWorthTry, netWorthUsd: o.narrowWorthUsd,
        wideWorthTry: o.wideWorthTry, wideWorthUsd: o.wideWorthUsd,
        cashTry: o.netCashTry, receivablesTry: o.receivablesPendingTry,
        stockTry: o.sellableStockTry, debtTry: o.totalFinancialDebtTry,
        usdTryRate: o.usdTry, note: note ?? null,
      },
    });
    revalidateCfo();
    return { ok: true, message: "Snapshot alındı." };
  } catch {
    return { ok: false, message: "Snapshot alınamadı." };
  }
}
