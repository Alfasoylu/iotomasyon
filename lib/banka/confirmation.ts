import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "@/lib/env";

export function signPreview(userId: string, fingerprint: string, now = Date.now()) {
  const expires = now + 15 * 60_000;
  const sig = createHmac("sha256", getSessionSecret()).update(`bank-statement|${userId}|${fingerprint}|${expires}`).digest("hex");
  return `${expires}.${sig}`;
}

export function verifyPreview(token: string, userId: string, fingerprint: string, now = Date.now()) {
  const [expiry, signature] = token.split(".");
  const expires = Number(expiry);
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + 15 * 60_000 || !/^[a-f0-9]{64}$/.test(signature ?? "")) return false;
  const expected = createHmac("sha256", getSessionSecret()).update(`bank-statement|${userId}|${fingerprint}|${expires}`).digest("hex");
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}
