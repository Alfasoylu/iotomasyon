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
  const currencyMode = quote.currencyMode ?? "TRY";
  const exchangeRate = quote.exchangeRate != null ? Number(quote.exchangeRate) : null;

  let y = 790;
  page.drawText(toPdfSafeText("Soylu Elektronik - Teklif"), {
    x: 40,
    y,
    size: 18,
    font: bold,
    color: rgb(0.1, 0.12, 0.2),
  });

  y -= 30;
  page.drawText(toPdfSafeText(`Teklif: ${quote.quoteNumber}`), { x: 40, y, size: 11, font });
  y -= 18;
  page.drawText(toPdfSafeText(`Müşteri: ${quote.customer.name}`), { x: 40, y, size: 11, font });
  y -= 18;
  page.drawText(toPdfSafeText(`Durum: ${quote.status}`), { x: 40, y, size: 11, font });

  y -= 34;
  page.drawText("Kalemler", { x: 40, y, size: 13, font: bold });
  y -= 20;

  for (const item of quote.items) {
    const unit = resolveDisplayAmounts(Number(item.unitPrice), item.currency, currencyMode, exchangeRate);
    const total = resolveDisplayAmounts(Number(item.total), item.currency, currencyMode, exchangeRate);

    const lines = [
      toPdfSafeText(item.description),
      toPdfSafeText(
        `Adet: ${item.quantity} | Birim: ${formatDisplayPair(unit)} | Toplam: ${formatDisplayPair(total)}`,
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
      `Ara toplam: ${formatDisplayPair(
        resolveDisplayAmounts(Number(quote.subtotal), quoteCurrency, currencyMode, exchangeRate),
      )}`,
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
      `İndirim: ${formatDisplayPair(
        resolveDisplayAmounts(Number(quote.discountTotal), quoteCurrency, currencyMode, exchangeRate),
      )}`,
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
      `Vergi: ${formatDisplayPair(
        resolveDisplayAmounts(Number(quote.taxTotal), quoteCurrency, currencyMode, exchangeRate),
      )}`,
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
      `Toplam: ${formatDisplayPair(
        resolveDisplayAmounts(Number(quote.total), quoteCurrency, currencyMode, exchangeRate),
      )}`,
    ),
    {
      x: 40,
      y,
      size: 12,
      font: bold,
    },
  );

  y -= 34;
  page.drawText("Notlar", { x: 40, y, size: 13, font: bold });
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

function formatDisplayPair(result: { primary: string; secondary?: string }) {
  return result.secondary ? `${result.primary} / ${result.secondary}` : result.primary;
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
