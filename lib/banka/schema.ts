import { prisma } from "@/lib/prisma";

// Existing statement tables are externally managed. Never change their schema.
export async function hareketTablosuHazir(): Promise<boolean> {
  const columns = await prisma.$queryRaw<{column_name: string; is_nullable: string}[]>`
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cfo_banka_hareket'`;
  const required = ['banka','hesap','tarih','valor','aciklama','tutar_try','bakiye_try','karsi_taraf','ref_no','kaynak_dosya','import_id','satir_hash'];
  return required.every(name => columns.some(c => c.column_name === name)) &&
    columns.some(c => c.column_name === 'import_id' && c.is_nullable === 'YES');
}
