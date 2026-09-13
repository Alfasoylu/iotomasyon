/**
 * Faz 91 — Sipariş bazında Trendyol maliyeti
 *
 * Kesinti detay dosyaları sipariş numarası taşıyor; hakediş dosyaları da öyle.
 * Bu ekran ikisini sipariş üzerinden birleştirir: bir siparişten bize ne kaldı
 * ve Trendyol o siparişte kargo/işlem/ceza olarak ne kesti.
 *
 * Not: komisyon fatura başlığında toplu kesildiği için sipariş bazına yalnız
 * hakediş dosyası yüklendiğinde ("Trendyol Hakediş" sütunu) düşer.
 */

import Link from "next/link";
import { Package, Search } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { loadOrderCosts } from "@/lib/trendyol-finance/queries";
import { fmtTry2, fmtNum, fmtDate } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CfoTable, Th, Td } from "@/components/cfo/data-table";

export const dynamic = "force-dynamic";

export default async function TrendyolSiparisMaliyetPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; take?: string }>;
}) {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const take = Math.min(500, Math.max(25, Number(sp.take ?? 100)));

  const rows = await loadOrderCosts({ q, take });

  const totalCost = rows.reduce((s, r) => s + r.totalCostTry, 0);
  const withSettlement = rows.filter((r) => r.sellerShareTry != null);

  return (
    <>
      <PageHeader
        icon={Package}
        breadcrumb={[
          { label: "Pazaryerleri", href: "/marketplace" },
          { label: "Trendyol Finans", href: "/marketplace/trendyol/finans" },
          { label: "Sipariş maliyetleri" },
        ]}
        title="Sipariş bazında maliyet"
        subtitle="Kargo, işlem bedeli ve cezaların sipariş kırılımı — en pahalıya mal olan siparişler üstte."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{fmtNum(rows.length)} sipariş listeleniyor</Badge>
            <Badge variant="danger">Kesinti {fmtTry2(totalCost)}</Badge>
            {withSettlement.length > 0 ? (
              <Badge variant="ok">{fmtNum(withSettlement.length)} siparişte hakediş eşleşti</Badge>
            ) : null}
          </div>
        }
      />

      <Card className="p-4">
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Sipariş no</span>
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Örn. 11562867240"
              className="h-9 w-full min-w-[12rem] rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-2.5 text-[13px] text-[var(--text-primary)]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Kayıt</span>
            <select
              name="take"
              defaultValue={String(take)}
              className="h-9 rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-2.5 text-[13px] text-[var(--text-primary)]"
            >
              {[50, 100, 250, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 text-[13px] font-medium text-[var(--accent-fg)] hover:brightness-110"
          >
            <Search size={13} /> Ara
          </button>

          {q ? (
            <Link
              href="/marketplace/trendyol/finans/siparisler"
              className="inline-flex h-9 items-center rounded-md px-3 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Temizle
            </Link>
          ) : null}
        </form>
      </Card>

      <Card className="mt-4 p-0">
        <CfoTable
          head={
            <tr>
              <Th>Sipariş no</Th>
              <Th>Son hareket</Th>
              <Th right>Kargo</Th>
              <Th right>İşlem/hizmet</Th>
              <Th right>Ceza</Th>
              <Th right>Diğer</Th>
              <Th right>Toplam kesinti</Th>
              <Th right>Komisyon</Th>
              <Th right>Satıcı hakediş</Th>
            </tr>
          }
          empty={
            rows.length === 0
              ? "Kesinti detay dosyası yüklenmemiş ya da bu aramaya uyan sipariş yok."
              : undefined
          }
        >
          {rows.map((r) => (
            <tr key={r.orderNumber} className="hover:bg-[var(--surface-3)]">
              <Td strong>
                <span className="font-mono text-[12px]">{r.orderNumber}</span>
                <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">
                  {r.lineCount} satır
                </span>
              </Td>
              <Td muted>{fmtDate(r.lastDate)}</Td>
              <Td right muted={r.cargoTry === 0}>
                {r.cargoTry ? fmtTry2(r.cargoTry) : "—"}
              </Td>
              <Td right muted={r.serviceTry === 0}>
                {r.serviceTry ? fmtTry2(r.serviceTry) : "—"}
              </Td>
              <Td right danger={r.penaltyTry > 0} muted={r.penaltyTry === 0}>
                {r.penaltyTry ? fmtTry2(r.penaltyTry) : "—"}
              </Td>
              <Td right muted={r.otherTry === 0}>
                {r.otherTry ? fmtTry2(r.otherTry) : "—"}
              </Td>
              <Td right strong>
                {fmtTry2(r.totalCostTry)}
              </Td>
              <Td right muted>
                {r.commissionTry != null ? fmtTry2(r.commissionTry) : "—"}
              </Td>
              <Td right>{r.sellerShareTry != null ? fmtTry2(r.sellerShareTry) : "—"}</Td>
            </tr>
          ))}
        </CfoTable>
      </Card>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Komisyon ve satıcı hakediş sütunları yalnız ilgili dönemin hakediş dosyası
        (SaticiFatura_&lt;no&gt;_*.xlsx) yüklendiğinde dolar.
      </p>
    </>
  );
}
