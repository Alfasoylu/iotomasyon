import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { NextResponse } from "next/server";
import { PDFFont, PDFDocument, PDFPage, rgb } from "pdf-lib";

import { getCurrentSession } from "@/lib/auth";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import {
  formatDisplayPair,
  formatQuoteStatus,
  inferTaxRateFromStored,
  resolveDisplayAmounts,
} from "@/lib/quote-utils";
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
  pdf.registerFontkit(fontkit);

  const fontPath = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "compiled",
    "@vercel",
    "og",
    "Geist-Regular.ttf",
  );
  const fontBytes = await readFile(fontPath);
  const regular = await pdf.embedFont(fontBytes, { subset: true });
  const strong = regular;

  const page = pdf.addPage([595, 842]);
  const quoteCurrency = quote.items[0]?.currency ?? "TRY";
  const currencyMode = quote.currencyMode ?? "TRY";
  const exchangeRate = quote.exchangeRate != null ? Number(quote.exchangeRate) : null;

  drawHeader(page, regular, strong);
  drawMetadata(page, regular, strong, quote.quoteNumber, quote.createdAt, quote.validityDate, formatQuoteStatus(quote.status));
  drawCustomerBox(page, regular, strong, {
    companyOrName: quote.customer.company ?? quote.customer.name,
    contactName: quote.customer.name,
    phone: quote.customer.phone,
    whatsapp: quote.customer.whatsapp,
    email: quote.customer.email,
  });

  let tableY = 516;
  drawTableHeader(page, regular, strong, tableY);
  tableY -= 34;

  quote.items.forEach((item, index) => {
    const taxRate = inferTaxRateFromStored(
      item.quantity,
      item.unitPrice.toString(),
      item.discount.toString(),
      item.tax.toString(),
    );
    const unitDisplay = formatDisplayPair(
      resolveDisplayAmounts(Number(item.unitPrice), item.currency, currencyMode, exchangeRate),
    );
    const totalDisplay = formatDisplayPair(
      resolveDisplayAmounts(Number(item.total), item.currency, currencyMode, exchangeRate),
    );

    drawTableRow(page, regular, strong, tableY, {
      index: index + 1,
      title: item.product ? `${item.product.name} (${item.product.sku})` : "Manuel kalem",
      description: item.description,
      quantity: String(item.quantity),
      unitDisplay,
      taxRate: `${taxRate.toFixed(0)}%`,
      totalDisplay,
      shaded: index % 2 === 0,
    });

    tableY -= 44;
  });

  const subtotalDisplay = formatDisplayPair(
    resolveDisplayAmounts(Number(quote.subtotal), quoteCurrency, currencyMode, exchangeRate),
  );
  const discountDisplay = formatDisplayPair(
    resolveDisplayAmounts(Number(quote.discountTotal), quoteCurrency, currencyMode, exchangeRate),
  );
  const taxDisplay = formatDisplayPair(
    resolveDisplayAmounts(Number(quote.taxTotal), quoteCurrency, currencyMode, exchangeRate),
  );
  const totalDisplay = formatDisplayPair(
    resolveDisplayAmounts(Number(quote.total), quoteCurrency, currencyMode, exchangeRate),
  );

  drawTotalsBox(page, regular, strong, tableY - 12, [
    ["Ara Toplam", subtotalDisplay],
    ["İndirim", discountDisplay],
    ["KDV", taxDisplay],
    ["Genel Toplam", totalDisplay],
  ]);

  drawFooter(page, regular, strong, {
    notes: quote.notes,
    validityDate: quote.validityDate,
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

function drawHeader(page: PDFPage, font: PDFFont, strong: PDFFont) {
  page.drawRectangle({
    x: 36,
    y: 736,
    width: 523,
    height: 86,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.84, 0.87, 0.92),
    borderWidth: 1,
  });

  page.drawText(safeText(COMPANY_SETTINGS.companyName), {
    x: 52,
    y: 792,
    size: 22,
    font: strong,
    color: rgb(0.08, 0.12, 0.2),
  });
  page.drawText(safeText(COMPANY_SETTINGS.website), {
    x: 52,
    y: 774,
    size: 10,
    font,
    color: rgb(0.34, 0.4, 0.46),
  });
  page.drawText(safeText(`${COMPANY_SETTINGS.email} • ${COMPANY_SETTINGS.phone}`), {
    x: 52,
    y: 758,
    size: 10,
    font,
    color: rgb(0.34, 0.4, 0.46),
  });
  page.drawText(safeText("Fiyat Teklifi"), {
    x: 420,
    y: 786,
    size: 20,
    font: strong,
    color: rgb(0.08, 0.12, 0.2),
  });
}

function drawMetadata(
  page: PDFPage,
  font: PDFFont,
  strong: PDFFont,
  quoteNumber: string,
  createdAt: Date,
  validityDate: Date | null,
  status: string,
) {
  const rows: Array<[string, string]> = [
    ["Teklif No", quoteNumber],
    ["Teklif Tarihi", formatDate(createdAt)],
    ["Geçerlilik Tarihi", validityDate ? formatDate(validityDate) : "Belirtilmedi"],
    ["Durum", status],
  ];
  const positions: Array<[number, number]> = [
    [36, 706],
    [300, 706],
    [36, 674],
    [300, 674],
  ];

  rows.forEach(([label, value], index) => {
    const [x, y] = positions[index];
    drawLabelValue(page, font, strong, x, y, label, value);
  });
}

function drawCustomerBox(
  page: PDFPage,
  font: PDFFont,
  strong: PDFFont,
  customer: {
    companyOrName: string;
    contactName: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
  },
) {
  page.drawRectangle({
    x: 36,
    y: 556,
    width: 523,
    height: 92,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.84, 0.87, 0.92),
    borderWidth: 1,
  });
  page.drawText("Müşteri Bilgileri", {
    x: 52,
    y: 622,
    size: 11,
    font: strong,
    color: rgb(0.18, 0.22, 0.28),
  });

  drawLabelValue(page, font, strong, 52, 600, "Müşteri adı", customer.companyOrName);
  drawLabelValue(page, font, strong, 300, 600, "Yetkili kişi", customer.contactName);
  drawLabelValue(
    page,
    font,
    strong,
    52,
    576,
    "Telefon / WhatsApp",
    `${customer.phone ?? "-"} / ${customer.whatsapp ?? "-"}`,
  );
  drawLabelValue(page, font, strong, 300, 576, "E-posta", customer.email ?? "-");
}

