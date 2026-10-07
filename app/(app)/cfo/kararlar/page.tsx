/**
 * CFO / Kararlar — Decision Memory (2026-10-07). cfo_hamle defterindeki her stratejik karar veriyle ölçülür: başlangıç → bugün →
 * hedef, hedefe giden doğrusal yola göre ilerleme, kapanmış kararlarda tahmin isabeti. Deterministik (lib/cfo/decision-memory.ts);
 * deftere yazmaz.
 */
import { History } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { loadDecisionMemory } from "@/lib/cfo/decision-memory-data";
import { METRIC_LABEL, type HamleStatus } from "@/lib/cfo/decision-memory";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

const STATUS: Record<HamleStatus, { label: string; variant: "danger" | "warn" | "ok" | "info" | "neutral" }> = {
  WRONG_DIRECTION: { label: "Ters yönde", variant: "danger" }, WORSENING: { label: "Kötüleşiyor", variant: "danger" },
  BEHIND: { label: "Geride", variant: "warn" }, NO_BASELINE: { label: "Başlangıç yok", variant: "warn" },
  ON_TRACK: { label: "Yolunda", variant: "ok" }, IMPROVING: { label: "İyileşiyor", variant: "ok" }, ACHIEVED: { label: "Hedefe ulaştı", variant: "ok" },
  UNMEASURED: { label: "Veriyle ölçülemiyor", variant: "neutral" }, CLOSED: { label: "Kapandı", variant: "info" },
};

export default async function CfoDecisionsPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const dm = await loadDecisionMemory(sql => prisma.$queryRawUnsafe(sql));
  const bad = (dm.byStatus.WRONG_DIRECTION ?? 0) + (dm.byStatus.WORSENING ?? 0) + (dm.byStatus.BEHIND ?? 0);
  return (
    <>
      <PageHeader icon={History} title="Kararlar ve Sonuçları"
        subtitle="Verilen her stratejik karar veriyle ölçülür: beklenen ne idi, bugün neredeyiz, hedefe yetişiyor muyuz?" />
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={bad ? "danger" : "ok"}>{bad} karar ters yönde / geride</Badge>
          {Object.entries(dm.byStatus).map(([k, n]) => <Badge key={k} variant="neutral">{STATUS[k as HamleStatus].label}: {n}</Badge>)}
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Kalibrasyon: kapanmış {dm.calibration.measured + dm.calibration.unmeasurableClosed} kararın {dm.calibration.measured} tanesinde isabet ölçülebildi
          {dm.calibration.meanError != null ? ` (ortalama tahmin hatası %${Math.round(dm.calibration.meanError * 100)})` : ""}.
          {dm.calibration.unmeasurableClosed > 0 && ` ${dm.calibration.unmeasurableClosed} karar beklenen SAYI olmadan kaydedildiği için ölçülemez — yeni kararlar beklenen değerle kaydedilmeli.`}
          {" "}Ölçüm tarihi {dm.today}; değerler bugünkü veridir, defter değiştirilmez.
        </p>
      </Card>
      <Card className="p-5">
        <CfoTable head={<tr><Th>Durum</Th><Th>Karar</Th><Th>Metrik</Th><Th right>Başlangıç</Th><Th right>Bugün</Th><Th right>Hedef</Th><Th>Değerlendirme</Th></tr>}>
          {dm.evals.map(e => (
            <tr key={e.kod}>
              <Td><Badge variant={STATUS[e.status].variant}>{STATUS[e.status].label}</Badge></Td>
              <Td strong>{e.kod}<span className="block text-[11px] font-normal text-[var(--text-muted)]">{e.baslik} · {e.kararTarihi} · {e.durum}</span></Td>
              <Td muted>{e.metric ? METRIC_LABEL[e.metric] : e.olcumMetrigi ?? "—"}</Td>
              <Td right>{e.baslangicDeger == null ? "—" : Math.round(e.baslangicDeger).toLocaleString("tr-TR")}</Td>
              <Td right strong>{e.current == null ? (e.gerceklesenDeger == null ? "—" : Math.round(e.gerceklesenDeger).toLocaleString("tr-TR")) : Math.round(e.current).toLocaleString("tr-TR")}</Td>
              <Td right>{e.beklenenDeger == null ? "—" : Math.round(e.beklenenDeger).toLocaleString("tr-TR")}{e.deadline ? <span className="block text-[11px] text-[var(--text-muted)]">{e.deadline}</span> : null}</Td>
              <Td muted>{e.note}</Td>
            </tr>
          ))}
        </CfoTable>
      </Card>
    </>
  );
}
