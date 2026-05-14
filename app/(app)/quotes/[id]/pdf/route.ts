import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { getCurrentSession } from "@/lib/auth";
import { formatCurrencyAmount } from "@/lib/quote-utils";
import { getQuoteById } from "@/services/quote-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentSession();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const quote = await getQuoteById(id);

  if (!quote) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const currency = quote.items[0]?.currency ?? "TRY";

  let y = 790;
  page.drawText("Soylu Elektronik - Quote", {
    x: 40,
    y,
    size: 18,
    font: bold,
    color: rgb(0.1, 0.12, 0.2),
  });

  y -= 30;
  page.drawText(`Quote: ${quote.quoteNumber}`, { x: 40, y, size: 11, font });
  y -= 18;
  page.drawText(`Customer: ${quote.customer.name}`, { x: 40, y, size: 11, font });
  y -= 18;
  page.drawText(`Status: ${quote.status}`, { x: 40, y, size: 11, font });

  y -= 34;
  page.drawText("Items", { x: 40, y, size: 13, font: bold });
  y -= 20;

  for (const item of quote.items) {
    const lines = [
      `${item.description}`,
      `Qty: ${item.quantity} | Unit: ${formatCurrencyAmount(item.unitPrice.toString(), item.currency)} | Total: ${formatCurrencyAmount(item.total.toString(), item.currency)}`,
    ];

    for (const line of lines) {
      page.drawText(line, { x: 40, y, size: 10, font });
      y -= 14;
    }

    y -= 6;
  }

  y -= 10;
  page.drawText(`Subtotal: ${formatCurrencyAmount(quote.subtotal.toString(), currency)}`, {
    x: 40,
    y,
    size: 11,
    font: bold,
  });
  y -= 18;
  page.drawText(`Discount: ${formatCurrencyAmount(quote.discountTotal.toString(), currency)}`, {
    x: 40,
    y,
    size: 11,
    font,
  });
  y -= 18;
  page.drawText(`Tax: ${formatCurrencyAmount(quote.taxTotal.toString(), currency)}`, {
    x: 40,
    y,
    size: 11,
    font,
  });
  y -= 18;
  page.drawText(`Total: ${formatCurrencyAmount(quote.total.toString(), currency)}`, {
    x: 40,
    y,
    size: 12,
    font: bold,
  });

  y -= 34;
  page.drawText("Notes", { x: 40, y, size: 13, font: bold });
  y -= 20;
  page.drawText(quote.notes || "-", { x: 40, y, size: 10, font, maxWidth: 500, lineHeight: 14 });

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quoteNumber}.pdf"`,
    },
  });
}
