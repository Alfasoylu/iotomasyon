import "server-only";

import { prisma } from "@/lib/prisma";
import { getTenantContext } from "./context";

/**
 * PDKS — Tenant-scoped Prisma client.
 *
 * Merkezî izolasyon: `pdks_` tenant-sahipli modellere yapılan HER sorguya aktif
 * bağlamın `tenantId`'si otomatik enjekte edilir. Böylece "tenantId filtresini
 * unutma" riski tek noktada kapanır (uygulama-katmanı izolasyonu — v2 spec §3,6).
 *
 * Prisma 7'de `extendedWhereUnique` GA olduğundan tekil `findUnique/update/delete`
 * `where`'ine de `tenantId` eklenebilir: yabancı tenant kaydı için sorgu eşleşmez
 * (null döner / 0 satır etkilenir) → fail-closed, başka tenant'ın kaydı sızmaz.
 *
 * `PdksTenant` KASITLI olarak scoped DEĞİL (tenant'ın kendisi). Onu yalnızca
 * `platform_admin` doğrudan unscoped `prisma` ile yönetir.
 */
const SCOPED_MODELS = new Set([
  "PdksPersonnel",
  "PdksWorksite",
  "PdksPersonnelWorksite",
  "PdksAttendanceRecord",
  "PdksPushSubscription",
]);

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

export const prismaPdks = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !SCOPED_MODELS.has(model)) return query(args);

        const { tenantId } = getTenantContext();
        const a = (args ?? {}) as Record<string, unknown>;

        if (WHERE_OPS.has(operation)) {
          a.where = { ...(a.where as object), tenantId };
        }
        if (operation === "create") {
          a.data = { ...(a.data as object), tenantId };
        }
        if (operation === "createMany" || operation === "createManyAndReturn") {
          const d = a.data;
          a.data = Array.isArray(d)
            ? d.map((row) => ({ ...(row as object), tenantId }))
            : { ...(d as object), tenantId };
        }
        if (operation === "upsert") {
          a.where = { ...(a.where as object), tenantId };
          a.create = { ...(a.create as object), tenantId };
          // update bloğuna gerek yok: where zaten tenant'a sabitliyor.
        }
        return query(a);
      },
    },
  },
});

export type PrismaPdksClient = typeof prismaPdks;
