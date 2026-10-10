/**
 * Trendyol onaylı ürün filtresi (V2, SALT OKUMA): GET product/sellers/{id}/products/approved?barcode=… → contentId, marka, kategori,
 * başlık, açıklama, görseller, özellikler (içerik + varyant). Ölü stok eylemlerinde (1) içerik güncellemesi için contentId'yi, (2) bağımsız
 * yeni ilanda marka/kategori/özellikleri Entegra'nın mevcut ilanından kopyalamak ve (3) yeni başlık/görselin mevcut ilandan FARKLI
 * olduğunu doğrulamak için kullanılır. Kaynak: developers.trendyol.com — Ürün Filtreleme - Onaylı Ürün v2.
 */
import type { TrendyolConfig } from "@/lib/trendyol-api";
import type { NewProduct } from "./write";

type RawAttr = { attributeId: number; attributeValueId?: number; attributeValue?: string };
type RawContent = { contentId: number; brand?: { id: number }; category?: { id: number }; title?: string; description?: string;
  images?: { url: string }[]; attributes?: RawAttr[]; variants?: { barcode: string; commission?: number; attributes?: RawAttr[] }[] };

export type ApprovedProduct = { contentId: number; brandId: number | null; categoryId: number | null; title: string; description: string;
  images: string[]; attributes: NewProduct["attributes"]; commissionPct: number | null };

const toAttr = (a: RawAttr): NewProduct["attributes"][number] =>
  a.attributeValueId != null ? { attributeId: a.attributeId, attributeValueId: a.attributeValueId } : { attributeId: a.attributeId, customAttributeValue: a.attributeValue ?? "" };

/** Ham yanıttan barkodun içeriğini çıkarır (saf; test edilir). İçerik + o varyantın özellikleri birleşir (aynı id'de varyant kazanır). */
export function parseApproved(json: { content?: RawContent[] } | null, barcode: string): ApprovedProduct | null {
  for (const c of json?.content ?? []) {
    const v = c.variants?.find(x => x.barcode === barcode);
    if (!v) continue;
    const attrs = new Map<number, NewProduct["attributes"][number]>();
    for (const a of [...(c.attributes ?? []), ...(v.attributes ?? [])]) attrs.set(a.attributeId, toAttr(a));
    return { contentId: c.contentId, brandId: c.brand?.id ?? null, categoryId: c.category?.id ?? null, title: c.title ?? "", description: c.description ?? "",
      images: (c.images ?? []).map(i => i.url), attributes: [...attrs.values()], commissionPct: v.commission ?? null };
  }
  return null;
}

export async function findApprovedByBarcode(cfg: TrendyolConfig, barcode: string, f: typeof fetch = fetch): Promise<ApprovedProduct | null> {
  const url = new URL(`https://apigw.trendyol.com/integration/product/sellers/${cfg.supplierId}/products/approved`);
  url.searchParams.set("barcode", barcode.trim());
  const res = await f(url, { headers: { Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}`,
    "User-Agent": `${cfg.supplierId} - SelfIntegration` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Trendyol onaylı ürün ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseApproved(await res.json(), barcode.trim());
}
