/** Faz 90 — CFO / Borçlar: banka+KMH, kredi kartları, krediler, sabit giderler. */
import { CreditCard } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadCfoData } from "@/lib/cfo/queries";
import { loadCashHorizons } from "@/lib/cfo/cash-path";
import { num, numOrNull, remainingInstallments } from "@/lib/cfo/engine";
import { cardEffectiveMonthlyRate } from "@/lib/cfo/card-cost";
import { isPersonalCard } from "@/lib/cfo/ownership";
import { nextScheduledPayment } from "@/lib/cfo/payment-schedule";
import { fmtTry, fmtPct, fmtDate, daysFromNow } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTagBadge, TrafficBadge } from "@/components/cfo/badges";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";
import { prisma } from "@/lib/prisma";
import { readOrderDebtGate } from "@/lib/cfo-agent/debt-policy";


const KIND_TR: Record<string, string> = {
  VERGI_GUMRUK: "Vergi / Gümrük",
  KREDI_TAKSITI: "Kredi taksiti",
  KART_ODEMESI: "Kart ödemesi",
  SABIT_GIDER: "Sabit gider",
  DIGER: "Diğer",
};

export const dynamic = "force-dynamic";

export default async function CfoDebtsPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const db = { query: <T extends Record<string, unknown>>(sql: string, ...params: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...params) };
  const [{ raw, overview: o }, sozlesme, gate, yol] = await Promise.all([
    loadCfoData(),
    // Finansal borcun tek tanımı (CFO-002): sira 1–3 bileşen, 90+ BİLGİ (toplama girmez), 100 toplam. Goal ve sipariş kapısı aynı sayıyı okur.
    prisma.$queryRaw<{ sira: number; tur: string; kalem: string; tutar: unknown; aciklama: string | null }[]>`select * from cfo_metrik_borc() order by sira`.catch(() => null),
    readOrderDebtGate(db, new Date()),
    loadCashHorizons(),
  ]);
  const toplamBorc = sozlesme?.find((r) => r.sira === 100);
  const toplamTry = toplamBorc?.tutar == null ? null : Number(toplamBorc.tutar);
  // Kart toplamı borç sözleşmesinden (cfo_metrik_borc sira 2: totalDebtTry, bilinmeyen toplama girmez; şahsi kart DAHİL — D-P03).
  // Şahsi kısım aynı kuralla (isPersonalCard = holder "Alp", sözleşmenin sira 92'si ile aynı) ayrıca gösterilir. Sözleşme okunamazsa eski motor.
  const kartSozlesme = sozlesme?.find((r) => r.sira === 2)?.tutar;
  const kartToplam = kartSozlesme == null ? o.cardDebtTry : Number(kartSozlesme);
  const kartSahsi = raw.cards.filter((c) => isPersonalCard(c.holder)).reduce((a, c) => a + (numOrNull(c.totalDebtTry) ?? 0), 0);
  const minPct = raw.settings ? num(raw.settings.cardMinPct) / 100 : 0.2;
  // Aktif kredilerin en geç biten taksit tarihi — "borçtan ne zaman çıkılır" sorusunun cevabı.
  // Planlanmış ödemeler: kredi/kart/sabit gider dışındaki tek seferlik taahhütler.
  const planned = raw.cashEvents
    .filter((e) => !e.isSettled && num(e.outflowTry) > 0 && (e.kind === "VERGI_GUMRUK" || e.kind === "DIGER"))
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  const plannedTotal = planned.reduce((a, e) => a + num(e.outflowTry), 0);

  // Ödeme durumu TEK kaynaktan: takvim (cfo_cash_event, taksit başına satır + isSettled). Defterdeki "currentMonthState"
  // ay dönümünde sıfırlanmıyordu (08.10: 11 kalemin 10'u geçen ayın "Ödendi"siyle) — burada gösterilmez (CFO-010).
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const scheduleCell = (nx: { date: Date; amountTry: number } | null) => nx == null
    ? <span className="text-[var(--danger)]">takvimde yok</span>
    : <>
        <span className="tabular-nums">{fmtDate(nx.date)} · {fmtTry(nx.amountTry)}</span>
        {nx.date.getTime() < todayMs && <span className="ml-1"><Badge variant="danger">gecikmiş</Badge></span>}
      </>;

  const lastLoanEnd = raw.loans
    .filter((l) => l.status === "AKTIF" && l.lastInstallmentDate)
    .map((l) => new Date(l.lastInstallmentDate as Date).getTime())
    .reduce<number | null>((a, b) => (a == null || b > a ? b : a), null);

  return (
    <>
      <PageHeader
        icon={CreditCard}
        title="Borçlar"
        subtitle="KMH, kredi kartı ve kredilerin tek listesi. Kapanan krediler borç servisine dahil edilmez."
      />

      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Finansal borç (tek tanım)</h2>
          {gate.limitTry != null && toplamTry != null && (
            <Badge variant={toplamTry < gate.limitTry ? "ok" : "danger"} className="ml-auto">
              hedef {gate.limitUsd != null ? `${gate.limitUsd.toLocaleString("tr-TR")} USD = ` : ""}{fmtTry(gate.limitTry)} · açık {fmtTry(Math.max(toplamTry - gate.limitTry, 0))}
            </Badge>
          )}
        </div>
        {sozlesme == null ? (
          <p className="text-[12px] text-[var(--danger)]">Borç sözleşmesi (cfo_metrik_borc) okunamadı — toplam BİLİNMİYOR.</p>
        ) : (
          <CfoTable head={<tr><Th>Kalem</Th><Th right>Tutar</Th><Th>Açıklama</Th></tr>}>
            {sozlesme.map((r) => (
              <tr key={r.sira} className={r.sira === 100 ? "bg-[var(--surface-1)] font-semibold" : r.sira >= 90 ? "text-[var(--text-muted)]" : undefined}>
                <Td strong={r.sira === 100}>{r.sira >= 90 && r.sira < 100 ? `Bilgi · ${r.kalem}` : r.kalem}</Td>
                <Td right strong={r.sira === 100}>{r.tutar == null ? "BİLİNMİYOR" : fmtTry(Number(r.tutar))}</Td>
                <Td muted>{r.aciklama ?? ""}</Td>
              </tr>
            ))}
          </CfoTable>
        )}
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          Kredi kalan anapara + kart toplam borcu + kullanılan KMH. Bilgi satırları toplama girmez. Goal Engine (borç hedefi) ve yeni sipariş kapısı aynı sayıyı kullanır.
          {!gate.open && ` Sipariş kapısı: ${gate.reason}.`}
        </p>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Bankalar / KMH</h2>
        <CfoTable head={
          <tr>
            <Th>Banka</Th><Th right>Bakiye</Th><Th right>KMH limiti</Th><Th right>Kullanılan</Th>
            <Th right>Boş limit</Th><Th right>Aylık faiz</Th><Th>Veri</Th><Th>Güncelleme</Th>
          </tr>
        }>
          {raw.banks.map((b) => {
            const bal = numOrNull(b.balanceTry);
            const used = bal != null && bal < 0 ? -bal : 0;
            const free = bal != null ? num(b.kmhLimitTry) - used : null;
            return (
              <tr key={b.id}>
                <Td strong>{b.name}</Td>
                <Td right danger={(bal ?? 0) < 0}>{bal == null ? "—" : fmtTry(bal)}</Td>
                <Td right>{fmtTry(num(b.kmhLimitTry))}</Td>
                <Td right>{bal == null ? "—" : fmtTry(used)}</Td>
                <Td right>{free == null ? "—" : fmtTry(free)}</Td>
                <Td right>{bal == null ? "—" : numOrNull(b.monthlyRatePct) == null || num(b.monthlyRatePct) <= 0 ? (used > 0 ? "oran yok" : "—") : fmtTry(used * (num(b.monthlyRatePct) / 100))}</Td>
                <Td><DataTagBadge tag={b.dataTag} /></Td>
                <Td muted>{fmtDate(b.lastUpdatedAt)}</Td>
              </tr>
            );
          })}
          <tr className="bg-[var(--surface-1)] font-semibold">
            <Td strong>TOPLAM (şirket)</Td>
            <Td right strong danger={o.netCashTry < 0}>{fmtTry(o.netCashTry)}</Td>
            <Td right strong>{fmtTry(o.totalKmhLimitTry)}</Td>
            <Td right strong>{fmtTry(o.usedKmhTry)}</Td>
            <Td right strong>{fmtTry(o.freeKmhTry)}</Td>
            <Td right strong>{fmtTry(o.kmhInterestMonthlyTry)}{o.kmhUsedWithoutRateTry > 0 ? " + ?" : ""}</Td>
            <Td>—</Td><Td>—</Td>
          </tr>
          {o.personal.accounts > 0 && (
            <tr className="text-[var(--text-muted)]">
              <Td>Şahsi hesaplar ({o.personal.accounts}) — toplama dahil değil, son çare kapasitesi</Td>
              <Td right>{fmtTry(o.personal.cashTry)}</Td>
              <Td right>{fmtTry(o.personal.kmhLimitTry)}</Td>
              <Td right>{fmtTry(o.personal.usedKmhTry)}</Td>
              <Td right>{fmtTry(o.personal.freeKmhTry)}</Td>
              <Td right>—</Td><Td>—</Td><Td>—</Td>
            </tr>
          )}
        </CfoTable>
        {o.kmhUsedWithoutRateTry > 0 && (
          <p className="mt-2 text-xs text-[var(--warn)]">
            Kullanılan KMH&apos;nin {fmtTry(o.kmhUsedWithoutRateTry)} kadarı oranı ölçülmemiş hesaplarda — faizi toplamda YOK (alt sınır). Ekstreden aylık oranı girin.
          </p>
        )}
        {o.banksMissingBalance > 0 && (
          <p className="mt-2 text-xs text-[var(--danger)]">
            {o.banksMissingBalance} hesabın bakiyesi bilinmiyor. Muhafazakâr davranıp boş limit toplamına DAHİL EDİLMEDİ.
          </p>
        )}
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Kredi kartları</h2>
        <CfoTable head={
          <tr>
            <Th>Kart</Th><Th right>Güncel borç</Th><Th right>Asgari</Th><Th>Kesim</Th><Th>Son ödeme</Th>
            <Th>Takvimde sonraki ödeme</Th><Th right>Aylık faiz (devreden)</Th><Th>Veri</Th>
          </tr>
        }>
          {raw.cards.map((c) => {
            const debt = numOrNull(c.totalDebtTry) ?? numOrNull(c.statementDebtTry);
            const min = numOrNull(c.minOverrideTry) ?? (debt != null ? Math.round(debt * minPct) : null);
            return (
              <tr key={c.id}>
                <Td strong>{c.bank}{c.holder ? ` — ${c.holder}` : ""}{isPersonalCard(c.holder) && <span className="ml-1"><Badge variant="neutral">şahsi</Badge></span>}</Td>
                <Td right>{debt == null ? "—" : fmtTry(debt)}</Td>
                <Td right>
                  {min == null ? "—" : fmtTry(min)}
                  {c.minOverrideTry == null && min != null && (
                    <span className="ml-1 text-[10px] text-[var(--warn)]">tahmini</span>
                  )}
                </Td>
                <Td muted>{c.statementDay ? `ayın ${c.statementDay}'i` : "—"}</Td>
                <Td muted>{c.dueDay ? `ayın ${c.dueDay}'i` : fmtDate(c.nextDueDate)}</Td>
                <Td>{debt === 0 ? "—" : scheduleCell(nextScheduledPayment(raw.cashEvents, { kind: "KART_ODEMESI", bank: c.bank }))}</Td>
                <Td right>{(() => {
                  // Faiz yalnız devreden bakiyeye, kartın kendi akdi oranı × (1 + KKDF + BSMV) ile (lib/cfo/card-cost.ts)
                  const rev = c.revolvingTry == null ? null : Number(c.revolvingTry);
                  const eff = cardEffectiveMonthlyRate(c.contractMonthlyRatePct == null ? null : Number(c.contractMonthlyRatePct));
                  if (debt == null || debt === 0) return "—";
                  if (rev == null) return <span className="text-[var(--text-muted)]">devreden girilmemiş</span>;
                  if (rev === 0) return fmtTry(0);
                  return eff == null ? <span className="text-[var(--text-muted)]">{fmtTry(rev)} devreden · oran yok</span> : `${fmtTry(rev * eff)} (%${(eff * 100).toFixed(2)})`;
                })()}</Td>
                <Td><DataTagBadge tag={c.dataTag} /></Td>
              </tr>
            );
          })}
          <tr className="bg-[var(--surface-1)] font-semibold">
            <Td strong>TOPLAM (şahsi kart dahil — borç sözleşmesi){kartSahsi > 0 && <span className="block text-[11px] font-normal text-[var(--text-muted)]">şahsi kısım {fmtTry(kartSahsi)} · şirket {fmtTry(kartToplam - kartSahsi)}</span>}</Td>
            <Td right strong>{fmtTry(kartToplam)}</Td>
            <Td right strong>{fmtTry(o.cardMinTotalTry)}</Td>
            <Td>—</Td><Td>—</Td><Td>—</Td>
            <Td right strong>{fmtTry(o.cardCarryCostTry)}</Td>
            <Td>—</Td>
          </tr>
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Asgari tutar %{(minPct * 100).toFixed(0)} varsayımıyla hesaplanır. Gerçek ekstre asgarisi girildiğinde varsayım devre dışı kalır.
          Faiz yalnız son ekstreden devreden bakiyeye işler; dönem içi harcama ve gelecek taksitler faizsizdir. Efektif oran = akdi faiz × (1 + KKDF %15 + BSMV %5) = akdi × 1,20.
          {o.cardsUnknownRevolving > 0 && ` ${o.cardsUnknownRevolving} kartta devreden bakiye girilmemiş — toplam faiz eksik.`}
          {o.cardRevolvingWithoutRateTry > 0 && ` ${fmtTry(o.cardRevolvingWithoutRateTry)} devreden bakiyenin akdi faizi girilmemiş.`}
        </p>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Krediler</h2>
        <CfoTable head={
          <tr>
            <Th>Kredi</Th><Th right>Aylık taksit</Th><Th right>Kalan taksit</Th><Th>Bitiş tarihi</Th>
            <Th right>Erken kapama</Th><Th right>Faiz</Th>
            <Th>Sonraki ödeme (defter)</Th><Th>Takvimde sonraki taksit</Th><Th>Öncelik</Th><Th>Durum</Th>
          </tr>
        }>
          {raw.loans.map((l) => {
            const left = remainingInstallments(l);
            const total = l.totalInstallments;
            return (
            <tr key={l.id} className={l.status !== "AKTIF" ? "opacity-60" : ""}>
              <Td strong>{l.bank} — {l.name}</Td>
              <Td right>{fmtTry(num(l.monthlyPaymentTry))}</Td>
              <Td right>
                {l.status !== "AKTIF" ? "—" : left == null ? (
                  <span className="text-[var(--danger)]">girilmeli</span>
                ) : (
                  <>
                    <span className="tabular-nums">{left}</span>
                    {total != null && <span className="text-[var(--text-muted)]"> / {total}</span>}
                  </>
                )}
              </Td>
              <Td muted>{l.status === "AKTIF" ? fmtDate(l.lastInstallmentDate) : "—"}</Td>
              <Td right>{fmtTry(num(l.earlyPayoffTry))}</Td>
              <Td right>
                {numOrNull(l.interestRatePct) == null
                  ? <span className="text-[var(--danger)]">girilmeli</span>
                  : `%${num(l.interestRatePct)}/yıl (aylık %${(num(l.interestRatePct) / 12).toFixed(2)})`}
              </Td>
              <Td muted>{l.status === "AKTIF" ? fmtDate(l.nextPaymentDate) : "—"}</Td>
              <Td>{l.status !== "AKTIF" ? "—" : scheduleCell(nextScheduledPayment(raw.cashEvents, { kind: "KREDI_TAKSITI", bank: l.bank, expectedTry: numOrNull(l.monthlyPaymentTry) }))}</Td>
              <Td muted>{l.priority ?? "—"}</Td>
              <Td><Badge variant={l.status === "AKTIF" ? "info" : "ok"}>{l.status === "AKTIF" ? "Aktif" : "Kapandı"}</Badge></Td>
            </tr>
            );
          })}
          <tr className="bg-[var(--surface-1)] font-semibold">
            <Td strong>TOPLAM (aktif)</Td>
            <Td right strong>{fmtTry(o.loanMonthlyServiceTry)}</Td>
            <Td right strong>—</Td>
            <Td muted>son: {lastLoanEnd == null ? "—" : fmtDate(new Date(lastLoanEnd))}</Td>
            <Td right strong>{fmtTry(o.loanEarlyPayoffTry)}</Td>
            <Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td>
          </tr>
        </CfoTable>
        {o.loansMissingRate > 0 && (
          <p className="mt-2 text-xs text-[var(--danger)]">
            {o.loansMissingRate} kredinin faiz oranı girilmemiş — erken kapamanın gerçek getirisi hesaplanamıyor.
          </p>
        )}
      </Card>

      {/* Planlanmış ödemeler — kredi/kart dışındaki taahhütler (navlun, gümrük, ithalat masrafı). */}
      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Planlanmış ödemeler</h2>
          <Badge variant={plannedTotal > 0 ? "warn" : "neutral"}>{fmtTry(plannedTotal)} toplam</Badge>
        </div>
        {planned.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Planlanmış ödeme yok.</p>
        ) : (
          <CfoTable head={
            <tr><Th>Tarih</Th><Th>Kalan</Th><Th>Tür</Th><Th>Açıklama</Th><Th right>Tutar</Th><Th>Veri</Th></tr>
          }>
            {planned.map((e) => {
              const d = daysFromNow(e.eventDate);
              return (
                <tr key={e.id}>
                  <Td strong>{fmtDate(e.eventDate)}</Td>
                  <Td muted>{d == null ? "—" : d <= 0 ? "bugün/geçti" : `${d} gün`}</Td>
                  <Td muted>{KIND_TR[e.kind] ?? e.kind}</Td>
                  <Td>{e.description}</Td>
                  <Td right danger>{fmtTry(num(e.outflowTry))}</Td>
                  <Td><DataTagBadge tag={e.certainty} /></Td>
                </tr>
              );
            })}
            <tr className="bg-[var(--surface-1)] font-semibold">
              <Td strong>TOPLAM</Td><Td>—</Td><Td>—</Td><Td>—</Td>
              <Td right strong danger>{fmtTry(plannedTotal)}</Td><Td>—</Td>
            </tr>
          </CfoTable>
        )}
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Bu liste kredi taksiti, kart ödemesi ve sabit giderleri KAPSAMAZ — onlar yukarıdaki tablolarda.
          Buradaki kalemler tek seferlik taahhütlerdir (navlun, gümrük vergisi, ithalat masrafı).
        </p>
      </Card>

      {/* Ay sonu nakit tahminleri — bankaların gördüğü bakiye ay sonu bakiyesidir. */}
      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">3 aylık ay sonu nakit tahmini</h2>
          <Badge variant="neutral">bugün: {fmtTry(o.netCashTry)}</Badge>
        </div>
        <CfoTable head={
          <tr>
            <Th>Ay sonu</Th><Th right>Gün</Th><Th right>Tahsilat</Th><Th right>Ödeme</Th>
            <Th right>Net</Th><Th right>Nakit pozisyonu</Th><Th right>Kalan KMH kapasitesi</Th><Th>Durum</Th>
          </tr>
        }>
          {yol.monthEnds.map((m) => (
            <tr key={m.label}>
              <Td strong>{m.label}</Td>
              <Td right muted>{m.days}</Td>
              <Td right>{fmtTry(m.inflow)}</Td>
              <Td right danger>{fmtTry(m.outflow)}</Td>
              <Td right danger={m.net < 0}>{fmtTry(m.net)}</Td>
              <Td right strong danger={m.position < 0}>{fmtTry(m.position)}</Td>
              <Td right danger={m.freeCapacityAfter < 0}>{fmtTry(m.freeCapacityAfter)}</Td>
              <Td><TrafficBadge value={m.traffic} /></Td>
            </tr>
          ))}
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Ay sonu bilerek seçildi: <strong>bankaların gördüğü bakiye ay sonu bakiyesidir</strong>, o yüzden ay sonlarında KMH kullanılmaz.
          Tahsilat = vadesi gelen alacaklar + haftalık satış tahmini; ödeme = takvimdeki tüm nakit çıkışları
          (sabit gider, kredi taksiti, kart ödemesi, gümrük, navlun). Nakit pozisyonu negatifse KMH’den karşılanır;
          “kalan KMH kapasitesi” o karşılamadan sonra elde ne kaldığını gösterir.
        </p>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Aylık sabit giderler</h2>
          <Badge variant="neutral">{fmtTry(o.fixedExpenseMonthlyTry)} / ay</Badge>
        </div>
        <CfoTable head={<tr><Th>Gider</Th><Th>Kategori</Th><Th right>Aylık</Th><Th>Ödeme günü</Th><Th>Durum</Th></tr>}>
          {raw.expenses.map((e) => (
            <tr key={e.id} className={e.isActive ? "" : "opacity-60"}>
              <Td strong>{e.name}</Td>
              <Td muted>{e.category ?? "—"}</Td>
              <Td right>{fmtTry(num(e.monthlyTry))}</Td>
              <Td muted>{e.paymentDay ? `ayın ${e.paymentDay}'i` : "girilmeli"}</Td>
              <Td><Badge variant={e.isActive ? "ok" : "neutral"}>{e.isActive ? "Aktif" : "Pasif"}</Badge></Td>
            </tr>
          ))}
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Kredi taksitleri ve kart ödemeleri bu listede YOKTUR — çift sayımı önlemek için ayrı tutulur.
          Yıllık: {fmtTry(o.fixedExpenseMonthlyTry * 12)}. Borç servis oranı: {fmtPct(o.debtServiceRatio)}
        </p>
      </Card>
    </>
  );
}
