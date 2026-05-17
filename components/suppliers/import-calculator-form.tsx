"use client";

import { useState } from "react";

interface SupplierOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  sellingPriceTry: number | null;
  marketplacePriceTry: number | null;
  wholesalePriceTry: number | null;
}

interface SupplierProductOption {
  supplierId: string;
  productId: string;
  unitCostUsd: number | null;
  moq: number | null;
  leadDays: number | null;
}

interface ImportCalculatorFormProps {
  suppliers: SupplierOption[];
  products: ProductOption[];
  supplierProducts: SupplierProductOption[];
  latestRate: number | null;
}

interface CalcResult {
  quantity: number;
  unitCostUsd: number;
  freightUsd: number;
  customsRate: number;
  exchangeRate: number;
  // computed
  productTotalUsd: number;
  freightPerUnitUsd: number;
  customsUsd: number;
  totalLandedUsd: number;
  unitLandedUsd: number;
  unitLandedTry: number;
  sellingPriceTry: number | null;
  marginTry: number | null;
  marginPct: number | null;
  marketplacePriceTry: number | null;
  marketplaceMarginTry: number | null;
  marketplaceMarginPct: number | null;
  wholesalePriceTry: number | null;
  wholesaleMarginTry: number | null;
  wholesaleMarginPct: number | null;
  breakEvenTry: number;
}

const fieldClass =
  "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400";
const labelClass = "block text-xs font-medium text-slate-600 mb-1";

