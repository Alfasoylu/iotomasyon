import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { getDatabaseUrl } from "@/lib/env";
import { decryptResult, encryptData, SECRET_FIELDS } from "@/lib/crypto/secret-box";

declare global {
  var _prismaClient: PrismaClient | undefined;
}

function makePrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn"] : [],
  });
  return withEncryptedSecrets(base);
}

// Pazaryeri API kimlik bilgileri (lib/crypto/secret-box.ts SECRET_FIELDS) yazılırken şifrelenir, okunurken çözülür — CFO-016/RF-012.
// Tek katman: tüm findUnique/findFirst/upsert/update çağrıları (≈15 yer) değişmeden düz metin görür. Anahtar yoksa davranış aynı.
// Tip değişmez (sorgu eklentisi yalnız veri dönüştürür) → PrismaClient olarak döner.
type QueryArgs = Record<string, unknown> & { data?: unknown; create?: unknown; update?: unknown };
function withEncryptedSecrets(client: PrismaClient): PrismaClient {
  const query = Object.fromEntries(Object.entries(SECRET_FIELDS).map(([model, fields]) => [model, {
    async $allOperations({ args, query: run }: { args: QueryArgs; query: (a: QueryArgs) => Promise<unknown> }) {
      const a: QueryArgs = { ...args };
      if (a.data !== undefined) a.data = Array.isArray(a.data) ? a.data.map(d => encryptData(d, fields)) : encryptData(a.data, fields);
      if (a.create !== undefined) a.create = encryptData(a.create, fields);
      if (a.update !== undefined) a.update = encryptData(a.update, fields);
      return decryptResult(await run(a), fields);
    },
  }]));
  return client.$extends({ query } as Parameters<PrismaClient["$extends"]>[0]) as unknown as PrismaClient;
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
