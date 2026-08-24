/** Faz 90 — CFO / Gümrük Rezervi: ithalat vergi yükümlülüğü ve finansman açığı. */
import { Ship, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadCfoData } from "@/lib/cfo/queries";
import { num } from "@/lib/cfo/engine";
import { fmtTry, fmtUsd, fmtPct, fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrafficBadge } from "@/components/cfo/badges";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

export default async function CfoCustomsPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const { raw, overview: o } = await loadCfoData();

  return (
    <>
      <PageHeader
        icon={Ship}
        title="Gümrük Rezervi & İthalat"
        subtitle="Rezerve ayrılan para serbest nakit sayılmaz. Açık, boş KMH kapasitesiyle karşılaştırılır."
      />

      {o.customs ? (
        <Card className="mb-6 p-5">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Rezerv durumu</h2>
            <TrafficBadge value={o.customs.traffic} />
          </div>
          <CfoTable head={<tr><Th>Kalem</Th><Th right>Tutar</Th><Th>Not</Th></tr>}>
            <Row label="Hedef" value={fmtTry(o.customs.target)} note="İthalat gümrük + vergi tahmini" />
            <Row label="Ayrılmış rezerv" value={fmtTry(o.customs.saved)} note="Serbest nakde dahil edilmez" />
            <Row label="İhtiyaç tarihi" value={fmtDate(o.customs.dueDate)} note={o.customs.daysLeft != null ? `${o.customs.daysLeft} gün kaldı` : ""} />
            <Row label="Bugünkü net nakit" value={fmtTry(o.netCashTry)} note="Negatif = kullanılan KMH" />
            <Row label="Tarihe kadar beklenen tahsilat" value={fmtTry(o.customs.expectedInflow)} note="Gerçek hakediş + çift sayım korumalı tahmin" />
            <Row label="Tarihe kadar zorunlu ödemeler" value={fmtTry(o.customs.mandatoryOutflow)} note="Gümrük ödemesinin kendisi hariç" />
            <Row label="Projeksiyon nakit" value={fmtTry(o.customs.projectedCash)} note="Rezerv ayrılmadan önceki pozisyon" strong />
            <Row label="FİNANSMAN AÇIĞI" value={fmtTry(o.customs.gap)} note="Hedef − (projeksiyon + ayrılmış)" strong danger={o.customs.gap > 0} />
            <Row label="Boş KMH kapasitesi" value={fmtTry(o.freeKmhTry)} note="Açığı karşılayabilecek kapasite" />
            <Row label="Açık sonrası kalan kapasite" value={fmtTry(o.customs.remainingCapacity)} note={o.customs.remainingCapacity < 0 ? "KMH YETMİYOR" : "KMH ile karşılanabilir"} strong danger={o.customs.remainingCapacity < 0} />
            <Row label="Açığın 1 aylık faiz maliyeti" value={fmtTry(o.customs.interestCostMonthly)} note={`%${o.monthlyRatePct}/ay`} />
          </CfoTable>

          {o.customs.gap > 0 && (
            <div className="mt-4 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-dim)] p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle size={15} className="text-[var(--warn)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Aksiyon planı</h3>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                <li>Gelen pazaryeri tahsilatlarını KMH azaltmak yerine rezervde biriktir.</li>
                <li>Yeni ithalat siparişi verme — nakit gümrüğe bağlanacak.</li>
                <li>Erken kredi kapamasını gümrük ödenene kadar ertele.</li>
                <li>Kredi kartlarında yalnız asgari öde, fazlasını ödeme.</li>
                {o.customs.remainingCapacity < 0 && (
                  <li className="font-medium text-[var(--danger)]">
                    KMH kapasitesi yetmiyor: gümrük taksitlendirmesi veya ek finansman görüşmesi başlat.
                  </li>
                )}
              </ol>
            </div>
          )}
        </Card>
      ) : (
        <Card className="mb-6 p-6 text-sm text-[var(--text-muted)]">
          Gümrük rezerv hedefi ve tarihi girilmemiş — Ayarlar sayfasından tanımlayın.
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">İthalat partileri</h2>
        <CfoTable
          head={<tr><Th>Parti</Th><Th>Durum</Th><Th>ETA</Th><Th right>Maliyet</Th><Th right>Gümrük</Th><Th right>Beklenen kâr</Th><Th right>ROI</Th></tr>}
          empty={raw.imports.length === 0 ? "Kayıtlı ithalat partisi yok." : undefined}
        >
          {raw.imports.map((i) => {
            const costTry = num(i.totalCostUsd) * o.usdTry;
            const profit = num(i.expectedProfitTry);
            const roi = costTry > 0 ? profit / costTry : null;
            const roiWithCustoms = costTry > 0 ? profit / (costTry + num(i.customsEstimateTry)) : null;
            return (
              <tr key={i.id}>
                <Td strong>{i.code}</Td>
                <Td><Badge variant={i.status === "YOLDA" ? "info" : i.status === "TESLIM_ALINDI" ? "ok" : "warn"}>{i.status}</Badge></Td>
                <Td muted>{fmtDate(i.etaDate)}</Td>
                <Td right>{fmtUsd(num(i.totalCostUsd))}<span className="block text-[10px] text-[var(--text-muted)]">{fmtTry(costTry)}</span></Td>
                <Td right>{fmtTry(num(i.customsEstimateTry))}</Td>
                <Td right>{fmtTry(profit)}</Td>
                <Td right>
                  {fmtPct(roi)}
                  {roiWithCustoms != null && (
                    <span className="block text-[10px] text-[var(--text-muted)]">gümrük dahil {fmtPct(roiWithCustoms)}</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Beklenen kâr TAHMİNDİR, gerçekleşmiş kâr değildir. Şirket sabit giderleri ({fmtTry(o.fixedExpenseMonthlyTry)}/ay) bu tutardan düşülmemiştir.
        </p>
      </Card>
    </>
  );
}

function Row({ label, value, note, strong, danger }: {
  label: string; value: string; note?: string; strong?: boolean; danger?: boolean;
}) {
  return (
    <tr className={strong ? "bg-[var(--surface-1)]" : ""}>
      <Td strong={strong}>{label}</Td>
      <Td right strong={strong} danger={danger}>{value}</Td>
      <Td muted>{note}</Td>
    </tr>
  );
}
