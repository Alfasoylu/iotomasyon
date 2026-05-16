/**
 * Debug-only route — returns raw Trendyol claims API response.
 * DELETE THIS FILE after debugging is done.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BASE_URL = "https://apigw.trendyol.com/integration/order/sellers";

function daysAgo(n: number) {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

export async function GET() {
  const config = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
  if (!config || !config.isEnabled) {
    return NextResponse.json({ error: "not configured" });
  }

  const encoded = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");

  // Fetch raw claims
  const claimsUrl = new URL(`${BASE_URL}/${config.supplierId}/claims`);
  claimsUrl.searchParams.set("page", "0");
  claimsUrl.searchParams.set("size", "1");
  claimsUrl.searchParams.set("startDate", String(daysAgo(30)));
  claimsUrl.searchParams.set("endDate", String(Date.now()));

  const claimsRes = await fetch(claimsUrl.toString(), {
    headers: {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
      "User-Agent": `iotomasyon-crm/1.0 (${config.supplierId})`,
    },
  });

  const claimsRaw = await claimsRes.json();

  // Fetch raw orders
  const ordersUrl = new URL(`${BASE_URL}/${config.supplierId}/orders`);
  ordersUrl.searchParams.set("page", "0");
  ordersUrl.searchParams.set("size", "1");
  ordersUrl.searchParams.set("startDate", String(daysAgo(30)));
  ordersUrl.searchParams.set("endDate", String(Date.now()));

  const ordersRes = await fetch(ordersUrl.toString(), {
    headers: {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
      "User-Agent": `iotomasyon-crm/1.0 (${config.supplierId})`,
    },
  });

  const ordersRaw = await ordersRes.json();

  return NextResponse.json({
    claimsHttpStatus: claimsRes.status,
    claimsTopLevelKeys: Object.keys(claimsRaw ?? {}),
    firstClaim: claimsRaw?.content?.[0] ?? claimsRaw,
    ordersHttpStatus: ordersRes.status,
    ordersTopLevelKeys: Object.keys(ordersRaw ?? {}),
    firstOrder: ordersRaw?.content?.[0] ?? ordersRaw,
  });
}
