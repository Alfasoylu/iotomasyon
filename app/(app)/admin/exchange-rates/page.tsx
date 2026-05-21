/**
 * Phase 16 — Monthly Exchange Rate Management
 *
 * Admin page for managing historical USD/TRY rates used in per-order
 * profit calculations for import-priced products.
 */

import Link from "next/link";
import { Info } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExchangeRateForm } from "@/components/marketplace/exchange-rate-form";

export const dynamic = "force-dynamic";

const MONTHS = [
  "", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export default async function ExchangeRatesPage() {
  await requirePermission(PERMISSIONS.EXCHANGE_RATES_MANAGE);

  const rates = await prisma.monthlyExchangeRate.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yönetim / Döviz Kurları
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Aylık Döviz Kurları
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            İthalat maliyeti hesaplamasında kullanılan aylık USD/TRY ve RMB/USD kurlarını yönetin.
          </p>
        </div>
        <Link href="/admin">
          <Button variant="secondary">← Admin Panel</Button>
        </Link>
      </div>

      {/* Add / edit form */}
      <Card className="p-6 space-y-4 rounded-lg">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Kur Ekle / Güncelle
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Aynı yıl–ay kombinasyonu için kayıt varsa mevcut değer güncellenir.
          </p>
        </div>
        <ExchangeRateForm />
      </Card>

      {/* Rate list */}
      {rates.length === 0 ? (
        <Card className="p-10 text-center rounded-lg">
          <p className="text-sm text-[var(--text-muted)]">Henüz kur kaydı bulunmuyor.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                  <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Dönem</th>
                  <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">USD/TRY</th>
                  <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">RMB/USD</th>
                  <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Not</th>
                  <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Güncellendi</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-1)]">
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {MONTHS[r.month] ?? r.month} {r.year}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-mono font-semibold text-[var(--text-primary)]">
                      {Number(r.usdTryRate).toFixed(4)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-mono text-[var(--text-secondary)]">
                      {r.rmbUsdRate != null ? Number(r.rmbUsdRate).toFixed(4) : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                      {r.note ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-xs tabular-nums font-mono text-[var(--text-muted)]">
                      {new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(r.updatedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-4 rounded-lg border-[var(--info-border)] bg-[var(--info-dim)]">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-[var(--info)]">
          <Info size={14} strokeWidth={1.5} />
          Nasıl kullanılır?
        </p>
        <ul className="mt-2 text-xs text-[var(--text-secondary)] space-y-1 list-disc list-inside">
          <li><strong>USD/TRY:</strong> Her ay için TCMB ortalama kurunu girin. İthalat maliyetini TRY&apos;ye çevirmek için kullanılır.</li>
          <li><strong>RMB/USD:</strong> Çin&apos;den RMB cinsinden alım yapılan aylar için girin (ör. 7.25 = 1 USD = 7.25 RMB). İthalat karar motorunda RMB-öncelikli formül için gereklidir.</li>
          <li>Kur bulunamazsa sistem fallback olarak en son girilen kuru kullanır.</li>
        </ul>
      </Card>
    </div>
  );
}
