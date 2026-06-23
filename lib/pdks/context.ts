import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * PDKS — İstek başına tenant bağlamı (AsyncLocalStorage).
 *
 * Her API route'u, NextAuth oturumundan türettiği tenant/personel/rol bilgisini
 * `runWithTenant(...)` ile sarmalar. `lib/pdks/prisma.ts` içindeki scoped client
 * bu bağlamı okuyup her sorguya otomatik `tenantId` enjekte eder.
 */
export interface PdksTenantContext {
  tenantId: string;
  personnelId: string;
  role: string; // 'tenant_admin' | 'employee'
}

export const tenantContext = new AsyncLocalStorage<PdksTenantContext>();

/** Bağlamı zorunlu okur — yoksa fail-closed (scoped sorgu bağlamsız çalışmasın). */
export function getTenantContext(): PdksTenantContext {
  const ctx = tenantContext.getStore();
  if (!ctx) {
    throw new Error(
      "PDKS tenant bağlamı yok. Scoped sorgular runWithTenant(...) içinde çalışmalı.",
    );
  }
  return ctx;
}

/** Opsiyonel okuma (bağlam yoksa null) — koşullu mantık gerektiren yerler için. */
export function tryGetTenantContext(): PdksTenantContext | null {
  return tenantContext.getStore() ?? null;
}

export function runWithTenant<T>(ctx: PdksTenantContext, fn: () => T): T {
  return tenantContext.run(ctx, fn);
}
