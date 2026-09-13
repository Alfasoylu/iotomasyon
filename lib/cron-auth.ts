import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Cron uçları için yetki kontrolü — FAIL-CLOSED.
 *
 * Eski davranış: CRON_SECRET tanımsızsa herkes çağırabiliyordu (fail-open).
 * Şimdi: secret yoksa 503 (yanlış yapılandırma), eşleşmiyorsa 401. Karşılaştırma
 * sabit zamanlıdır. Yerelde test için .env.local'a CRON_SECRET ekleyin.
 *
 * Kullanım: `const denied = authorizeCron(req); if (denied) return denied;`
 */
export function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    console.error("[cron] CRON_SECRET tanımlı değil — istek reddedildi (fail-closed).");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);

  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
