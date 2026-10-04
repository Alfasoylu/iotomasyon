import type { PrismaClient } from "@prisma/client";
import type { validateBalance } from "./balance";

export async function writeBalance(db: Pick<PrismaClient, "$transaction">, input: ReturnType<typeof validateBalance>, email: string) {
  return db.$transaction(async tx => {
    const previous = await tx.cfoBankAccount.findUnique({ where: { id: input.id } });
    if (!previous?.isActive) return false;
    const updated = await tx.cfoBankAccount.updateMany({
      where: { id: input.id, isActive: true, updatedAt: new Date(input.expectedUpdatedAt) },
      data: { balanceTry: input.amount, lastUpdatedAt: input.asOf, dataTag: "KESIN" },
    });
    if (updated.count !== 1) return false;
    await tx.cfoChangeLog.create({ data: {
      area: "banka", kind: "duzeltme", item: `${previous.name} bakiye`,
      oldValue: previous.balanceTry?.toString() ?? "BİLİNMİYOR",
      newValue: String(input.amount), source: email,
      note: `Banka yükleme ekranında teyit edildi. Bakiye tarihi: ${input.asOf.toISOString()}`,
    } });
    return true;
  });
}
