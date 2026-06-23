import "server-only";

import webpush from "web-push";

import { prismaPdks } from "./prisma";

const publicKey = process.env.PDKS_VAPID_PUBLIC_KEY;
const privateKey = process.env.PDKS_VAPID_PRIVATE_KEY;
const subject = process.env.PDKS_VAPID_SUBJECT || "mailto:pdks@iotomasyon.app";

let configured = false;
if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export function isPushConfigured(): boolean {
  return configured;
}

export function getVapidPublicKey(): string | null {
  return publicKey ?? null;
}

export type PushPayload = { title: string; body: string; url?: string };

export type RawPushSub = { endpoint: string; p256dh: string; auth: string };

/**
 * Verilen aboneliklere push gönderir; ölü (404/410) endpoint listesini döner.
 * Cron gibi tenant bağlamı OLMAYAN, çok-tenant'lı işler için (çağıran prismaPdks
 * yerine unscoped prisma ile abonelikleri çeker ve dönen ölü endpoint'leri siler).
 */
export async function sendPushToSubs(
  subs: RawPushSub[],
  payload: PushPayload,
): Promise<string[]> {
  if (!configured) return [];
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }),
  );
  return dead;
}

/**
 * Bir personelin tüm cihazlarına push gönderir; ölü abonelikleri (404/410) temizler.
 * Tenant bağlamı içinde çağrılmalı (prismaPdks scoped → yalnızca aktif tenant'ın
 * abonelikleri sorgulanır).
 */
export async function sendPushToPersonnel(
  personnelId: string,
  payload: PushPayload,
): Promise<number> {
  if (!configured) return 0;
  const subs = await prismaPdks.pdksPushSubscription.findMany({ where: { personnelId } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await prismaPdks.pdksPushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
        }
      }
    }),
  );
  return sent;
}
