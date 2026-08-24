/** Faz 90 — CFO / Ayarlar: tüm hesapların dayandığı parametreler + değişim logu. */
import { Settings } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadCfoData, loadChangeLog, loadSnapshots } from "@/lib/cfo/queries";
import { num } from "@/lib/cfo/engine";
import { fmtTry, fmtUsd, fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

export default async function CfoSettingsPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const [{ raw, overview: o }, changes, snapshots] = await Promise.all([
    loadCfoData(), loadChangeLog(30), loadSnapshots(12),
  ]);
  const s = raw.settings;

  return (
    <>
      <PageHeader
        icon={Settings}
        title="CFO Ayarları"
        subtitle="Kur, faiz ve hedef parametreleri. Buradaki değerler tüm CFO ekranlarını besler."
      />

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Parametreler</h2>
        {s ? (
          <CfoTable head={<tr><Th>Parametre</Th><Th right>Değer</Th><Th>Açıklama</Th></tr>}>
            <P label="USD/TRY kuru" value={num(s.usdTryRate).toLocaleString("tr-TR")} note="Tüm USD çevrimleri" />
            <P label="KMH / kart aylık faiz" value={`%${num(s.kmhMonthlyRatePct)}`} note="Kısa vadeli finansman maliyeti" />
            <P label="Kart asgari ödeme oranı" value={`%${num(s.cardMinPct)}`} note="Gerçek ekstre asgarisi yoksa kullanılır" />
            <P label="Pazaryeri ödeme vadesi" value={`${s.marketplaceTermDays} gün`} note="Nakit dönüş süresi hesabında" />
            <P label="Ciro → nakit oranı" value={`%${num(s.cashConversionPct)}`} note="Cironun nakde dönen kısmı" />
            <P label="Son 14 gün cirosu" value={fmtTry(num(s.last14dRevenueTry))} note={`Güncelleme: ${fmtDate(s.last14dRevenueDate)}${o.revenueDataAgeDays != null ? ` (${o.revenueDataAgeDays} gün önce)` : ""}`} />
            <P label="Aylık ciro run-rate" value={fmtTry(o.monthlyRunRateTry)} note="Son 14 günden türetilir" />
            <P label="Gümrük rezerv hedefi" value={fmtTry(num(s.customsReserveTarget))} note={`İhtiyaç tarihi: ${fmtDate(s.customsReserveDate)}`} />
            <P label="Ayrılmış rezerv" value={fmtTry(num(s.customsReserveSaved))} note="Serbest nakde dahil edilmez" />
            <P label="Satılabilir stok" value={fmtUsd(num(s.stockCostUsd))} note={fmtTry(o.sellableStockTry)} />
            <P label="Bloke stok" value={fmtUsd(num(s.blockedStockUsd))} note="Satış projeksiyonunda kullanılmaz" />
            <P label="Servet hedefi" value={fmtUsd(num(s.usdWealthTarget))} note={`Hedef tarihi: ${fmtDate(s.wealthTargetDate)}`} />
          </CfoTable>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Ayar kaydı yok.</p>
        )}
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Servet snapshot geçmişi</h2>
        <CfoTable
          head={<tr><Th>Tarih</Th><Th right>Net servet (TL)</Th><Th right>USD</Th><Th right>Geniş (USD)</Th><Th>Not</Th></tr>}
          empty={snapshots.length === 0 ? "Henüz snapshot alınmadı." : undefined}
        >
          {snapshots.map((s2) => (
            <tr key={s2.id}>
              <Td strong>{fmtDate(s2.takenAt)}</Td>
              <Td right>{fmtTry(num(s2.netWorthTry))}</Td>
              <Td right>{fmtUsd(num(s2.netWorthUsd))}</Td>
              <Td right>{s2.wideWorthUsd ? fmtUsd(num(s2.wideWorthUsd)) : "—"}</Td>
              <Td muted>{s2.note ?? "—"}</Td>
            </tr>
          ))}
        </CfoTable>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Değişim logu</h2>
        <CfoTable
          head={<tr><Th>Tarih</Th><Th>Alan</Th><Th>Kalem</Th><Th>Eski</Th><Th>Yeni</Th><Th>Kaynak</Th></tr>}
          empty={changes.length === 0 ? "Henüz değişiklik kaydı yok." : undefined}
        >
          {changes.map((c) => (
            <tr key={c.id}>
              <Td muted>{fmtDate(c.changedAt)}</Td>
              <Td muted>{c.area}</Td>
              <Td strong>{c.item}</Td>
              <Td muted>{c.oldValue ?? "—"}</Td>
              <Td strong>{c.newValue ?? "—"}</Td>
              <Td muted>{c.source ?? "—"}</Td>
            </tr>
          ))}
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Eski değerler silinmez — tarihsel gelişim buradan izlenir.</p>
      </Card>
    </>
  );
}

function P({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <tr>
      <Td strong>{label}</Td>
      <Td right>{value}</Td>
      <Td muted>{note}</Td>
    </tr>
  );
}
