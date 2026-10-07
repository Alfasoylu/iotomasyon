/** Faz 90 — CFO / Sermaye Tahsisi: her yeni serbest nakit için alternatif kullanım. */
import { Scale } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadCfoData } from "@/lib/cfo/queries";
import { buildAllocation } from "@/lib/cfo/engine";
import { loadCapitalEfficiency } from "@/lib/cfo/capital-efficiency-data";
import { prisma } from "@/lib/prisma";
import type { CapClass, SkuResult } from "@/lib/cfo/capital-efficiency";
import Link from "next/link";
import { fmtTry, fmtPct } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

export default async function CfoAllocationPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const [{ raw, overview: o }, ce] = await Promise.all([loadCfoData(), loadCapitalEfficiency(sql => prisma.$queryRawUnsafe(sql))]);
  const options = buildAllocation(o, raw.loans);
  const hurdlePct = ce.hurdleMonthly != null ? ce.hurdleMonthly * 100 : null;
  const top = (cls: CapClass[], key: (r: SkuResult) => number, n = 8) => ce.skus.filter(r => cls.includes(r.cls)).sort((a, b) => key(b) - key(a)).slice(0, n);

  return (
    <>
      <PageHeader
        icon={Scale}
        title="Sermaye Tahsisi"
        subtitle="Eline geçen her serbest nakit için: borç mu kapatmalı, mal mı almalı, reklam mı artırmalı?"
      />

      {/* Sermaye verimliliği — deterministik (lib/cfo/capital-efficiency.ts). Eşik: en pahalı kapatılabilir ticari borcun aylık faizi. */}
      <Card className="mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Sermaye verimliliği — stoktaki her TL borç faizinden fazla kazandırıyor mu?</h2>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Eşik getiri: {hurdlePct == null ? "bilinmiyor (kredi faizi girilmemiş)" : `aylık %${hurdlePct.toFixed(2)} (${ce.hurdleSource})`} ·
          hedef stok örtüsü {ce.params.targetCoverDays} gün (deniz tedarik süresi + 30) · SKU getirisi = (birim net değer − maliyet) × aylık satış / bağlı sermaye
          (son 90 gün gerçekleşen satış).
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          {[
            ["Eşik altı değer kaybı", `${fmtTry(ce.dragMonthlyTry)}/ay`, "bu sermaye borç kapatsaydı kazanılacak − bugünkü katkı"],
            ["Açığa çıkarılabilir nakit", fmtTry(ce.releasableCashTry), "fazla + ölü stok, elde tutmaya eşit indirimle"],
            ["Likidite açığı", ce.liquidityGapTry > 0 ? fmtTry(ce.liquidityGapTry) : "yok", "120 gün nakit dibi tabanın altında"],
            ["Eşik altı sermaye", fmtTry(ce.portfolio.TRIM.capitalTry + ce.portfolio.LIQUIDATE.capitalTry + ce.portfolio.FIX_PRICE.capitalTry), "TRIM + LIQUIDATE + FIX_PRICE"],
          ].map(([l, v, sub]) => (
            <div key={l} className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
              <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">{l}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">{v}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{sub}</p>
            </div>
          ))}
        </div>
        <CfoTable head={<tr><Th>Sınıf</Th><Th right>SKU</Th><Th right>Bağlı sermaye</Th><Th right>Aylık katkı</Th><Th right>Eşik altı kayıp/ay</Th><Th right>Açığa çıkabilir nakit</Th><Th>Ne yapılmalı</Th></tr>}>
          {(["SCALE", "KEEP", "TRIM", "FIX_PRICE", "LIQUIDATE", "UNKNOWN"] as CapClass[]).map(c => (
            <tr key={c}>
              <Td strong>{c}</Td><Td right>{ce.portfolio[c].n}</Td><Td right>{fmtTry(ce.portfolio[c].capitalTry)}</Td>
              <Td right>{fmtTry(ce.portfolio[c].contributionMonthlyTry)}</Td><Td right>{fmtTry(ce.portfolio[c].dragMonthlyTry)}</Td>
              <Td right>{fmtTry(ce.portfolio[c].releaseCashTry)}</Td>
              <Td muted>{{ SCALE: "Getiri eşiğin 2 katı üstünde ve stok bitiyor → sıradaki TL burada", KEEP: "Dokunma", TRIM: "Yeniden sipariş verme; fazlayı break-even indirime kadar erit",
                FIX_PRICE: "Her satış zarar — fiyatı/kargoyu düzelt ya da satışı durdur (fiyat değişikliği senin onayınla)", LIQUIDATE: "Satmıyor — tasfiye et, nakdi pahalı borca/likiditeye aktar",
                UNKNOWN: "Maliyet ya da satış fiyatı kanıtı yok — veri girilmeli" }[c]}</Td>
            </tr>
          ))}
        </CfoTable>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Sıradaki {fmtTry(ce.budgetTry)} nereye? (açığa çıkarılabilir nakit kadar)</h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">Önce likidite açığı (zorunlu), sonra risk ayarlı aylık getiriye göre: stok tamamlama getirisi 90 günlük satışa dayanır (güven 0,6), borç kapama kesindir (güven 1). Para transferi/sipariş/kredi işlemi yapılmaz — karar önerisidir.</p>
        <CfoTable head={<tr><Th>#</Th><Th>Kullanım</Th><Th right>Tutar</Th><Th right>Aylık getiri</Th><Th right>Güven</Th><Th>Hedef etkisi</Th><Th>Aşağı yön</Th></tr>}>
          {ce.plan.map((p, i) => (
            <tr key={i}>
              <Td strong>{i + 1}</Td><Td strong>{p.use.label}</Td><Td right>{fmtTry(p.amountTry)}</Td>
              <Td right>{p.use.returnMonthly == null ? "zorunlu" : `%${(p.use.returnMonthly * 100).toFixed(1)}`}</Td>
              <Td right>{p.use.confidence.toFixed(1)}</Td>
              <Td muted>{[p.use.goal.debtTry ? `borç ${fmtTry(p.use.goal.debtTry)}` : null, p.use.goal.netCapitalMonthlyTry ? `sermaye +${fmtTry(p.use.goal.netCapitalMonthlyTry * p.amountTry / Math.max(1, p.use.capitalTry))}/ay` : null,
                p.use.goal.revenueMonthlyTry ? `ciro ~${fmtTry(p.use.goal.revenueMonthlyTry)}/ay` : null].filter(Boolean).join(" · ") || "taban korunur"}</Td>
              <Td muted>{p.use.downside}</Td>
            </tr>
          ))}
        </CfoTable>
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {([
          ["Her satışı zarar olanlar (FIX_PRICE)", top(["FIX_PRICE"], r => -(r.monthlyContributionTry ?? 0)), (r: SkuResult) => `${fmtTry(-(r.monthlyContributionTry ?? 0))}/ay zarar · ${r.reason}`],
          ["Sermayeyi en çok bağlayanlar (TRIM / LIQUIDATE)", top(["TRIM", "LIQUIDATE"], r => r.dragMonthlyTry), (r: SkuResult) => `${fmtTry(r.dragMonthlyTry)}/ay kayıp · ${r.excessUnits} adet fazla · indirim ≤ %${Math.round((r.breakEvenDiscount ?? 0) * 100)} · nakit ${fmtTry(r.releaseCashTry)}`],
          ["Sıradaki TL burada (SCALE)", top(["SCALE"], r => r.marginalReturnMonthly ?? 0), (r: SkuResult) => `aylık %${((r.marginalReturnMonthly ?? 0) * 100).toFixed(1)} · tamamlama ${fmtTry(r.restockCapitalTry)} · örtü ${Math.round(r.coverDays ?? 0)} gün`],
        ] as const).map(([title, rows, line]) => (
          <Card key={title} className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{title}</h3>
            {rows.length === 0 ? <p className="text-xs text-[var(--text-muted)]">yok</p> : (
              <ul className="space-y-2 text-xs">
                {rows.map(r => (
                  <li key={r.id}>
                    <Link href={`/products/${r.id}`} className="font-medium text-[var(--text-primary)] hover:underline">{r.sku}</Link>
                    <span className="text-[var(--text-muted)]"> — {r.name}</span>
                    <p className="text-[var(--text-secondary)]">{line(r)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Seçenek karşılaştırması</h2>
        <CfoTable head={
          <tr>
            <Th>#</Th><Th>Seçenek</Th><Th right>Gereken sermaye</Th><Th right>Kesin faiz tasarrufu</Th>
            <Th right>Nakit rahatlaması</Th><Th right>Yıllık ROI</Th><Th>Risk</Th><Th>Likidite</Th>
          </tr>
        }>
          {options.map((x) => (
            <tr key={x.rank} className={x.dataOk ? "" : "opacity-70"}>
              <Td strong>{x.rank}</Td>
              <Td strong>
                {x.name}
                <span className="block text-[11px] font-normal text-[var(--text-muted)]">{x.advice}</span>
              </Td>
              <Td right>{x.capital == null ? "—" : fmtTry(x.capital)}</Td>
              <Td right>{x.certainSavingMonthly == null ? "—" : `${fmtTry(x.certainSavingMonthly)}/ay`}</Td>
              <Td right>{x.cashReliefMonthly == null ? "—" : `${fmtTry(x.cashReliefMonthly)}/ay`}</Td>
              <Td right strong>
                {x.annualRoi == null
                  ? <span className="text-[var(--danger)]">veri yok</span>
                  : fmtPct(x.annualRoi)}
              </Td>
              <Td muted>{x.risk}</Td>
              <Td muted>{x.liquidity}</Td>
            </tr>
          ))}
        </CfoTable>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Strateji kuralları</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
          <li>
            %{o.monthlyRatePct}/ay maliyetli KMH ve kredi kartı <strong>kalıcı sermaye olarak kullanılmaz</strong>;
            yalnız kısa vadeli köprü finansmanıdır. Yıllık maliyeti {fmtPct((o.monthlyRatePct / 100) * 12)}.
          </li>
          <li>Ucuz krediler yüksek ROI&apos;li ithalatı finanse etmek için korunur — sırf borçsuz kalmak için erken kapatılmaz.</li>
          <li>Stokta duran sermaye aylık getirisi eşiğin (en pahalı ticari kredinin aylık faizi) altındaysa yeniden sipariş verilmez; fazlası tasfiye edilip pahalı borca aktarılır.</li>
          <li>Sıra: gümrük rezervi → KMH sıfırlama → kart borcu → pahalı kredi kapama → yeni ithalat büyütme.</li>
          <li>
            Bir seçeneğin yıllıklandırılmış ROI&apos;si %{((o.monthlyRatePct / 100) * 12 * 100).toFixed(0)}&apos;in
            altındaysa o para borç kapatmaya gider.
          </li>
          <li>Erken kapama öncesi: yeterli işletme sermayesi + gelecek ithalat sermayesi + nakit tampon korunmalı.</li>
        </ol>
        {o.loansMissingRate > 0 && (
          <p className="mt-4 rounded border border-[var(--danger-border)] bg-[var(--danger-dim)] px-3 py-2 text-xs text-[var(--text-primary)]">
            <Badge variant="danger">Eksik veri</Badge>{" "}
            {o.loansMissingRate} kredinin faiz oranı girilmediği için sıralama eksik. Faiz oranları girilene kadar
            erken kapama önerileri yalnız nakit akışı rahatlamasına dayanıyor.
          </p>
        )}
      </Card>
    </>
  );
}
