export type ProductFormValues = {
  sku: string;
  barcode: string;
  name: string;
  imageUrl: string;
  category: string;
  categoryId: string;
  brand: string;
  model: string;
  supplier: string;
  stockQuantity: number;
  minimumStock: number;
  reorderLeadTime: string;
  stockSource: string;
  stockConfidence: string;
  lastStockSyncAt: string;
  lastStockCountById: string;
  location: string;
  description: string;
  isActive: boolean;
  shippingCost: string;
  shippingCostOverride: string;
  marketplaceCommission: string;
  marketplaceCommissionOverride: string;
  importDate: string;
  importQuantity: string;
  importUnitCostUsd: string;
  inventoryCountDate: string;
  inventoryCountStock: string;
  // Phase 8 — Profitability Engine
  unitCostTry: string;
  sellingPriceTry: string;
  wholesalePriceTry: string;
  marketplacePriceTry: string;
  packagingCost: string;
  vatRate: string;
  paymentFeeRate: string;
  returnReserveRate: string;
  // Phase 9 — Sales Potential Engine
  onlineSalesPotential: string;
  wholesaleSalesPotential: string;
  installerSalesPotential: string;
  // Phase 11 — XML Sync override protection
  xmlLocked: boolean;
  // Phase 11C — Import decision inputs
  weightKg: string;
  customsRatePct: string;
  shippingMethodPref: string;
  // Phase 31 — RMB-first import economics
  sourceCostRmb: string;
  importPaymentFeePct: string;
};
