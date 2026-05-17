/**
 * Phase 16 — Monthly Exchange Rate Management
 *
 * Admin page for managing historical USD/TRY rates used in per-order
 * profit calculations for import-priced products.
 */

import Link from "next/link";
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Yönetim / Döviz Kurları
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Aylık Döviz Kurları
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            İthalat maliyeti hesaplamasında kullanılan aylık USD/TRY ve RMB/USD kurlarını yönetin.
          </p>
        </div>
        <Link href="/admin">
          <Button variant="secondary">← Admin Panel</Button>
        </Link>
      </div>

      {/* Add / edit form */}
      <Card className="p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Kur Ekle / Güncelle</h2>
        <p className="text-xs text-slate-500">
          Aynı yıl–ay kombinasyonu için kayıt varsa mevcut değer güncellenir.
        </p>
        <ExchangeRateForm />
      </Card>

      {/* Rate list */}
      {rates.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-slate-400 text-sm">Henüz kur kaydı bulunmuyor.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-700 border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Dönem</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">USD/TRY</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">RMB/USD</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Not</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Güncellendi</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {MONTHS[r.month] ?? r.month} {r.year}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                      {Number(r.usdTryRate).toFixed(4)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {r.rmbUsdRate != null ? Number(r.rmbUsdRate).toFixed(4) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {r.note ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">
                      {new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(r.updatedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-4 border-blue-100 bg-blue-50">
        <p className="text-xs font-semibold text-blue-700">Nasıl kullanılır?</p>
        <ul className="mt-2 text-xs text-blue-600 space-y-1 list-disc list-inside">
          <li><strong>USD/TRY:</strong> Her ay için TCMB ortalama kurunu girin. İthalat maliyetini TRY&apos;ye çevirmek için kullanılır.</li>
          <li><strong>RMB/USD:</strong> Çin&apos;den RMB cinsinden alım yapılan aylar için girin (ör. 7.25 = 1 USD = 7.25 RMB). İthalat karar motorunda RMB-öncelikli formül için gereklidir.</li>
          <li>Kur bulunamazsa sistem fallback olarak en son girilen kuru kullanır.</li>
        </ul>
      </Card>
    </div>
  );
}
