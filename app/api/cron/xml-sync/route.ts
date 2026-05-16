/**
 * Phase 11 — XML Inventory Sync Cron Endpoint
 *
 * Called by Vercel Cron (vercel.json) every 30 minutes.
 * Iterates all enabled XmlSyncSource rows and runs sync for each.
 *
 * Security: Vercel sets `Authorization: Bearer <CRON_SECRET>` on cron calls.
 * We validate it to prevent public triggering.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/actions/xml-sync-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sources = await prisma.xmlSyncSource.findMany({
    where: { isEnabled: true },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{ sourceId: string; name: string; ok: boolean; message?: string }> = [];

  for (const source of sources) {
    const result = await runSync(source.id, source.url, source.authHeader);
    results.push({ sourceId: source.id, name: source.name, ok: result.ok, message: result.message });
  }

  return NextResponse.json({ synced: results.length, results });
}
