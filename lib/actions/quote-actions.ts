"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateQuoteLine,
  calculateQuoteTotals,
  DEFAULT_QUOTE_TAX_RATE,
  normalizeDecimalInput,
} from "@/lib/quote-utils";
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
      const line = calculateQuoteLine(
        item.quantity,
        item.unitPrice,
        item.discount,
        item.tax || DEFAULT_QUOTE_TAX_RATE,
      );

      return {
        productId: item.productId || null,
        description: item.description.trim(),
        quantity: line.quantity,
        unitPrice: line.unitPrice.toString(),
        currency: item.currency.trim().toUpperCase(),
        discount: line.discount.toString(),
        tax: line.taxAmount.toString(),
        total: line.total.toString(),
      };
    });

    const totals = calculateQuoteTotals(
      parsed.data.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        tax: item.tax || DEFAULT_QUOTE_TAX_RATE,
      })),
    );

    const exchangeRateNum = parsed.data.exchangeRate
      ? normalizeDecimalInput(parsed.data.exchangeRate)
      : null;

    const quote = await prisma.quote.create({
      data: {
        customerId,
        quoteNumber: await createQuoteNumber(),
        currencyMode: parsed.data.currencyMode,
        exchangeRate:
          exchangeRateNum && Number.isFinite(exchangeRateNum) ? exchangeRateNum.toString() : null,
        notes: emptyToNull(parsed.data.notes),
        paymentTerms: emptyToNull(parsed.data.paymentTerms),
        deliveryTerms: emptyToNull(parsed.data.deliveryTerms),
        warrantyTerms: emptyToNull(parsed.data.warrantyTerms),
        validityDate: parsed.data.validityDate ? new Date(parsed.data.validityDate) : null,
        subtotal: totals.subtotal.toString(),
        discountTotal: totals.discountTotal.toString(),
        taxTotal: totals.taxTotal.toString(),
        total: totals.total.toString(),
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
      message: "Teklif oluşturulamadı.",
    };
  }
}

export async function updateQuoteAction(
  quoteId: string,
  values: QuoteInput,
): Promise<ActionResult<QuoteField>> {
  await requireUser();
  const parsed = quoteSchema.safeParse(values);

  if (!parsed.success) {
    return { ok: false, message: "Teklif formunu kontrol edin." };
  }

  try {
    const preparedItems = parsed.data.items.map((item) => {
      const line = calculateQuoteLine(
        item.quantity,
        item.unitPrice,
        item.discount,
        item.tax || DEFAULT_QUOTE_TAX_RATE,
      );
      return {
        productId: item.productId || null,
        description: item.description.trim(),
        quantity: line.quantity,
        unitPrice: line.unitPrice.toString(),
        currency: item.currency.trim().toUpperCase(),
        discount: line.discount.toString(),
        tax: line.taxAmount.toString(),
        total: line.total.toString(),
      };
    });

    const totals = calculateQuoteTotals(
      parsed.data.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        tax: item.tax || DEFAULT_QUOTE_TAX_RATE,
      })),
    );

    const exchangeRateNum = parsed.data.exchangeRate
      ? normalizeDecimalInput(parsed.data.exchangeRate)
      : null;

    const quote = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        currencyMode: parsed.data.currencyMode,
        exchangeRate:
          exchangeRateNum && Number.isFinite(exchangeRateNum)
            ? exchangeRateNum.toString()
            : null,
        notes: emptyToNull(parsed.data.notes),
        paymentTerms: emptyToNull(parsed.data.paymentTerms),
        deliveryTerms: emptyToNull(parsed.data.deliveryTerms),
        warrantyTerms: emptyToNull(parsed.data.warrantyTerms),
        validityDate: parsed.data.validityDate
          ? new Date(parsed.data.validityDate)
          : null,
        subtotal: totals.subtotal.toString(),
        discountTotal: totals.discountTotal.toString(),
        taxTotal: totals.taxTotal.toString(),
        total: totals.total.toString(),
        items: {
          deleteMany: {},
          create: preparedItems,
        },
      },
      select: { id: true, customerId: true },
    });

    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath(`/quotes`);
    revalidatePath(`/customers/${quote.customerId}`);
    revalidatePath("/dashboard");

    return { ok: true, redirectTo: `/quotes/${quote.id}` };
  } catch {
    return { ok: false, message: "Teklif güncellenemedi." };
  }
}

export async function updateQuoteStatusAction(
  quoteId: string,
  status: "SENT" | "VIEWED" | "WON" | "LOST",
): Promise<ActionResult> {
  await requireUser();

  try {
    const data: Record<string, unknown> = { status };
    if (status === "SENT") data.sentAt = new Date();

    const quote = await prisma.quote.update({
      where: { id: quoteId },
      data,
      select: { id: true, customerId: true },
    });

    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath(`/customers/${quote.customerId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: false, message: "Teklif durumu güncellenemedi." };
  }
}

/** @deprecated use updateQuoteStatusAction */
export async function markQuoteSentAction(quoteId: string): Promise<ActionResult> {
  return updateQuoteStatusAction(quoteId, "SENT");
}

async function createQuoteNumber() {
  const count = await prisma.quote.count();
  const seq = String(count + 1).padStart(4, "0");
  const year = new Date().getFullYear();
  return `QT-${year}-${seq}`;
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}
