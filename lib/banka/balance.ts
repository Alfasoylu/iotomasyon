import { z } from "zod";
import { toDecimalTr } from "./parse";

export const balanceInput = z.object({
  id: z.string().min(1).max(100),
  balance: z.string().min(1).max(40),
  asOf: z.iso.datetime(),
  expectedUpdatedAt: z.iso.datetime(),
  confirmed: z.literal(true),
});

export function validateBalance(value: unknown, now = new Date()) {
  const input = balanceInput.parse(value);
  const amount = toDecimalTr(input.balance);
  if (amount === null) throw new Error("Bakiyeyi geçerli bir TL tutarı olarak yazın.");
  const asOf = new Date(input.asOf);
  if (asOf.getTime() > now.getTime() + 60_000 || asOf.getUTCFullYear() < 2000) {
    throw new Error("Bakiye tarihi gelecekte olamaz.");
  }
  return { ...input, amount: Math.round(amount * 100) / 100, asOf };
}
