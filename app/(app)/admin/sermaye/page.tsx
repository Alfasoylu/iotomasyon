/**
 * Sermaye — tek sayfa (2026-10-07 panel taraması, "Birleşsin").
 *
 * Eski üç sayfanın yerini alır: /admin/sermaye-saglik (Sermaye Sağlığı), /admin/capital (Sermaye Dağılımı),
 * /admin/executive (Yönetici Paneli). Üçü aynı soruya üç farklı kur ve üç farklı "bağlı sermaye" kuralıyla
 * cevap veriyordu (elle girilen aylık kur 2026/06'da kalmıştı). Artık tüm sayılar CFO kaynağından:
 *   kur → lib/fx/current.ts (cfo_kur) · bağlı sermaye → cfo_stok_deger · ölü stok → cfo_olu_stok · servet → cfo_servet.
 * Hesap lib/capital/health.ts'te; dashboard manşeti de aynı fonksiyonu okur. Eski adresler next.config.ts'te
 * buraya yönlenir. Salt-okunur; tek yazma Sermaye ayarları formu (CapitalConfig, değişmedi).
 */

import Link from "next/link";
import { Wallet } from "lucide-react";
import { checkPermission, requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { loadCapitalHealth } from "@/lib/capital/health";
import { freeCapital } from "@/lib/capital/score";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CapitalConfigForm } from "@/components/capital/capital-config-form";
import { PageHeader } from "@/components/layout/page-header";
import { PageHelp } from "@/components/layout/page-help";
import { ForecastV2Notice } from "@/components/forecast/forecast-v2-notice";
import { ActionList, DeltaBadge, MetricTile, SummaryCard, fmtDelta, fmtPct, fmtTry } from "./parts";
import { OperationsSection } from "./operations";

export const dynamic = "force-dynamic";

const TONE_TEXT = { ok: "text-[var(--ok)]", info: "text-[var(--info)]", warn: "text-[var(--warn)]", danger: "text-[var(--danger)]" } as const;

