/**
 * Phase 11 — XML Inventory Sync Cron Endpoint
 *
 * Called by Vercel Cron (vercel.json) daily at 02:00 UTC (Hobby plan limit: once/day).
 * Iterates all enabled XmlSyncSource rows and runs sync for each.
 *
 * Security: Vercel sets `Authorization: Bearer <CRON_SECRET>` on cron calls.
 * lib/cron-auth.ts validates it (fail-closed: secret yoksa 503).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCron } from "@/lib/cron-auth";
import { runSync } from "@/lib/xml-sync-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min

export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const sources = await prisma.xmlSyncSource.findMany({
    where: { isEnabled: true },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{ sourceId: string; name: string; ok: boolean; message?: string }> = [];

  for (const source of sources) {
    const result = await runSync(source.id, source.url, source.secondaryUrl ?? null, source.authHeader);
    results.push({ sourceId: source.id, name: source.name, ok: result.ok, message: result.message });
  }

  return NextResponse.json({ synced: results.length, results });
}
