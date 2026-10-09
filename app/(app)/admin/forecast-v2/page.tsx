import { Fragment } from "react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { forecastV2Enabled, FORECAST_V2_MODEL_VERSION } from "@/lib/forecast/v2";
import { istanbulDay } from "@/lib/forecast/v2-loader";
import { shadowSql } from "@/lib/forecast/shadow-sql";
import { FORECAST_CONSUMERS } from "@/lib/forecast/consumer-audit";
import { M7_DISCOVERY_CUTOFF, M7_PROMOTION_GATE, M7_SHADOW_VERSION, m7ForwardCutoffs } from "@/lib/forecast/m7-shadow";

// Forecast V2 gölge karşılaştırması (salt okunur). Bayraktan bağımsız çalışır: eski talep sinyalleri ile V2'yi ve mevcut sipariş
// kurallarının talep kısmını yan yana gösterir. Hiçbir şey yazmaz; TL yalnız "bugünkü maliyetle ileriye dönük maruziyet" olarak gösterilir.
export const dynamic = "force-dynamic";
type Obj = Record<string, number | string | null>;
type Shadow = Record<string, Obj> & { watermark?: string | null };
interface Detail { productId: string; sku: string; stock: number; legacyImporterEffective: number; manualOnline: number; legacyFms: number; grade: string;
  v2Forecast: number | null; v2Decision: number; cockpitQtyLegacy: number; cockpitQtyV2: number; poQtyLegacy: number; poQtyV2: number }
const n = (v: unknown, d = 0) => v == null ? "—" : Number(v).toLocaleString("tr-TR", { maximumFractionDigits: d });
const pct = (a: number, b: number | null) => b == null || a === 0 ? "—" : `${(((b - a) / a) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}%`;

function KV({ title, o, labels }: { title: string; o: Obj | undefined; labels: Record<string, string> }) {
  return <Card className="p-4"><h3 className="mb-2 text-sm font-semibold">{title}</h3>
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">{Object.entries(labels).map(([k, l]) =>
      <Fragment key={k}><dt className="text-[var(--text-muted)]">{l}</dt><dd className="text-right font-mono tabular-nums">{n(o?.[k], 1)}</dd></Fragment>)}</dl></Card>;
}
const CMP = { legacy_sum: "Eski toplam (adet/ay)", n_compared: "Karşılaştırılan SKU", n_v2_unknown: "V2 UNKNOWN", gt25pct: ">%25 fark", gt2x: ">2× fark", v2_lower: "V2 daha düşük", v2_higher: "V2 daha yüksek" };
const RULE = { n_legacy_positive: "Eski: adet > 0 SKU", n_v2_positive: "V2: adet > 0 SKU", n_changed: "Adedi değişen SKU", n_dropped_to_zero: "Sıfıra düşen",
  legacy_units: "Eski toplam adet", v2_units: "V2 toplam adet", reduction_units: "Azalan adet", increase_units: "Artan adet",
  forward_exposure_reduction_try_current_cost: "Bugünkü maliyetle maruziyet azalışı (₺)", reduction_units_with_current_cost: "…maliyeti bilinen azalan adet" };

