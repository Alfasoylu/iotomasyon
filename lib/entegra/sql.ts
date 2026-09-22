/**
 * Entegra yüklemesinin SQL'i — SAF (prisma import ETMEZ).
 *
 * Ayrı dosyada olmasının sebebi: bu SQL veritabanına karşı `EXPLAIN` ile
 * tek satır yazmadan doğrulanabilsin.
 *
 * Sütun tanımı TEK KAYNAK: UPDATE ve INSERT aynı listeden üretilir. İki ayrı
 * yerde elle yazılsaydı bir sütun kaydığında veri sessizce yanlış kolona
 * giderdi — unnest sütunları KONUMA göre eşler, ada göre değil.
 */
import type { EntegraRecord } from "./parse";

export interface Col {
  ad: string;
  tip: string;
  al: (r: EntegraRecord) => unknown;
}

/** Benzersiz anahtar — WHERE'de kullanılır, SET'te ASLA. */
export const ANAHTAR: Col[] = [
  { ad: "channel", tip: "text", al: (r) => r.channel },
  { ad: "orderNumber", tip: "text", al: (r) => r.orderNumber },
  { ad: "externalLineId", tip: "text", al: (r) => r.externalLineId },
];

export const VERI: Col[] = [
  { ad: "platformRef", tip: "text", al: (r) => r.platformRef },
  // Saatsiz: toISOString().slice(0,19) "Z" ekini atar, TIMESTAMP kolonuna
  // olduğu gibi girer — saat dilimi kaymasına yer kalmaz.
  { ad: "orderDate", tip: "timestamp", al: (r) => r.orderDate.toISOString().slice(0, 19) },
  { ad: "status", tip: "text", al: (r) => r.status },
  { ad: "productName", tip: "text", al: (r) => r.productName },
  { ad: "productCode", tip: "text", al: (r) => r.productCode },
  { ad: "modelNumber", tip: "text", al: (r) => r.modelNumber },
  { ad: "storeStockName", tip: "text", al: (r) => r.storeStockName },
  { ad: "quantity", tip: "int", al: (r) => r.quantity },
  { ad: "grossAmountTry", tip: "numeric", al: (r) => r.grossAmountTry },
  { ad: "vatAmountTry", tip: "numeric", al: (r) => r.vatAmountTry },
  { ad: "totalAmountTry", tip: "numeric", al: (r) => r.totalAmountTry },
  { ad: "commissionTry", tip: "numeric", al: (r) => r.commissionTry },
  { ad: "commissionPct", tip: "numeric", al: (r) => r.commissionPct },
  { ad: "platformPaymentTry", tip: "numeric", al: (r) => r.platformPaymentTry },
  { ad: "customerCode", tip: "text", al: (r) => r.customerCode },
  { ad: "customerFirma", tip: "text", al: (r) => r.customerFirma },
  { ad: "customerInvoiceName", tip: "text", al: (r) => r.customerInvoiceName },
  { ad: "customerVergiNo", tip: "text", al: (r) => r.customerVergiNo },
  { ad: "customerTcKimlik", tip: "text", al: (r) => r.customerTcKimlik },
  { ad: "customerVergiDairesi", tip: "text", al: (r) => r.customerVergiDairesi },
  { ad: "customerCity", tip: "text", al: (r) => r.customerCity },
  { ad: "cargoCompany", tip: "text", al: (r) => r.cargoCompany },
  { ad: "cargoTrackingNo", tip: "text", al: (r) => r.cargoTrackingNo },
  { ad: "desiTotal", tip: "numeric", al: (r) => r.desiTotal },
  { ad: "productId", tip: "text", al: (r) => r.productId },
];

export const ID_COL: Col = { ad: "id", tip: "text", al: (r) => r.id };

export const UPDATE_COLS: Col[] = [...ANAHTAR, ...VERI];
export const INSERT_COLS: Col[] = [ID_COL, ...ANAHTAR, ...VERI];

function unnestArgs(cols: Col[], baslangic: number): string {
  return cols.map((c, i) => `$${baslangic + i}::${c.tip}[]`).join(", ");
}

function kolonListesi(cols: Col[]): string {
  return cols.map((c) => `"${c.ad}"`).join(", ");
}

/**
 * UPDATE — bilerek DOKUNULMAYANLAR:
 *   • customerId: başka bir akış bağlamış olabilir; yükleme müşteri türetmiyor.
 *   • productId : yeni türetme null ise ESKİSİ korunur (COALESCE). Aksi hâlde
 *     elde duran iyi bir bağ, model bu sefer eşleşmedi diye silinirdi.
 */
export function updateSql(): string {
  const setIfade = VERI.map((c) =>
    c.ad === "productId"
      ? `"productId" = COALESCE(t."productId", m."productId")`
      : `"${c.ad}" = t."${c.ad}"`
  ).join(",\n           ");

  return `UPDATE "MarketplaceSalesRecord" m
       SET ${setIfade},
           "importedAt" = now()
      FROM (SELECT * FROM unnest(${unnestArgs(UPDATE_COLS, 1)})
                   AS t(${kolonListesi(UPDATE_COLS)})) t
     WHERE m.channel = t.channel
       AND m."orderNumber" = t."orderNumber"
       AND m."externalLineId" = t."externalLineId"`;
}

export function insertSql(): string {
  return `INSERT INTO "MarketplaceSalesRecord" (${kolonListesi(INSERT_COLS)})
    SELECT * FROM unnest(${unnestArgs(INSERT_COLS, 1)})
    ON CONFLICT (channel, "orderNumber", "externalLineId") DO NOTHING`;
}
