import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { getCurrentSession } from "@/lib/auth";
import { resolveDisplayAmounts } from "@/lib/quote-utils";
import { getQuoteById } from "@/services/quote-service";

export const runtime = "nodejs";

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
  const quoteCurrency = quote.items[0]?.currency ?? "TRY";
  const displayOptions = {
    currencyMode: (quote as { currencyMode?: string | null }).currencyMode,
    exchangeRate: (quote as { exchangeRate?: string | number | { toString(): string } | null })
      .exchangeRate,
  };

  let y = 790;
  page.drawText(toPdfSafeText("Soylu Elektronik - Quote"), {
    x: 40,
    y,
    size: 18,
    font: bold,
    color: rgb(0.1, 0.12, 0.2),
  });

  y -= 30;
  page.drawText(toPdfSafeText(`Quote: ${quote.quoteNumber}`), { x: 40, y, size: 11, font });
  y -= 18;
  page.drawText(toPdfSafeText(`Customer: ${quote.customer.name}`), { x: 40, y, size: 11, font });
  y -= 18;
  page.drawText(toPdfSafeText(`Status: ${quote.status}`), { x: 40, y, size: 11, font });

  y -= 34;
  page.drawText("Items", { x: 40, y, size: 13, font: bold });
  y -= 20;

  for (const item of quote.items) {
    const lines = [
      toPdfSafeText(item.description),
      toPdfSafeText(
        `Qty: ${item.quantity} | Unit: ${resolveDisplayAmounts(item.unitPrice.toString(), item.currency, displayOptions)} | Total: ${resolveDisplayAmounts(item.total.toString(), item.currency, displayOptions)}`,
      ),
    ];

    for (const line of lines) {
      page.drawText(line, { x: 40, y, size: 10, font });
      y -= 14;
    }

    y -= 6;
  }

  y -= 10;
  page.drawText(
    toPdfSafeText(
      `Subtotal: ${resolveDisplayAmounts(quote.subtotal.toString(), quoteCurrency, displayOptions)}`,
    ),
    {
      x: 40,
      y,
      size: 11,
      font: bold,
    },
  );
  y -= 18;
  page.drawText(
    toPdfSafeText(
      `Discount: ${resolveDisplayAmounts(quote.discountTotal.toString(), quoteCurrency, displayOptions)}`,
    ),
    {
      x: 40,
      y,
      size: 11,
      font,
    },
  );
  y -= 18;
  page.drawText(
    toPdfSafeText(
      `Tax: ${resolveDisplayAmounts(quote.taxTotal.toString(), quoteCurrency, displayOptions)}`,
    ),
    {
      x: 40,
      y,
      size: 11,
      font,
    },
  );
  y -= 18;
  page.drawText(
    toPdfSafeText(
      `Total: ${resolveDisplayAmounts(quote.total.toString(), quoteCurrency, displayOptions)}`,
    ),
    {
      x: 40,
      y,
      size: 12,
      font: bold,
    },
  );

  y -= 34;
  page.drawText("Notes", { x: 40, y, size: 13, font: bold });
  y -= 20;
  page.drawText(toPdfSafeText(quote.notes || "-"), {
    x: 40,
    y,
    size: 10,
    font,
    maxWidth: 500,
    lineHeight: 14,
  });

  const bytes = await pdf.save();

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quoteNumber}.pdf"`,
    },
  });
}

function toPdfSafeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/₺/g, "TRY ")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/[^\x20-\x7E\n\r\t]/g, "?");
}