export default async function ForecastV2Page() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  const on = forecastV2Enabled(), asOf = istanbulDay(), legacyNow = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  let shadow: Shadow | null = null, detail: Detail[] = [], error: string | null = null;
  try {
    const sql = shadowSql({ asOf, legacyNow });
    shadow = (await prisma.$queryRawUnsafe<{ shadow: Shadow }[]>(sql.summary))[0]?.shadow ?? null;
    detail = (await prisma.$queryRawUnsafe<Detail[]>(`${sql.detail} limit 60`));
  } catch { error = "Karşılaştırma sorgusu çalışmadı (veritabanı bağlantısı veya şema)."; }
  const m7Cuts = m7ForwardCutoffs(asOf);
  return <div className="space-y-6">
    <PageHeader title="Tahmin V2 karşılaştırma" subtitle="Eski talep sinyalleri ile observed-sales-v2-true30 yan yana — salt okunur gölge raporu."
      breadcrumb={[{ label: "İthalat" }, { label: "Tahmin V2" }]}
      meta={<><Badge variant={on ? "ok" : "neutral"}>{on ? "FORECAST_V2_ENABLED açık" : "FORECAST_V2_ENABLED kapalı"}</Badge>
        <span className="text-xs">{FORECAST_V2_MODEL_VERSION} · as_of {asOf} · kanonik veri filigranı {String((shadow as Record<string, unknown> | null)?.watermark ?? "—")}</span></>} />
    <Card className="p-4 text-xs text-[var(--text-secondary)] space-y-1">
      <p>Bayrak kapalıyken tüm ekranlar eski formülü kullanır; açıkken yalnız aşağıda MIGRATE_V2 işaretli tüketiciler V2&apos;ye geçer. V2 = kanonik
        satışın gerçek son 30 günü; max/mevsim tabanı ve manuel potansiyel uygulanmaz; PARTIAL (7–29 gün) ve UNKNOWN (&lt;7 gün / hiç satış yok) sipariş ve
        sermaye hesabına girmez. Stok-düzeltilmiş talep tahmini ayrı bir kavramdır ve tahminin yerine geçmez.</p>
      <p>Sipariş kuralları yalnız talep kısmıyla (kâr/ROI/bütçe kapıları öncesi) hesaplanır. Otomatik sipariş üretilmez; borç kapısı (finansal borç, hedef USD × TCMB altında olmalı) aynen geçerlidir.</p>
    </Card>
    {error && <Card className="p-4 text-sm text-red-700">{error}</Card>}
    {shadow && <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KV title="Ürünler" o={shadow.products} labels={{ active: "Aktif SKU", full: "FULL", partial: "PARTIAL (7–29 gün)", unknown: "UNKNOWN", unknown_lt7d: "…<7 gün",
          never_sold: "…hiç kanonik satış yok", demand_estimate_known: "Talep tahmini bilinen", manual_online_set: "Manuel online girilmiş", with_current_cost: "Güncel maliyeti olan" }} />
        <KV title="Toplam aylık talep (adet)" o={shadow.totals} labels={{ legacy_fms_l4: "Eski motor (max/mevsim)", legacy_importer_effective: "Eski efektif (max manuel)",
          legacy_trendyol_max_manual: "Eski Trendyol 30g ∨ manuel", legacy_cockpit: "Eski kokpit", legacy_manual_sum: "Manuel toplam", v2_forecast_units: "V2 tahmin",
          v2_decision_units: "V2 karar (FULL)", v2_partial_units: "V2 PARTIAL adet" }} />
        <KV title="V2 vs eski efektif (importer / sermaye sağlık)" o={shadow.vs_importer_effective} labels={CMP} />
        <KV title="V2 vs Trendyol 30g ∨ manuel (dashboard / öneriler / capital)" o={shadow.vs_trendyol_max_manual} labels={CMP} />
        <KV title="V2 vs kokpit talebi" o={shadow.vs_cockpit} labels={CMP} />
        <KV title="V2 vs manuel toplam (PO / ürün / snapshot)" o={shadow.vs_manual_sum} labels={CMP} />
        <KV title="Kokpit 90 gün kuralı" o={shadow.rule_cockpit_90d} labels={RULE} />
        <KV title="İthalatçı 45 gün ihtiyacı" o={shadow.rule_importer_45d} labels={RULE} />
        <KV title="Sipariş formu ön doldurma (2× aylık)" o={shadow.rule_po_prefill_2x} labels={RULE} />
        <KV title="Açık satın alma siparişleri (DRAFT/CONFIRMED)" o={shadow.open_purchase_orders} labels={{ items: "Kalem", products: "Ürün", units: "Adet",
          over_90d_cover_legacy: ">90 gün kapsam (eski)", over_90d_cover_v2: ">90 gün kapsam (V2)", v2_no_decision_demand: "V2 karar talebi yok",
          units_above_90d_legacy_need: "90 gün ihtiyacı aşan adet (eski)", units_above_90d_v2_need: "90 gün ihtiyacı aşan adet (V2)" }} />
        <KV title="Açık CFO sipariş satırları (BEKLIYOR)" o={shadow.open_cfo_order_lines} labels={{ lines: "Satır", matched: "Ürünle eşleşen", units: "Adet",
          monthly_sales_sum: "Satırdaki aylık satış toplamı", v2_decision_sum_matched: "V2 karar toplamı", v2_no_decision_demand: "V2 karar talebi yok",
          gt25pct_vs_monthly_sales: ">%25 fark", gt2x_vs_monthly_sales: ">2× fark", units_above_90d_own_monthly_sales_need: "90 gün aşan adet (satırın kendi aylığı)",
          units_above_90d_v2_need: "90 gün aşan adet (V2)" }} />
      </div>
      <Card className="overflow-x-auto p-4">
        <h3 className="mb-2 text-sm font-semibold">En büyük farklar (ilk 60)</h3>
        <table className="w-full text-xs"><thead><tr className="text-left text-[var(--text-muted)]"><th>SKU</th><th className="text-right">Stok</th>
          <th className="text-right">Eski motor</th><th className="text-right">Manuel</th><th className="text-right">Eski efektif</th><th className="text-right">V2</th><th>Derece</th>
          <th className="text-right">Fark</th><th className="text-right">Fark %</th><th className="text-right">Kokpit adet eski→V2</th><th className="text-right">PO adet eski→V2</th></tr></thead>
          <tbody>{detail.map(d => <tr key={d.productId} className="border-t border-[var(--border)]"><td className="font-mono">{d.sku}</td><td className="text-right">{n(d.stock)}</td>
            <td className="text-right">{n(d.legacyFms)}</td><td className="text-right">{n(d.manualOnline)}</td><td className="text-right">{n(d.legacyImporterEffective)}</td>
            <td className="text-right">{d.v2Forecast == null ? "UNKNOWN" : n(d.v2Forecast)}</td><td>{d.grade}</td>
            <td className="text-right">{d.v2Forecast == null ? "—" : n(Number(d.v2Forecast) - Number(d.legacyImporterEffective))}</td>
            <td className="text-right">{pct(Number(d.legacyImporterEffective), d.v2Forecast == null ? null : Number(d.v2Forecast))}</td>
            <td className="text-right">{n(d.cockpitQtyLegacy)} → {n(d.cockpitQtyV2)}</td><td className="text-right">{n(d.poQtyLegacy)} → {n(d.poQtyV2)}</td></tr>)}</tbody></table>
      </Card>
    </>}
    <Card className="p-4 text-xs space-y-1">
      <h3 className="text-sm font-semibold">M7 A-shrink (yalnız gölge)</h3>
      <p>{M7_SHADOW_VERSION} · keşif kesimi {M7_DISCOVERY_CUTOFF} · bugüne kadar puanlanabilen ileri kesim: {m7Cuts.length}. Üretim kararlarını etkilemez, otomatik terfi yok;
        terfi için en az {M7_PROMOTION_GATE.minForwardCutoffs} ileri kesim, {M7_PROMOTION_GATE.minObservations} A gözlemi ve WAPE&apos;de ≥{M7_PROMOTION_GATE.wapeImprovementPp} pp iyileşme + ayrı PR/onay gerekir.
        Telemetri: <code>scripts/forecast-backtest.ts --print-sql m7Forward</code>.</p>
    </Card>
    <Card className="overflow-x-auto p-4">
      <h3 className="mb-2 text-sm font-semibold">Tüketici denetimi</h3>
      <table className="w-full text-xs"><thead><tr className="text-left text-[var(--text-muted)]"><th>Karar</th><th>Dosya</th><th>Eski</th><th>Etkilediği</th><th>V2</th></tr></thead>
        <tbody>{FORECAST_CONSUMERS.map(c => <tr key={c.id} className="border-t border-[var(--border)] align-top"><td><Badge variant={c.decision === "MIGRATE_V2" ? "ok" : "neutral"}>{c.decision}</Badge></td>
          <td className="font-mono">{c.file}</td><td>{c.legacy}</td><td>{c.drives}</td><td>{c.v2}</td></tr>)}</tbody></table>
    </Card>
  </div>;
}