export function ImportCalculatorForm({
  suppliers,
  products,
  supplierProducts,
  latestRate,
}: ImportCalculatorFormProps) {
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCostUsd, setUnitCostUsd] = useState("");
  const [freightUsd, setFreightUsd] = useState("0");
  const [customsRate, setCustomsRate] = useState("0");
  const [exchangeRate, setExchangeRate] = useState(
    latestRate != null ? String(latestRate) : "",
  );
  const [result, setResult] = useState<CalcResult | null>(null);

  // When supplier changes, pre-fill unitCostUsd from SupplierProduct if available
  function handleSupplierChange(newSupplierId: string) {
    setSupplierId(newSupplierId);
    if (productId && newSupplierId) {
      const sp = supplierProducts.find(
        (s) => s.supplierId === newSupplierId && s.productId === productId,
      );
      if (sp?.unitCostUsd != null) setUnitCostUsd(String(sp.unitCostUsd));
    }
  }

  // When product changes, pre-fill unitCostUsd from SupplierProduct if available
  function handleProductChange(newProductId: string) {
    setProductId(newProductId);
    if (supplierId && newProductId) {
      const sp = supplierProducts.find(
        (s) => s.supplierId === supplierId && s.productId === newProductId,
      );
      if (sp?.unitCostUsd != null) setUnitCostUsd(String(sp.unitCostUsd));
    }
  }

  function calculate() {
    const qty = parseFloat(quantity) || 0;
    const costUsd = parseFloat(unitCostUsd) || 0;
    const freightTotalUsd = parseFloat(freightUsd) || 0;
    const customs = parseFloat(customsRate) || 0;
    const rate = parseFloat(exchangeRate) || 0;

    if (qty <= 0 || costUsd <= 0 || rate <= 0) {
      return;
    }

    const productTotalUsd = qty * costUsd;
    const freightPerUnitUsd = qty > 0 ? freightTotalUsd / qty : 0;
    const customsUsd = productTotalUsd * (customs / 100);
    const totalLandedUsd = productTotalUsd + freightTotalUsd + customsUsd;
    const unitLandedUsd = totalLandedUsd / qty;
    const unitLandedTry = unitLandedUsd * rate;
    const breakEvenTry = unitLandedTry * 1.2; // 20% min margin

    const selectedProduct = products.find((p) => p.id === productId) ?? null;

    const sellingPriceTry = selectedProduct?.sellingPriceTry ?? null;
    const marketplacePriceTry = selectedProduct?.marketplacePriceTry ?? null;
    const wholesalePriceTry = selectedProduct?.wholesalePriceTry ?? null;

    const marginTry = sellingPriceTry != null ? sellingPriceTry - unitLandedTry : null;
    const marginPct =
      sellingPriceTry != null && sellingPriceTry > 0
        ? ((sellingPriceTry - unitLandedTry) / sellingPriceTry) * 100
        : null;

    const marketplaceMarginTry =
      marketplacePriceTry != null ? marketplacePriceTry - unitLandedTry : null;
    const marketplaceMarginPct =
      marketplacePriceTry != null && marketplacePriceTry > 0
        ? ((marketplacePriceTry - unitLandedTry) / marketplacePriceTry) * 100
        : null;

    const wholesaleMarginTry =
      wholesalePriceTry != null ? wholesalePriceTry - unitLandedTry : null;
    const wholesaleMarginPct =
      wholesalePriceTry != null && wholesalePriceTry > 0
        ? ((wholesalePriceTry - unitLandedTry) / wholesalePriceTry) * 100
        : null;

    setResult({
      quantity: qty,
      unitCostUsd: costUsd,
      freightUsd: freightTotalUsd,
      customsRate: customs,
      exchangeRate: rate,
      productTotalUsd,
      freightPerUnitUsd,
      customsUsd,
      totalLandedUsd,
      unitLandedUsd,
      unitLandedTry,
      sellingPriceTry,
      marginTry,
      marginPct,
      marketplacePriceTry,
      marketplaceMarginTry,
      marketplaceMarginPct,
      wholesalePriceTry,
      wholesaleMarginTry,
      wholesaleMarginPct,
      breakEvenTry,
    });
  }

  function fmtTry(n: number) {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 2,
    }).format(n);
  }

  function fmtUsd(n: number) {
    return `$${n.toFixed(2)}`;
  }

  function fmtPct(n: number) {
    return `%${n.toFixed(1)}`;
  }

  function marginColor(pct: number | null) {
    if (pct === null) return "text-slate-400";
    if (pct >= 25) return "text-emerald-600 font-semibold";
    if (pct >= 10) return "text-amber-600 font-semibold";
    return "text-red-600 font-semibold";
  }

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Supplier */}
        <div>
          <label className={labelClass}>Tedarikçi (isteğe bağlı)</label>
          <select
            className={`${fieldClass} bg-white`}
            value={supplierId}
            onChange={(e) => handleSupplierChange(e.target.value)}
          >
            <option value="">— Seçin —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Product */}
        <div>
          <label className={labelClass}>Ürün (isteğe bağlı)</label>
          <select
            className={`${fieldClass} bg-white`}
            value={productId}
            onChange={(e) => handleProductChange(e.target.value)}
          >
            <option value="">— Seçin —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku ? `[${p.sku}] ` : ""}
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Quantity */}
        <div>
          <label className={labelClass}>
            Sipariş Adedi <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            className={fieldClass}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min={1}
          />
        </div>

        {/* Unit cost USD */}
        <div>
          <label className={labelClass}>
            Birim Maliyet (USD) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            className={fieldClass}
            value={unitCostUsd}
            onChange={(e) => setUnitCostUsd(e.target.value)}
            min={0}
            step="0.01"
            placeholder="0.00"
          />
        </div>

        {/* Freight USD total */}
        <div>
          <label className={labelClass}>Toplam Nakliye Maliyeti (USD)</label>
          <input
            type="number"
            className={fieldClass}
            value={freightUsd}
            onChange={(e) => setFreightUsd(e.target.value)}
            min={0}
            step="0.01"
            placeholder="0.00"
          />
        </div>

        {/* Customs rate */}
        <div>
          <label className={labelClass}>Gümrük Vergisi (%)</label>
          <input
            type="number"
            className={fieldClass}
            value={customsRate}
            onChange={(e) => setCustomsRate(e.target.value)}
            min={0}
            step="0.1"
            placeholder="0"
          />
        </div>

        {/* Exchange rate */}
        <div>
          <label className={labelClass}>
            USD/TRY Kuru <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            className={fieldClass}
            value={exchangeRate}
            onChange={(e) => setExchangeRate(e.target.value)}
            min={0}
            step="0.01"
            placeholder="38.50"
          />
          {latestRate != null && (
            <p className="mt-1 text-xs text-slate-400">Son kayıtlı kur: {latestRate.toFixed(4)}</p>
          )}
        </div>
      </div>

      {/* Calculate button */}
      <div>
        <button
          onClick={calculate}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Hesapla
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Cost breakdown */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Maliyet Dökümü
              </p>
            </div>
            <div className="divide-y divide-slate-50">
              <Row
                label="Ürün maliyeti"
                value={`${fmtUsd(result.productTotalUsd)} (${result.quantity} × ${fmtUsd(result.unitCostUsd)})`}
              />
              <Row label="Nakliye maliyeti" value={fmtUsd(result.freightUsd)} />
              <Row
                label="Gümrük vergisi"
                value={`${fmtUsd(result.customsUsd)} (%${result.customsRate})`}
              />
              <Row
                label="Toplam ithalat maliyeti (USD)"
                value={fmtUsd(result.totalLandedUsd)}
                bold
              />
              <Row
                label="Birim başına ithalat maliyeti (USD)"
                value={fmtUsd(result.unitLandedUsd)}
              />
              <Row
                label={`Birim başına ithalat maliyeti (TRY) — kur ${result.exchangeRate}`}
                value={fmtTry(result.unitLandedTry)}
                bold
              />
              <Row
                label="Başa baş fiyatı (minimum %20 marj)"
                value={fmtTry(result.breakEvenTry)}
                highlight
              />
            </div>
          </div>

          {/* Margin analysis */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Kanal Bazlı Marj Analizi
              </p>
              {!productId && (
                <p className="mt-1 text-xs text-amber-600">
                  Ürün seçilmediği için satış fiyatları bilinmiyor.
                </p>
              )}
            </div>
            <div className="divide-y divide-slate-50">
              {/* Retail */}
              <MarginRow
                channel="Perakende"
                price={result.sellingPriceTry}
                marginTry={result.marginTry}
                marginPct={result.marginPct}
                fmtTry={fmtTry}
                fmtPct={fmtPct}
                marginColor={marginColor}
              />
              {/* Marketplace */}
              <MarginRow
                channel="Pazar Yeri"
                price={result.marketplacePriceTry}
                marginTry={result.marketplaceMarginTry}
                marginPct={result.marketplaceMarginPct}
                fmtTry={fmtTry}
                fmtPct={fmtPct}
                marginColor={marginColor}
              />
              {/* Wholesale */}
              <MarginRow
                channel="Toptan"
                price={result.wholesalePriceTry}
                marginTry={result.wholesaleMarginTry}
                marginPct={result.wholesaleMarginPct}
                fmtTry={fmtTry}
                fmtPct={fmtPct}
                marginColor={marginColor}
              />
            </div>
          </div>

          {/* Advisory */}
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-6 py-4">
            <p className="text-xs font-semibold text-amber-700">Uyarı</p>
            <p className="mt-1 text-xs text-amber-600">
              Bu hesaplama tahminidir. Gerçek ithalat maliyetleri gümrük tarife sınıfına, sigorta
              ve depolama ücretlerine göre değişebilir. Satın alma kararı vermeden önce gerçek
              teklife dayandırın.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-6 py-3 ${highlight ? "bg-slate-50" : ""}`}
    >
      <span className={`text-sm ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>
        {label}
      </span>
      <span
        className={`text-sm font-mono ${bold ? "font-bold text-slate-900" : highlight ? "font-semibold text-amber-700" : "text-slate-700"}`}
      >
        {value}
      </span>
    </div>
  );
}

function MarginRow({
  channel,
  price,
  marginTry,
  marginPct,
  fmtTry,
  fmtPct,
  marginColor,
}: {
  channel: string;
  price: number | null;
  marginTry: number | null;
  marginPct: number | null;
  fmtTry: (n: number) => string;
  fmtPct: (n: number) => string;
  marginColor: (n: number | null) => string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
      <span className="text-sm font-medium text-slate-700 w-24">{channel}</span>
      <span className="text-sm text-slate-500 flex-1">
        {price != null ? `Satış fiyatı: ${fmtTry(price)}` : "Fiyat girilmemiş"}
      </span>
      <div className="flex gap-6 text-right">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Marj (TRY)</p>
          <p className={`text-sm ${marginColor(marginPct)}`}>
            {marginTry != null ? fmtTry(marginTry) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Marj %</p>
          <p className={`text-sm ${marginColor(marginPct)}`}>
            {marginPct != null ? fmtPct(marginPct) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
