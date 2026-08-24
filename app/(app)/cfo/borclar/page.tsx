/** Faz 90 — CFO / Borçlar: banka+KMH, kredi kartları, krediler, sabit giderler. */
import { CreditCard } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadCfoData } from "@/lib/cfo/queries";
import { num, numOrNull, remainingInstallments } from "@/lib/cfo/engine";
import { fmtTry, fmtPct, fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTagBadge, PaymentStateBadge } from "@/components/cfo/badges";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

export default async function CfoDebtsPage() {
  await requirePermission(PERMISSIONS.CFO_READ);
  const { raw, overview: o } = await loadCfoData();
  const minPct = raw.settings ? num(raw.settings.cardMinPct) / 100 : 0.2;
  // Aktif kredilerin en geç biten taksit tarihi — "borçtan ne zaman çıkılır" sorusunun cevabı.
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
                <Td right>{bal == null ? "—" : fmtTry(used * (o.monthlyRatePct / 100))}</Td>
                <Td><DataTagBadge tag={b.dataTag} /></Td>
                <Td muted>{fmtDate(b.lastUpdatedAt)}</Td>
              </tr>
            );
          })}
          <tr className="bg-[var(--surface-1)] font-semibold">
            <Td strong>TOPLAM</Td>
            <Td right strong danger={o.netCashTry < 0}>{fmtTry(o.netCashTry)}</Td>
            <Td right strong>{fmtTry(o.totalKmhLimitTry)}</Td>
            <Td right strong>{fmtTry(o.usedKmhTry)}</Td>
            <Td right strong>{fmtTry(o.freeKmhTry)}</Td>
            <Td right strong>{fmtTry(o.kmhInterestMonthlyTry)}</Td>
            <Td>—</Td><Td>—</Td>
          </tr>
        </CfoTable>
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
            <Th>Bu ay</Th><Th right>Aylık taşıma</Th><Th>Veri</Th>
          </tr>
        }>
          {raw.cards.map((c) => {
            const debt = numOrNull(c.totalDebtTry) ?? numOrNull(c.statementDebtTry);
            const min = numOrNull(c.minOverrideTry) ?? (debt != null ? Math.round(debt * minPct) : null);
            return (
              <tr key={c.id}>
                <Td strong>{c.bank}{c.holder ? ` — ${c.holder}` : ""}</Td>
                <Td right>{debt == null ? "—" : fmtTry(debt)}</Td>
                <Td right>
                  {min == null ? "—" : fmtTry(min)}
                  {c.minOverrideTry == null && min != null && (
                    <span className="ml-1 text-[10px] text-[var(--warn)]">tahmini</span>
                  )}
                </Td>
                <Td muted>{c.statementDay ? `ayın ${c.statementDay}'i` : "—"}</Td>
                <Td muted>{c.dueDay ? `ayın ${c.dueDay}'i` : fmtDate(c.nextDueDate)}</Td>
                <Td><PaymentStateBadge state={c.currentMonthState} /></Td>
                <Td right>{debt == null ? "—" : fmtTry(debt * (o.monthlyRatePct / 100))}</Td>
                <Td><DataTagBadge tag={c.dataTag} /></Td>
              </tr>
            );
          })}
          <tr className="bg-[var(--surface-1)] font-semibold">
            <Td strong>TOPLAM</Td>
            <Td right strong>{fmtTry(o.cardDebtTry)}</Td>
            <Td right strong>{fmtTry(o.cardMinTotalTry)}</Td>
            <Td>—</Td><Td>—</Td><Td>—</Td>
            <Td right strong>{fmtTry(o.cardCarryCostTry)}</Td>
            <Td>—</Td>
          </tr>
        </CfoTable>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Asgari tutar %{(minPct * 100).toFixed(0)} varsayımıyla hesaplanır. Gerçek ekstre asgarisi girildiğinde varsayım devre dışı kalır.
        </p>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Krediler</h2>
        <CfoTable head={
          <tr>
            <Th>Kredi</Th><Th right>Aylık taksit</Th><Th right>Kalan taksit</Th><Th>Bitiş tarihi</Th>
            <Th right>Erken kapama</Th><Th right>Faiz</Th>
            <Th>Sonraki ödeme</Th><Th>Bu ay</Th><Th>Öncelik</Th><Th>Durum</Th>
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
                  : `%${num(l.interestRatePct)}/ay`}
              </Td>
              <Td muted>{l.status === "AKTIF" ? fmtDate(l.nextPaymentDate) : "—"}</Td>
              <Td><PaymentStateBadge state={l.currentMonthState} /></Td>
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
