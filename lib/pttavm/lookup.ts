/**
 * PttAVM barkod sorgusu (POST /products/get-by-barcodes, SALT OKUMA) yanıtını şemadan bağımsız yorumlar — resmî dokümanda yanıt
 * alanları tam yazılı değil, bu yüzden anahtar adları büyük/küçük harf duyarsız ve iç içe aranır. Upsert'in iki tehlikesine karşı:
 * kayıtlı olmayan barkod YENİ ürün olur (içerik güncellemesinde ürün VAR olmalı, yeni ilanda barkod BOŞ olmalı) ve varyant
 * gönderilmezse mevcut varyantlar silinir (varyantlı üründe güncelleme yapılmaz). Belirsizse "bilinmiyor" → çağıran reddeder.
 */
type Json = unknown;

function walk(v: Json, visit: (key: string, value: Json, parent: Record<string, Json>) => void) {
  if (Array.isArray(v)) { for (const x of v) walk(x, visit); return; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, Json>)) { visit(k.toLowerCase(), x, v as Record<string, Json>); walk(x, visit); }
}

export type PttLookup = { found: boolean; hasVariants: boolean; categoryId: number | null; names: string[]; images: string[] };

/** Barkod (satıcı stok kodu) yanıtta bir ürün nesnesinin barcode/stockCode alanında geçiyorsa bulunmuş sayılır. */
export function interpretLookup(json: Json, barcode: string): PttLookup {
  const out: PttLookup = { found: false, hasVariants: false, categoryId: null, names: [], images: [] };
  const target = barcode.trim();
  walk(json, (k, v, parent) => {
    if ((k === "barcode" || k === "barkod" || k === "stockcode" || k === "productcode") && typeof v === "string" && v.trim() === target) out.found = true;
    if (k === "variants" && Array.isArray(v) && v.length) out.hasVariants = true;
    if ((k === "categoryid" || k === "kategoriid") && out.categoryId == null && Number.isInteger(Number(v)) && Number(v) > 0) out.categoryId = Number(v);
    if ((k === "name" || k === "productname" || k === "urunadi") && typeof v === "string" && v.trim() && !("attributes" in parent)) out.names.push(v.trim());
    if (k === "url" && typeof v === "string" && /^https?:\/\//.test(v)) out.images.push(v);
  });
  return out;
}
