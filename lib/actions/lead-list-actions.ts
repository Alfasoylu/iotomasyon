"use server";

import { revalidatePath } from "next/cache";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/customer-contact";
import type { ActionResult } from "@/types/actions";

/**
 * Phase 97 — Lead List import server actions
 *
 * createLeadListAction:
 *   - LeadList kaydı oluştur
 *   - Her satır için Customer dedup (telefon canonical) → varsa membership-only
 *   - Yoksa yeni Customer + membership
 *   - Customer.source = "{source} - {category} - {city}"
 *   - Customer.tags otomatik: ["{source}-{city}", "yeni-fırsat"]
 *   - shownInQueueCount = 0 (Power Queue'da öne çıkar)
 *
 * Önizleme (preview): kaç yeni, kaç duplikat, kaç hatalı.
 */

export interface LeadRow {
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  website?: string | null;
  category?: string | null;
}

export interface LeadListPreview {
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  invalidCount: number;
  duplicates: Array<{ name: string; phone: string; existingId: string }>;
  invalids: Array<{ row: number; reason: string; name: string }>;
}

export async function previewLeadListAction(input: {
  rows: LeadRow[];
}): Promise<ActionResult & { preview?: LeadListPreview }> {
  await requireUser();

  const dupes: LeadListPreview["duplicates"] = [];
  const invalids: LeadListPreview["invalids"] = [];

  const phoneNormalized = input.rows.map((r) => normalizePhone(r.phone || r.whatsapp));

  // Var olan müşteri telefon kontrolü
  const validPhones = phoneNormalized.filter((p): p is string => !!p);
  const existing = validPhones.length > 0
    ? await prisma.customer.findMany({
        where: {
          OR: [
            { phone: { in: validPhones } },
            { whatsapp: { in: validPhones } },
          ],
        },
        select: { id: true, name: true, phone: true, whatsapp: true },
      })
    : [];

  const existingByPhone = new Map<string, { id: string; name: string }>();
  for (const e of existing) {
    if (e.phone) existingByPhone.set(e.phone, { id: e.id, name: e.name });
    if (e.whatsapp) existingByPhone.set(e.whatsapp, { id: e.id, name: e.name });
  }

  let newCount = 0;
  input.rows.forEach((row, idx) => {
    if (!row.name?.trim()) {
      invalids.push({ row: idx + 1, reason: "İsim boş", name: row.name ?? "(boş)" });
      return;
    }
    const phone = phoneNormalized[idx];
    if (!phone) {
      invalids.push({ row: idx + 1, reason: "Geçersiz telefon", name: row.name });
      return;
    }
    const dupe = existingByPhone.get(phone);
    if (dupe) {
      dupes.push({ name: row.name, phone, existingId: dupe.id });
      return;
    }
    newCount++;
  });

  return {
    ok: true,
    preview: {
      totalRows: input.rows.length,
      newCount,
      duplicateCount: dupes.length,
      invalidCount: invalids.length,
      duplicates: dupes,
      invalids: invalids,
    },
  };
}

export async function createLeadListAction(input: {
  name: string;
  source: string;        // "Google Maps" | "Manuel" | ...
  city?: string;
  category?: string;
  customerType?: string; // CustomerType enum string
  rows: LeadRow[];
  addExistingAsMembers?: boolean; // duplikatları listeye dahil et (membership-only)
}): Promise<ActionResult & { leadListId?: string; created?: number; skipped?: number }> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, message: "Liste adı gerekli." };
  if (!input.rows.length) return { ok: false, message: "En az 1 satır gerekli." };

  try {
    const leadList = await prisma.leadList.create({
      data: {
        name,
        source: input.source,
        city: input.city ?? null,
        category: input.category ?? null,
        createdById: user.id,
      },
    });

    const autoSource = [input.source, input.category, input.city].filter(Boolean).join(" - ");
    const autoTags = [
      input.source.toLowerCase().replace(/\s+/g, "-"),
      input.city ? `${input.source.toLowerCase().replace(/\s+/g, "-")}-${input.city.toLowerCase().replace(/\s+/g, "-")}` : null,
      "yeni-fırsat",
    ].filter((t): t is string => !!t);

    let created = 0;
    let skipped = 0;

    for (const row of input.rows) {
      if (!row.name?.trim()) {
        skipped++;
        continue;
      }
      const phone = normalizePhone(row.phone || row.whatsapp);
      if (!phone) {
        skipped++;
        continue;
      }

      // Var olan müşteri kontrol
      const existing = await prisma.customer.findFirst({
        where: {
          OR: [
            { phone: phone },
            { whatsapp: phone },
          ],
        },
        select: { id: true, tags: true },
      });

      let customerId: string;
      if (existing) {
        if (!input.addExistingAsMembers) {
          skipped++;
          continue;
        }
        // Var olan müşteriye yeni tag'leri merge et
        const mergedTags = [...new Set([...existing.tags, ...autoTags])];
        await prisma.customer.update({
          where: { id: existing.id },
          data: { tags: mergedTags },
        });
        customerId = existing.id;
      } else {
        const created_ = await prisma.customer.create({
          data: {
            name: row.name.trim(),
            phone,
            whatsapp: phone,
            email: row.email?.trim() || null,
            city: row.city?.trim() || input.city || null,
            district: row.district?.trim() || null,
            address: row.address?.trim() || null,
            status: "NEW",
            customerType: (input.customerType as never) || null,
            source: autoSource,
            tags: autoTags,
            isActive: true,
            ownedById: user.id,
          },
        });
        customerId = created_.id;
        created++;
      }

      await prisma.customerLeadListMembership.upsert({
        where: { customerId_leadListId: { customerId, leadListId: leadList.id } },
        create: { customerId, leadListId: leadList.id },
        update: {},
      });
    }

    await prisma.leadList.update({
      where: { id: leadList.id },
      data: { totalCount: created + (input.addExistingAsMembers ? input.rows.length - created - skipped : 0) },
    });

    revalidatePath("/customers");
    revalidatePath("/customers/lists");
    return { ok: true, leadListId: leadList.id, created, skipped };
  } catch (e) {
    console.error("createLeadList error", e);
    return { ok: false, message: "Liste oluşturulamadı." };
  }
}

export async function deleteLeadListAction(leadListId: string, opts: { deleteCustomers: boolean }): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_DELETE))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok." };
  }

  try {
    if (opts.deleteCustomers) {
      const memberships = await prisma.customerLeadListMembership.findMany({
        where: { leadListId },
        select: { customerId: true },
      });
      const customerIds = memberships.map((m) => m.customerId);
      if (customerIds.length > 0) {
        // Sadece bu listede olan ve başka aktif membership/sipariş'i olmayanları sil
        // Güvenlik için: sadece NEW statüsünde, hiç ProductInterest'i olmayanları sil
        await prisma.customer.deleteMany({
          where: {
            id: { in: customerIds },
            status: "NEW",
            interests: { none: {} },
            marketplaceSalesRecords: { none: {} },
          },
        });
      }
    }

    await prisma.leadList.delete({ where: { id: leadListId } });
    revalidatePath("/customers");
    revalidatePath("/customers/lists");
    return { ok: true };
  } catch {
    return { ok: false, message: "Silinemedi." };
  }
}
