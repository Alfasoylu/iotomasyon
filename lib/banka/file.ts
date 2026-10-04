import type { BankaAlan } from "./columns";
import { hazirlaBankaDosyasi, hazirlaBankaTablosu } from "./parse";
import { readBankPdf } from "./pdf";

export async function readBankFile(buffer: Buffer, fileName: string, mapping?: Partial<Record<BankaAlan, string>>) {
  if (/\.pdf$/i.test(fileName)) return hazirlaBankaTablosu(await readBankPdf(buffer), mapping);
  return hazirlaBankaDosyasi(buffer, mapping);
}
