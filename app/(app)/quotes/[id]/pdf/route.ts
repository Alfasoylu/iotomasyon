import { NextResponse } from "next/server";

import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { buildQuotePdf } from "@/lib/quote-pdf";
import { getCompanySettings } from "@/lib/get-company-settings";
import { getQuoteById } from "@/services/quote-service";

export const dynamic = "force-dynamic";
export const dynamicParams = true;
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentSession();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await checkPermission(user, PERMISSIONS.QUOTES_READ))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) return new NextResponse("Not Found", { status: 404 });

  const companySettings = await getCompanySettings();
  const bytes = await buildQuotePdf({ quote, companySettings });

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quoteNumber}.pdf"`,
    },
  });
}