function drawTableHeader(page: PDFPage, font: PDFFont, strong: PDFFont, y: number) {
  page.drawRectangle({
    x: 36,
    y: y - 10,
    width: 523,
    height: 24,
    color: rgb(0.08, 0.12, 0.2),
  });

  const headers = [
    ["#", 44],
    ["Ürün / Açıklama", 70],
    ["Adet", 280],
    ["Birim fiyat", 320],
    ["KDV %", 430],
    ["Toplam", 470],
  ] as const;

  headers.forEach(([label, x]) => {
    page.drawText(label, {
      x,
      y,
      size: 8,
      font: strong,
      color: rgb(1, 1, 1),
    });
  });
}

function drawTableRow(
  page: PDFPage,
  font: PDFFont,
  strong: PDFFont,
  y: number,
  row: {
    index: number;
    title: string;
    description: string;
    quantity: string;
    unitDisplay: string;
    taxRate: string;
    totalDisplay: string;
    shaded: boolean;
  },
) {
  page.drawRectangle({
    x: 36,
    y: y - 22,
    width: 523,
    height: 38,
    color: row.shaded ? rgb(0.99, 0.99, 1) : rgb(1, 1, 1),
    borderColor: rgb(0.9, 0.92, 0.95),
    borderWidth: 0.5,
  });

  page.drawText(String(row.index), { x: 44, y, size: 9, font });
  page.drawText(limitText(row.title, 28), {
    x: 70,
    y,
    size: 9,
    font: strong,
    color: rgb(0.12, 0.16, 0.22),
  });
  page.drawText(limitText(row.description, 34), {
    x: 70,
    y: y - 12,
    size: 8,
    font,
    color: rgb(0.36, 0.4, 0.46),
  });
  page.drawText(row.quantity, { x: 280, y, size: 9, font });
  page.drawText(row.unitDisplay, { x: 320, y, size: 8, font });
  page.drawText(row.taxRate, { x: 430, y, size: 8, font });
  page.drawText(row.totalDisplay, { x: 470, y, size: 8, font });
}

