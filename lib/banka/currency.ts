import { normalizeHeader } from "./columns";
import { BankPdfError } from "./pdf";

// Existing movement columns represent TRY. Never silently store native FX in them.
export function foreignCurrency(text: string): string | null {
  return text.match(/\b(USD|EUR|GBP|CHF|JPY|CAD|AUD|RUB|SAR|AED|CNY)\b/i)?.[1].toUpperCase() ?? null;
}
export function isForeignAccount(accountType: string) {
  return normalizeHeader(accountType).includes("doviz") || /DÃ–VÄ°Z/i.test(accountType);
}
export function assertTryCurrency(metadata: string[], accountName = "", accountType = "") {
  const currency = foreignCurrency([accountName, ...metadata].join(" "));
  if (currency || isForeignAccount(accountType)) {
    throw new BankPdfError(`${currency ?? "Döviz"} ekstresi TL hareket tablosuna aktarılamaz. Döviz tutarları kur bilgisi olmadan TL sayılmaz; mevcut bakiyeniz değişmedi.`);
  }
}
