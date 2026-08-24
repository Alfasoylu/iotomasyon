/** Faz 90 — CFO / Sermaye Tahsisi: her yeni serbest nakit için alternatif kullanım. */
import { Scale } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadCfoData } from "@/lib/cfo/queries";
import { buildAllocation } from "@/lib/cfo/engine";
import { fmtTry, fmtPct } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

export default async function CfoAllocationPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const { raw, overview: o } = await loadCfoData();
  const options = buildAllocation(o, raw.loans);

  return (
    <>
      <PageHeader
        icon={Scale}
        title="Sermaye Tahsisi"
        subtitle="Eline geçen her serbest nakit için: borç mu kapatmalı, mal mı almalı, reklam mı artırmalı?"
      />

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