export default async function SermayePage() {
  const user = await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  const canCfo = await checkPermission(user, PERMISSIONS.CFO_READ);

  const [h, config, servetRows] = await Promise.all([
    loadCapitalHealth(),
    prisma.capitalConfig.findFirst(),
    canCfo
      ? prisma.$queryRaw<Array<{ servet_try: unknown; varlik: unknown; borc: unknown }>>`select servet_try, varlik, borc from cfo_servet`
      : Promise.resolve([]),
  ]);
  const servet = servetRows[0] ?? null;
  const reservePct = config ? Number(config.reservePct) : 20;
  const free = config ? freeCapital(Number(config.totalCapitalTry), h.lockedTry, reservePct) : null;

  const lockedTop = [...h.products].filter((p) => p.lockedTry > 0).sort((a, b) => b.lockedTry - a.lockedTry).slice(0, 20);
  const deadTry = h.dead.totalTry;
  const s = h.score;

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Wallet}
        breadcrumb={[{ label: "Günlük Durum" }, { label: "Sermaye" }]}
        title="Sermaye"
        subtitle="Sermayenin ne kadarı stokta bağlı, ne kadarı serbest, stok ne kadar sağlıklı ve satış ne getiriyor — tek ekranda, CFO'nun sayılarıyla."
        meta={
          <Badge variant={h.fx.fromCfo ? "neutral" : "warn"}>
            1 USD = ₺{h.fx.usdTry.toFixed(2)} · {h.fx.rmbPerUsd != null ? `${h.fx.rmbPerUsd.toFixed(2)} RMB` : "RMB kuru yok"} ({h.fx.source})
          </Badge>
        }
        actions={<PageHelp pageKey="admin/sermaye" />}
      />
      <ForecastV2Notice on={h.v2On} />

      <nav className="flex flex-wrap gap-2 text-xs">
        {[["#durum", "Sermaye durumu"], ["#saglik", "Sermaye sağlığı"], ["#operasyon", "Satış ve kârlılık"]].map(([href, label]) => (
          <a key={href} href={href} className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            {label}
          </a>
        ))}
      </nav>

      {/* ── 1) Sermaye durumu (eski /admin/capital) ───────────────────────── */}
      <section id="durum" className="scroll-mt-20 space-y-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Sermaye durumu</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Toplam sermaye (ayar)" value={free ? fmtTry(free.total) : "Girilmemiş"} subtitle={free ? undefined : "Aşağıdaki formdan girin"} />
          <SummaryCard label="Stokta bağlı" value={fmtTry(h.lockedTry)} subtitle="stok × birim maliyet (CFO stok değeri)" />
          <SummaryCard label="Serbest sermaye" value={free ? fmtTry(free.available) : "—"} subtitle="toplam − stokta bağlı" />
          <SummaryCard label={`Rezerv (${fmtPct(reservePct, 0)})`} value={free ? fmtTry(free.reserve) : "—"} subtitle="serbest sermayenin yüzdesi" />
          <SummaryCard label="Kullanılabilir" value={free ? fmtTry(free.deployable) : "—"} highlight />
        </div>
        {h.costMissingCount > 0 && (
          <p className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-4 py-2 text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--warn)]">{h.costMissingCount} stoklu üründe birim maliyet yok</span> — bu ürünler stokta bağlı
            sermayeye 0 TL olarak girdi; gerçek bağlı sermaye daha yüksek. Ürün kartında maliyeti girin.
          </p>
        )}
        {servet && (
          <p className="text-xs text-[var(--text-muted)]">
            CFO servet (varlık − borç): <span className="font-mono font-semibold text-[var(--text-primary)]">{fmtTry(Number(servet.servet_try ?? 0))}</span>
            {" "}· varlık {fmtTry(Number(servet.varlik ?? 0))} · borç {fmtTry(Number(servet.borc ?? 0))} ·{" "}
            <Link href="/cfo" className="underline hover:text-[var(--text-primary)]">CFO kokpiti →</Link>
          </p>
        )}

        <details className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4" open={!config}>
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Sermaye ayarları</summary>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Toplam sermaye ve rezerv oranı. Stokta bağlı tutar otomatik hesaplanır. Hangi ürünün sipariş edileceği bu ayardan değil,{" "}
            <Link href="/cfo/kazananlar#ithalat" className="underline">Sıradaki sipariş</Link> ekranından (CFO kuralları) gelir.
          </p>
          <div className="mt-4">
            <CapitalConfigForm
              initialValues={{
                totalCapitalTry: config ? String(config.totalCapitalTry) : "",
                reservePct: config ? String(config.reservePct) : "20",
                desiredTurnoverMonths: config ? String(config.desiredTurnoverMonths) : "3",
              }}
            />
          </div>
        </details>

        {lockedTop.length > 0 && (
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kilitli sermaye dağılımı</h3>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">Sermayeyi en çok bağlayan 20 ürün — stok × birim maliyet.</p>
              </div>
              <Badge>{lockedTop.length} ürün</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    <th className="px-6 py-3 text-left">Ürün</th>
                    <th className="px-4 py-3 text-right">Stok</th>
                    <th className="px-4 py-3 text-right">Birim maliyet</th>
                    <th className="px-4 py-3 text-right">Stok değeri</th>
                    <th className="px-4 py-3 text-right">Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {lockedTop.map((p) => {
                    const pct = h.lockedTry > 0 ? (p.lockedTry / h.lockedTry) * 100 : 0;
                    return (
                      <tr key={p.id} className="hover:bg-[var(--surface-3)]">
                        <td className="max-w-[260px] px-6 py-3">
                          <Link href={`/products/${p.id}`} className="line-clamp-1 font-medium text-[var(--text-primary)] hover:underline">{p.name}</Link>
                          <p className="font-mono text-xs text-[var(--text-muted)]">{p.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{p.stockQuantity}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtTry(p.lockedTry / p.stockQuantity)}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">{fmtTry(p.lockedTry)}</td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${pct >= 10 ? "font-semibold text-[var(--warn)]" : "text-[var(--text-secondary)]"}`}>
                          %{pct.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ── 2) Sermaye sağlığı (eski /admin/sermaye-saglik) ───────────────── */}
      <section id="saglik" className="scroll-mt-20 space-y-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Sermaye sağlığı</h2>
        <Card className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Sermaye Sağlık Skoru</p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className={`text-[64px] leading-none font-semibold tabular-nums ${TONE_TEXT[s.tone]}`}>{s.total}</span>
                <span className="text-sm text-[var(--text-muted)]">/ 100</span>
                <span className={`rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2.5 py-0.5 text-xs font-medium ${TONE_TEXT[s.tone]}`}>{s.label}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
              {([["ROI", s.roi, 50], ["Ölü stok", s.dead, 25], ["Acil sipariş", s.urgent, 10], ["Likidasyon", s.liquidation, 15]] as const).map(([label, v, max]) => (
                <div key={label}>
                  <p className="text-[11px] uppercase tracking-widest font-medium text-[var(--text-muted)]">{label}</p>
                  <p className="mt-1 font-mono font-semibold tabular-nums text-[var(--text-primary)]">{v.toFixed(0)}/{max}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricTile
            label="Aylık Beklenen Nakit"
            value={fmtTry(h.monthlyExpectedTry)}
            valueColor="text-[var(--ok)]"
            subSlot={<DeltaBadge delta={fmtDelta(h.monthlyExpectedTry, h.prevMonthlyExpectedTry)} className="mt-1" />}
          />
          <MetricTile
            label="Yıllık ROI Projeksiyonu"
            value={fmtPct(h.annualRoiPct)}
            valueColor="text-[var(--info)]"
            subSlot={<DeltaBadge delta={fmtDelta(h.annualRoiPct, h.prevAnnualRoiPct)} className="mt-1" />}
          />
          <MetricTile
            label="Ölü Stok (CFO kuralı)"
            value={fmtTry(deadTry)}
            valueColor="text-[var(--warn)]"
            sub={`${h.dead.rows.length - h.dead.unknownCostCount} ürün maliyetle · bağlı sermayenin ${fmtPct(h.lockedTry > 0 ? (deadTry / h.lockedTry) * 100 : 0, 0)}'i${h.dead.unknownCostCount > 0 ? ` · ${h.dead.unknownCostCount} ürün maliyet bilinmiyor (satış değeri ${fmtTry(h.dead.saleValueTry)}, toplama girmez)` : ""}`}
          />
        </div>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--border-default)] px-6 py-4">
            <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kategori dağılımı</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Stokta bağlı sermaye, ilk 10 kategori — toplam {fmtTry(h.lockedTry)}</p>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {h.categories.filter((c) => c.lockedTry > 0).slice(0, 10).map((c) => {
              const pct = h.lockedTry > 0 ? (c.lockedTry / h.lockedTry) * 100 : 0;
              return (
                <div key={c.name} className="grid grid-cols-12 items-center gap-3 px-6 py-3">
                  <div className="col-span-3 truncate text-sm font-medium text-[var(--text-primary)]" title={c.name}>{c.name}</div>
                  <div className="col-span-5">
                    <div className="h-2 overflow-hidden rounded-md bg-[var(--surface-3)]">
                      <div className="h-full rounded-md bg-[var(--accent)]" style={{ width: `${Math.min(100, pct).toFixed(1)}%` }} />
                    </div>
                  </div>
                  <div className="col-span-1 text-right font-mono text-xs tabular-nums text-[var(--text-muted)]">{fmtPct(pct)}</div>
                  <div className="col-span-2 text-right font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{fmtTry(c.lockedTry)}</div>
                  <div className="col-span-1 text-right text-xs text-[var(--text-muted)]">{c.productCount} ürün</div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <ActionList
            title="Yıldız Ürünler"
            subtitle="En çok aylık kâr getiren 10 ürün"
            color="emerald"
            csv={{
              filename: "yildiz-urunler.csv",
              columns: [
                { header: "Ürün", key: "name" }, { header: "Marka", key: "brand" }, { header: "SKU", key: "sku" },
                { header: "Aylık Kâr (TRY)", key: "monthly" }, { header: "Son 30 gün adet", key: "t30g" }, { header: "Stok", key: "stock" },
              ],
              rows: h.stars.map((p) => ({ name: p.name, brand: p.brand ?? "", sku: p.sku, monthly: p.monthlyProfitTry.toFixed(2), t30g: p.t30g, stock: p.stockQuantity })),
            }}
            rows={h.stars.slice(0, 10).map((p) => ({
              id: p.id, primary: p.name, secondary: `${p.brand ?? "—"} · ${p.sku}`, valueLabel: "aylık kâr",
              value: fmtTry(p.monthlyProfitTry), meta: `son 30 gün ${p.t30g} · stok ${p.stockQuantity}`,
            }))}
            emptyMsg="Henüz aylık kâr verisi yok."
          />
          <ActionList
            title="Ölü Stok"
            subtitle="CFO ölü stok listesi — bağlı sermayesi en yüksek 10 ürün"
            color="amber"
            csv={{
              filename: "olu-stok.csv",
              columns: [
                { header: "SKU", key: "sku" }, { header: "Ürün", key: "name" }, { header: "Bağlı Sermaye (TRY, maliyet)", key: "locked" }, { header: "Satış değeri (TRY, maliyet yok)", key: "sale" },
                { header: "Stok", key: "stock" }, { header: "Alarm", key: "alarm" }, { header: "Sebep", key: "reason" }, { header: "Son satış", key: "last" },
              ],
              rows: h.dead.rows.map((r) => ({ sku: r.sku, name: r.name, locked: r.lockedTry?.toFixed(2) ?? "", sale: r.saleValueTry?.toFixed(2) ?? "", stock: r.stock, alarm: r.alarm, reason: r.reason ?? "", last: r.lastSale ?? "" })),
            }}
            rows={h.dead.rows.slice(0, 10).map((r) => ({
              id: r.sku, href: r.productId ? `/products/${r.productId}` : null, primary: r.name, secondary: r.sku,
              valueLabel: r.lockedTry != null ? "bağlı sermaye" : "satış değeri · maliyet yok", value: fmtTry(r.lockedTry ?? r.saleValueTry ?? 0), meta: `stok ${r.stock} · ${r.alarm}${r.lastSale ? ` · son satış ${r.lastSale}` : " · hiç satış yok"}`,
            }))}
            emptyMsg="Ölü stok yok"
          />
          <ActionList
            title="Likidasyon Adayı"
            subtitle="Daha önce satılmış ama son 30 gündür hareket yok"
            color="orange"
            csv={{
              filename: "likidasyon-adaylari.csv",
              columns: [
                { header: "Ürün", key: "name" }, { header: "Marka", key: "brand" }, { header: "SKU", key: "sku" },
                { header: "Bağlı Sermaye (TRY)", key: "locked" }, { header: "Stok", key: "stock" }, { header: "Toplam satılan", key: "lifetime" },
              ],
              rows: h.liquidation.map((p) => ({ name: p.name, brand: p.brand ?? "", sku: p.sku, locked: p.lockedTry.toFixed(2), stock: p.stockQuantity, lifetime: p.lifetimeSold })),
            }}
            rows={h.liquidation.slice(0, 10).map((p) => ({
              id: p.id, primary: p.name, secondary: `${p.brand ?? "—"} · ${p.sku}`, valueLabel: "bağlı sermaye",
              value: fmtTry(p.lockedTry), meta: `stok ${p.stockQuantity} · toplam satılan ${p.lifetimeSold}`,
            }))}
            emptyMsg="Likidasyon adayı yok"
          />
        </div>
        {canCfo && (
          <p className="text-xs text-[var(--text-muted)]">
            Ölü stok kuralı ve takip notları: <Link href="/cfo/olu-stok" className="underline hover:text-[var(--text-primary)]">CFO → Ölü stok</Link>.
          </p>
        )}
      </section>

      {/* ── 3) Satış ve kârlılık (eski /admin/executive) ─────────────────── */}
      <OperationsSection />

      <div className="flex flex-wrap gap-4 border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-muted)]">
        <Link href="/cfo/kazananlar#ithalat" className="hover:text-[var(--text-primary)]">Sıradaki sipariş →</Link>
        <Link href="/admin/import-calculator" className="hover:text-[var(--text-primary)]">İthalat hesaplayıcısı →</Link>
        <Link href="/marketplace/profit" className="hover:text-[var(--text-primary)]">Pazar kârlılığı →</Link>
        <Link href="/marketplace/realized-margin" className="hover:text-[var(--text-primary)]">Gerçekleşen marj →</Link>
        {canCfo && <Link href="/cfo/ayarlar" className="hover:text-[var(--text-primary)]">CFO kuru →</Link>}
      </div>
      <p className="text-center text-xs text-[var(--text-muted)]">
        Kâr hesabı: <code>lib/importer-cost.ts</code> (Trendyol kargo dilimi + komisyon) · Karşılaştırma: son 30 gün vs önceki 30 gün ·
        Bağlı sermaye ve ölü stok: CFO görünümleri (cfo_stok_deger, cfo_olu_stok).
      </p>
    </div>
  );
}
