import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { getDatabaseUrl } from "@/lib/env";

declare global {
  var _prismaClient: PrismaClient | undefined;
}

function makePrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn"] : [],
  });
}

// Lazy proxy — DATABASE_URL is only read when the first query fires,
// NOT when this module is imported. This prevents next build from
// throwing "Missing DATABASE_URL" while collecting page configurations.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (!global._prismaClient) {
      global._prismaClient = makePrismaClient();
    }
    return Reflect.get(global._prismaClient, prop, receiver);
  },
});
