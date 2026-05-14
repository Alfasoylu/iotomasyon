"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quoteSchema, type QuoteInput } from "@/lib/validations/quote";
import type { ActionResult } from "@/types/actions";

type QuoteField = keyof QuoteInput | `items.${number}.${string}`;

export async function createQuoteAction(
  customerId: string,
  values: QuoteInput,
): Promise<ActionResult<QuoteField>> {
  const user = await requireUser();
  const parsed = quoteSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Teklif formunu kontrol edin.",
    };
  }

  try {
    const preparedItems = parsed.data.items.map((item) => {
      const quantity = item.quantity;
      const unitPrice = decimalString(item.unitPrice);
      const discount = decimalString(item.discount);
      const tax = decimalString(item.tax);
      const total = quantity * unitPrice - discount + tax;

      return {
        productId: item.productId || null,
        description: item.description.trim(),
        quantity,
        unitPrice: unitPrice.toString(),
        currency: item.currency.trim().toUpperCase(),
        discount: discount.toString(),
        tax: tax.toString(),
        total: total.toString(),
      };
    });

    const subtotal = preparedItems.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );
    const discountTotal = preparedItems.reduce((sum, item) => sum + Number(item.discount), 0);
    const taxTotal = preparedItems.reduce((sum, item) => sum + Number(item.tax), 0);
    const total = preparedItems.reduce((sum, item) => sum + Number(item.total), 0);

    const quote = await prisma.quote.create({
      data: {
        customerId,
        quoteNumber: await createQuoteNumber(),
        notes: emptyToNull(parsed.data.notes),
        subtotal: subtotal.toString(),
        discountTotal: discountTotal.toString(),
        taxTotal: taxTotal.toString(),
        total: total.toString(),
        createdById: user.id,
        items: {
          create: preparedItems,
        },
      },
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath("/dashboard");

    return {
      ok: true,
      redirectTo: `/quotes/${quote.id}`,
    };
  } catch {
    return {
      ok: false,
      message: "Teklif olusturulamadi.",
    };
  }
}

export async function markQuoteSentAction(quoteId: string): Promise<ActionResult> {
  await requireUser();

  try {
    const quote = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: "SENT",
      },
      select: {
        id: true,
        customerId: true,
      },
    });

    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath(`/customers/${quote.customerId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: false, message: "Teklif gonderim durumu guncellenemedi." };
  }
}

async function createQuoteNumber() {
  const count = await prisma.quote.count();
  const seq = String(count + 1).padStart(4, "0");
  const year = new Date().getFullYear();
  return `QT-${year}-${seq}`;
}

function decimalString(value: string) {
  const normalized = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}
