/** Faz 90 — CFO / Alacaklar: pazaryeri hakediş takvimi. */
import { Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadCfoData } from "@/lib/cfo/queries";
import { num } from "@/lib/cfo/engine";
import { fmtTry, fmtDate, relDays } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

export default async function CfoReceivablesPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const { raw, overview: o } = await loadCfoData();
  const pending = raw.receivables.filter((r) => !r.isCollected);

  return (
    <>
      <PageHeader
        icon={Wallet}
        title="Pazaryeri Alacakları"
        subtitle="Gerçek tarihli hakediş takvimi. Tahmin değil — pazaryeri ödeme ekranından girilen kesin tutarlar."
      />

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Kanal dağılımı</h2>
        <CfoTable head={<tr><Th>Kanal</Th><Th right>Bekleyen alacak</Th><Th right>Ödeme sayısı</Th><Th right>Pay</Th></tr>}>
          {o.receivablesByChannel.map((c) => (
            <tr key={c.channel}>
              <Td strong>{c.channel}</Td>
              <Td right>{fmtTry(c.amount)}</Td>
              <Td right muted>{c.count}</Td>
              <Td right muted>
                {o.receivablesPendingTry > 0 ? `%${((c.amount / o.receivablesPendingTry) * 100).toFixed(1)}` : "—"}
              </Td>
            </tr>
          ))}
          <tr className="bg-[var(--surface-1)] font-semibold">
            <Td strong>TOPLAM</Td>
            <Td right strong>{fmtTry(o.receivablesPendingTry)}</Td>
            <Td right strong>{pending.length}</Td>
            <Td right>—</Td>
          </tr>
        </CfoTable>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Ödeme takvimi</h2>
          <Badge variant="neutral">{pending.length} bekleyen</Badge>
        </div>
        <CfoTable
          head={<tr><Th>Tarih</Th><Th>Kanal</Th><Th right>Tutar</Th><Th>Kesinlik</Th><Th>Kaynak</Th></tr>}
          empty={raw.receivables.length === 0 ? "Henüz hakediş kaydı yok." : undefined}
        >
          {raw.receivables.map((r) => (
            <tr key={r.id} className={r.isCollected ? "opacity-50" : ""}>
              <Td strong>{fmtDate(r.dueDate)}<span className="ml-2 text-[10px] text-[var(--text-muted)]">{relDays(r.dueDate)}</span></Td>
              <Td>{r.channel}</Td>
              <Td right>{fmtTry(num(r.amountTry))}</Td>
              <Td>
                <Badge variant={r.isCollected ? "neutral" : r.certainty === "KESIN" ? "ok" : "warn"}>
                  {r.isCollected ? "Tahsil edildi" : r.certainty === "KESIN" ? "Kesin" : "Tahmini"}
                </Badge>
              </Td>
              <Td muted>{r.source ?? "—"}</Td>
            </tr>
          ))}
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Bu takvimde olmayan kanallar için haftalık (ciro/4) tahmini devreye girer — Nakit Akışı sayfasına bakın.
        </p>
      </Card>
    </>
  );
}
