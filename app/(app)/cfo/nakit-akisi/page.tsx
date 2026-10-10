/** Faz 90 — CFO / Nakit Akışı: rolling forecast + haftalık tahmin + olay tablosu. */
import { TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadCfoData } from "@/lib/cfo/queries";
import { loadCashHorizons } from "@/lib/cfo/cash-path";
import { num } from "@/lib/cfo/engine";
import { fmtTry, fmtDate, relDays } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrafficBadge } from "@/components/cfo/badges";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  TAHSILAT: "Tahsilat", KREDI_TAKSITI: "Kredi taksiti", KART_ODEMESI: "Kart ödemesi",
  SABIT_GIDER: "Sabit gider", KMH: "KMH", VERGI_GUMRUK: "Vergi/Gümrük", DIGER: "Diğer",
};

export default async function CfoCashFlowPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const [{ raw, overview: o }, yol] = await Promise.all([loadCfoData(), loadCashHorizons()]);

  // CFO-013 tek nakit yolu: vadesi geçmiş ÖDENMEMİŞ olay projeksiyonda bugün vadeli sayılır — listede de görünür (eskiden `>= today`
  // süzgeci gizliyordu; ufuk toplamında olan bir çıkış tabloda yoktu). Gecikmişler başta, rozetle.
  const upcoming = raw.cashEvents
    .filter((e) => !e.isSettled)
    .slice(0, 60);
  const overdue = upcoming.filter((e) => e.eventDate < o.today).length;

  return (
    <>
      <PageHeader
        icon={TrendingUp}
        title="Nakit Akışı"
        subtitle="Bugünden ileriye 90 günlük zorunlu ödeme ve beklenen tahsilat takvimi."
      />

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Rolling forecast</h2>
        <CfoTable head={
          <tr>
            <Th>Dönem</Th><Th right>Giriş</Th><Th right>Çıkış</Th><Th right>Net</Th>
            <Th right>Pozisyon</Th><Th right>Açık</Th><Th>Durum</Th>
          </tr>
        }>
          {yol.horizons.map((h) => (
            <tr key={h.days}>
              <Td strong>{h.label}</Td>
              <Td right>{fmtTry(h.inflow)}</Td>
              <Td right>{fmtTry(h.outflow)}</Td>
              <Td right danger={h.net < 0}>{fmtTry(h.net)}</Td>
              <Td right strong danger={h.position < 0}>{fmtTry(h.position)}</Td>
              <Td right>{h.gap > 0 ? fmtTry(h.gap) : "—"}</Td>
              <Td><TrafficBadge value={h.traffic} /></Td>
            </tr>
          ))}
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Başlangıç noktası bugünkü net banka pozisyonu ({fmtTry(o.netCashTry)}). Kaynak tek nakit yolu (<code>cfo_nakit_projeksiyon</code>; ödeme takvimi ve kapasite alarmıyla aynı).
        </p>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Haftalık tahmini ek tahsilat</h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          {o.weeklyEstimateSource === "kanal_temposu" ? (
            <>
              Ek tahsilat = kanal temposu (<code>cfo_tahsilat_tahmini</code>): her kanal yalnız kendi son açık hakedişinden SONRA,
              önümüzdeki 30 günün hakedişi / 30 ile sayılır — nakit projeksiyonu ve ödeme takvimiyle aynı mekanizma, alacakla çakışmaz.
            </>
          ) : (
            <>
              Brüt tahmin = son 14 gün cirosu / 4 = {fmtTry(o.weeklyEstimateGrossTry)} (yedek: tahsilat tahmini görünümü okunamadı).
              Aynı haftadaki gerçek hakedişler bu tutardan DÜŞÜLÜR — böylece aynı para iki kez sayılmaz.
            </>
          )}
        </p>
        <CfoTable head={
          <tr><Th>Hafta</Th><Th right>{o.weeklyEstimateSource === "kanal_temposu" ? "Toplam giriş" : "Brüt tahmin"}</Th><Th right>Gerçek hakediş</Th><Th right>Net ek tahsilat</Th></tr>
        }>
          {o.weeks.slice(0, 8).map((w, i) => (
            <tr key={i}>
              <Td>{fmtDate(w.start)} – {fmtDate(w.end)}</Td>
              <Td right muted>{fmtTry(w.gross)}</Td>
              <Td right>{fmtTry(w.actual)}</Td>
              <Td right strong>{fmtTry(w.net)}</Td>
            </tr>
          ))}
        </CfoTable>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Yaklaşan olaylar</h2>
          <span className="flex gap-2">
            {overdue > 0 && <Badge variant="danger">{overdue} gecikmiş</Badge>}
            <Badge variant="neutral">{upcoming.length} kayıt</Badge>
          </span>
        </div>
        <CfoTable
          head={<tr><Th>Tarih</Th><Th>Tür</Th><Th>Açıklama</Th><Th right>Giriş</Th><Th right>Çıkış</Th><Th>Kesinlik</Th></tr>}
          empty={upcoming.length === 0 ? "Yaklaşan kayıtlı olay yok." : undefined}
        >
          {upcoming.map((e) => {
            const d = e.eventDate;
            const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - o.today.getTime()) / 86400000);
            return (
              <tr key={e.id} className={days <= 7 ? "bg-[var(--danger-dim)]" : days <= 30 ? "bg-[var(--warn-dim)]" : ""}>
                <Td strong>{fmtDate(d)}<span className="ml-2 text-[10px] text-[var(--text-muted)]">{relDays(d)}</span>{days < 0 && <span className="ml-1"><Badge variant="danger">gecikmiş</Badge></span>}</Td>
                <Td muted>{KIND_LABEL[e.kind] ?? e.kind}</Td>
                <Td>{e.description}{e.note ? <span className="block text-[11px] text-[var(--text-muted)]">{e.note}</span> : null}</Td>
                <Td right>{num(e.inflowTry) > 0 ? fmtTry(num(e.inflowTry)) : "—"}</Td>
                <Td right danger={num(e.outflowTry) > 0}>{num(e.outflowTry) > 0 ? fmtTry(num(e.outflowTry)) : "—"}</Td>
                <Td><Badge variant={e.certainty === "KESIN" ? "ok" : "warn"}>{e.certainty === "KESIN" ? "Kesin" : "Tahmini"}</Badge></Td>
              </tr>
            );
          })}
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Kırmızı satır = gecikmiş ya da 7 gün içinde, sarı = 8–30 gün. Gecikmiş ödenmemiş olay nakit tahmininde bugün vadeli sayılır. Pazaryeri tahsilatları bu tabloda değil, Alacaklar sayfasında tutulur.
        </p>
      </Card>
    </>
  );
}
