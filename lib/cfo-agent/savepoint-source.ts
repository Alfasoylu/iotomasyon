import type { ReadSource, Row } from "./sources";

/** Minimal interactive-transaction surface (Prisma `tx`). */
export type RawTx = { $executeRawUnsafe(sql: string, ...p: unknown[]): Promise<unknown>; $queryRawUnsafe<T = unknown>(sql: string, ...p: unknown[]): Promise<T> };

/**
 * İşlem içi okuma kaynağı: her sorgu kendi SAVEPOINT'inde — bir sorgunun hatası işlemi bozmaz, sonraki sorgular çalışır.
 * Sorgular SIRAYA alınır: eşzamanlı çağrılarda (Promise.all) savepoint'ler iç içe geçiyordu — A'nın RELEASE'i B'nin savepoint'ini de
 * siliyor, B'nin RELEASE'i 3B001 (invalid_savepoint_specification) veriyordu → CFO çalışma döngüsü "context" aşamasında düşüyordu
 * (üretim 09.10 02:34'ten beri her senkronda). Tek bağlantıda sorgular zaten sırayla yürür; sıralama yalnız savepoint sınırlarını korur.
 */
export function savepointSource(tx: RawTx): ReadSource {
  let queryId = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return {
    query<T extends Row>(sql: string, ...params: unknown[]): Promise<T[]> {
      const run = chain.then(async () => {
        const point = `cfo_context_${++queryId}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
        try {
          const rows = await tx.$queryRawUnsafe<T[]>(sql, ...params);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
          return rows;
        } catch (error) {
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
          throw error;
        }
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };
}
