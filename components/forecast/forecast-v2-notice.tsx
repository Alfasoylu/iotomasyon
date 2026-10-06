import Link from "next/link";

/** Shown on every migrated consumer while FORECAST_V2_ENABLED is on, so changed recommendations are never silent. */
export function ForecastV2Notice({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <b>Forecast V2 açık</b> (observed-sales-v2-true30): aylık talep = kanonik satışın gerçek son 30 günü; manuel potansiyel ve eski
      max/mevsim tabanı uygulanmaz; PARTIAL (7–29 gün) ve UNKNOWN ürünler sipariş/sermaye hesabına girmez. Rakamlar eski motora göre değişmiş
      olabilir — eski/yeni fark: <Link href="/admin/forecast-v2" className="underline">Forecast V2 karşılaştırma</Link>.
    </div>
  );
}
