/**
 * Phase 83 — Trendyol Satış Eşleştirme Yönetimi
 *
 * Admin page showing unmatched TrendyolSalesRecord rows grouped by
 * (merchantSku, barcode). One-click re-match button fixes ~621 rows
 * by SKU/barcode lookup. Remaining unmatched rows show with product-edit links.
 *
 * ADMIN-ONLY. No schema change.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession, isOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { RematchButton } from "./rematch-button";

export const dynamic = "force-dynamic";

type UnmatchedGroup = {
  merchantSku: string;
  barcode: string;
  sampleName: string;
  totalCnt: number;
  cnt30d: number;
};

export default async function TrendyolMatchingPage() {
  const user = await getCurrentSession();
  if (!user || (user.role !== "ADMIN" && !isOwner(user))) {
    redirect("/dashboard");
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const [totalRecords, matchedRecords] = await Promise.all([
    prisma.trendyolSalesRecord.count(),
    prisma.trendyolSalesRecord.count({ where: { productId: { not: null } } }),
  ]);
  const unmatchedRecords = totalRecords - matchedRecords;
  const matchRate = totalRecords > 0 ? Math.round((matchedRecords / totalRecords) * 100) : 0;

  // How many can be fixed automatically
  type FixableRow = { cnt: number };
  const fixableResult = await prisma.$queryRaw<FixableRow[]>`
    SELECT COUNT(*)::int AS cnt
    FROM "TrendyolSalesRecord" tsr
    WHERE tsr."productId" IS NULL
      AND EXISTS (
        SELECT 1 FROM "Product" p
        WHERE (p.sku IS NOT NULL AND LOWER(tsr."merchantSku") = LOWER(p.sku))
           OR (p.barcode IS NOT NULL AND LOWER(tsr."barcode") = LOWER(p.barcode))
      )
  `;
  const fixableCount = fixableResult[0]?.cnt ?? 0;

  // ── Unmatched groups ───────────────────────────────────────────────────────
  const unmatchedGroups = await prisma.$queryRaw<UnmatchedGroup[]>`
    SELECT
      tsr."merchantSku"                           AS "merchantSku",
      COALESCE(tsr."barcode", '')                 AS "barcode",
      MIN(tsr."productName")                      AS "sampleName",
      COUNT(*)::int                               AS "totalCnt",
      COUNT(
        CASE WHEN tsr."orderDate" >= NOW() - INTERVAL '30 days'
             THEN 1 END
      )::int                                      AS "cnt30d"
    FROM "TrendyolSalesRecord" tsr
    WHERE tsr."productId" IS NULL
    GROUP BY tsr."merchantSku", tsr."barcode"
    ORDER BY "totalCnt" DESC
    LIMIT 100
  `;

  const unmatchedGroupCount = unmatchedGroups.length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Trendyol</p>
        <h1 className="text-2xl font-bold text-slate-800">Satış Eşleştirme Yönetimi</h1>
        <p className="text-sm text-slate-500 mt-1">
          Eşleşmeyen Trendyol siparişlerini ürün kataloğuyla otomatik eşleştir.
          Eşleşme T30G satış hızını ve ithalat ROI hesaplamalarını etkiler.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Toplam Kayıt</p>
          <p className="text-2xl font-bold text-slate-800">{totalRecords.toLocaleString("tr-TR")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Eşleşen</p>
          <p className="text-2xl font-bold text-emerald-600">{matchedRecords.toLocaleString("tr-TR")}</p>
          <p className="text-xs text-slate-400">%{matchRate}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Eşleşmeyen</p>
          <p className="text-2xl font-bold text-red-500">{unmatchedRecords.toLocaleString("tr-TR")}</p>
          <p className="text-xs text-slate-400">{unmatchedGroupCount} farklı ürün</p>
        </Card>
        <Card className="p-4 border-emerald-200 bg-emerald-50">
          <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1">Otomatik Düzeltilebilir</p>
          <p className="text-2xl font-bold text-emerald-700">{fixableCount.toLocaleString("tr-TR")}</p>
          <p className="text-xs text-emerald-500">SKU / barkod eşleşmesi</p>
        </Card>
      </div>

      {/* Re-match action */}
      <Card className="p-5 border-emerald-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-800 mb-1">Otomatik Yeniden Eşleştir</h2>
            <p className="text-sm text-slate-500">
              Eşleşmeyen kayıtlar arasında mevcut ürün SKU veya barkod eşleşmesi bulunanları
              otomatik olarak günceller. Trendyol API çağrısı yapılmaz — sadece DB güncellenir.
            </p>
            <p className="text-xs text-amber-600 mt-2">
              ⚠ Bu işlem geri alınamaz. Yanlış eşleşme durumunda satış verileri etkilenebilir.
            </p>
          </div>
          <RematchButton fixableCount={fixableCount} />
        </div>
      </Card>

      {/* Unmatched groups table */}
      <Card className="p-5">
        <h2 className="font-semibold text-slate-800 mb-4">
          Eşleşmeyen Ürünler ({unmatchedGroupCount} grup)
        </h2>
        {unmatchedGroups.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            Tüm kayıtlar eşleştirilmiş ✓
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Ürün Adı
                  </th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Merchant SKU
                  </th>
                  <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Barkod
                  </th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Toplam
                  </th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Son 30G
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unmatchedGroups.map((g, i) => {
                  // Strip trailing product code from productName (often appended as "Name CODE, one size")
                  const cleanName = g.sampleName
                    .replace(/,\s*one size$/i, "")
                    .replace(/\s+\S{5,}$/, "")
                    .trim()
                    .slice(0, 60);

                  const searchHref = `/products?q=${encodeURIComponent(
                    g.merchantSku.replace(/[^a-zA-Z0-9\s-]/g, " ").trim().split(/\s+/)[0] ?? ""
                  )}`;

                  return (
                    <tr
                      key={i}
                      className={`hover:bg-slate-50 ${g.cnt30d > 0 ? "" : "opacity-60"}`}
                    >
                      <td className="px-3 py-2 max-w-xs">
                        <p className="text-xs text-slate-600 truncate" title={g.sampleName}>
                          {cleanName}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                          {g.merchantSku}
                        </code>
                      </td>
                      <td className="px-3 py-2">
                        {g.barcode ? (
                          <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                            {g.barcode}
                          </code>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">
                        {g.totalCnt}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {g.cnt30d > 0 ? (
                          <span className="font-mono text-xs font-semibold text-emerald-600">
                            {g.cnt30d}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={searchHref}
                          className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                          target="_blank"
                        >
                          Ürün Ara →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {unmatchedGroups.length >= 100 && (
              <p className="text-xs text-slate-400 text-center mt-3">
                İlk 100 grup gösteriliyor. Otomatik eşleştirme sonrası liste güncellenir.
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="text-xs text-slate-400 text-center">
        <Link href="/admin/trendyol-report" className="hover:underline">
          ← Trendyol Raporu
        </Link>
      </div>
    </div>
  );
}