function drawTotalsBox(
  page: PDFPage,
  font: PDFFont,
  strong: PDFFont,
  topY: number,
  rows: Array<[string, string]>,
) {
  page.drawRectangle({
    x: 330,
    y: topY - 106,
    width: 229,
    height: 114,
    color: rgb(0.98, 0.98, 1),
    borderColor: rgb(0.84, 0.87, 0.92),
    borderWidth: 1,
  });
  page.drawText("Toplamlar", {
    x: 346,
    y: topY - 14,
    size: 11,
    font: strong,
    color: rgb(0.08, 0.12, 0.2),
  });

  rows.forEach(([label, value], index) => {
    const rowY = topY - 36 - index * 18;
    const isLast = index === rows.length - 1;
    page.drawText(label, {
      x: 346,
      y: rowY,
      size: isLast ? 10 : 9,
      font: isLast ? strong : font,
      color: rgb(0.2, 0.24, 0.3),
    });
    page.drawText(value, {
      x: 462,
      y: rowY,
      size: isLast ? 10 : 9,
      font: isLast ? strong : font,
      color: rgb(0.08, 0.12, 0.2),
    });
  });
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  strong: PDFFont,
  data: { notes: string | null; validityDate: Date | null },
) {
  page.drawRectangle({
    x: 36,
    y: 54,
    width: 523,
    height: 126,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.84, 0.87, 0.92),
    borderWidth: 1,
  });
  page.drawText("Notlar ve Koşullar", {
    x: 52,
    y: 160,
    size: 11,
    font: strong,
    color: rgb(0.18, 0.22, 0.28),
  });

  drawWrappedText(page, font, 52, 142, data.notes || "-", 486, 12, 2);
  drawWrappedText(page, font, 52, 116, COMPANY_SETTINGS.paymentTerms, 486, 12, 1);
  drawWrappedText(page, font, 52, 100, COMPANY_SETTINGS.deliveryTerms, 486, 12, 1);
  drawWrappedText(
    page,
    strong,
    52,
    78,
    `Bu teklif ${
      data.validityDate ? formatDate(data.validityDate) : "belirtilen geçerlilik tarihi"
    } sonuna kadar geçerlidir. Sorularınız için bizimle iletişime geçebilirsiniz.`,
    486,
    12,
    2,
  );
}

function drawLabelValue(
  page: PDFPage,
  font: PDFFont,
  strong: PDFFont,
  x: number,
  y: number,
  label: string,
  value: string,
) {
  page.drawText(safeText(label), {
    x,
    y,
    size: 8,
    font: strong,
    color: rgb(0.36, 0.4, 0.46),
  });
  page.drawText(safeText(value), {
    x,
    y: y - 12,
    size: 10,
    font,
    color: rgb(0.12, 0.16, 0.22),
  });
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  value: string,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const lines = wrapText(safeText(value), 92).slice(0, maxLines);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size: 9,
      font,
      maxWidth,
      color: rgb(0.18, 0.22, 0.28),
    });
  });
}

function wrapText(value: string, maxChars: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function limitText(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(value);
}

function safeText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}
