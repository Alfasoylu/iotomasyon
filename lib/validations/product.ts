import { z } from "zod";

export const productSchema = z.object({
  sku: z.string().trim().min(2, "SKU gerekli."),
  barcode: z.string().trim().max(100),
  name: z.string().trim().min(2, "Ürün adı gerekli."),
  imageUrl: z.string().trim().max(500),
  category: z.string().trim().max(120),
  categoryId: z.string().trim(),
  brand: z.string().trim().max(120),
  model: z.string().trim().max(120),
  supplier: z.string().trim().max(120),
  stockQuantity: z.number().int().min(0, "Stok negatif olamaz."),
  minimumStock: z.number().int().min(0, "Minimum stok negatif olamaz."),
  reorderLeadTime: z.string().trim(),
  stockSource: z.string().trim(),
  stockConfidence: z.string().trim(),
  lastStockSyncAt: z.string().trim(),
  lastStockCountById: z.string().trim(),
  location: z.string().trim().max(120),
  description: z.string().trim().max(10000),
  isActive: z.boolean(),
  shippingCost: z.string().trim(),
  shippingCostOverride: z.string().trim(),
  marketplaceCommission: z.string().trim(),
  marketplaceCommissionOverride: z.string().trim(),
  importDate: z.string().trim(),
  importQuantity: z.string().trim(),
  importUnitCostUsd: z.string().trim(),
  inventoryCountDate: z.string().trim(),
  inventoryCountStock: z.string().trim(),
  // Phase 8 — Profitability Engine
  unitCostTry: z.string().trim(),
  sellingPriceTry: z.string().trim(),
  wholesalePriceTry: z.string().trim(),
  marketplacePriceTry: z.string().trim(),
  packagingCost: z.string().trim(),
  vatRate: z.string().trim(),
  paymentFeeRate: z.string().trim(),
  returnReserveRate: z.string().trim(),
  // Phase 9 — Sales Potential Engine
  onlineSalesPotential: z.string().trim(),
  wholesaleSalesPotential: z.string().trim(),
  installerSalesPotential: z.string().trim(),
  // Phase 11 — XML Sync override protection
  xmlLocked: z.boolean(),
  // Phase 11C — Import decision inputs
  weightKg: z.string().trim(),
  customsRatePct: z.string().trim(),
  shippingMethodPref: z.string().trim(),
  // Phase 31 — RMB-first import economics
  sourceCostRmb: z.string().trim(),
  importPaymentFeePct: z.string().trim(),
  // GTİP kodları (3 adet; bazı ürünler farklı GTİP'lerle ithal edilebilir)
  gtip1: z.string().trim(),
  gtip1Desc: z.string().trim(),
  gtip2: z.string().trim(),
  gtip2Desc: z.string().trim(),
  gtip3: z.string().trim(),
  gtip3Desc: z.string().trim(),
});

export type ProductInput = z.infer<typeof productSchema>;
