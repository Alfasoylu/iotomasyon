import { assertTryCurrency } from "./currency";
import type { BankaAlan } from "./columns";
import { ayristirHam, hazirlaBankaTablosu } from "./parse";
import { readBankPdf } from "./pdf";

export async function readBankFile(buffer: Buffer, fileName: string, mapping?: Partial<Record<BankaAlan, string>>) {
  if (/\.pdf$/i.test(fileName)) {
    const table = await readBankPdf(buffer);
    assertTryCurrency(table.metadata ?? []);
    const current = hazirlaBankaTablosu(table, mapping);
    const legacy = hazirlaBankaTablosu(await readBankPdf(buffer, true), mapping);
    return { ...current, legacySatirlar: legacy.satirlar };
  }
  const table = ayristirHam(buffer);
  assertTryCurrency(table.metadata ?? []);
  return hazirlaBankaTablosu(table, mapping);
}
