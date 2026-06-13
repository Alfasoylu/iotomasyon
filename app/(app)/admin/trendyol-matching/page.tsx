/**
 * Phase 83/84 — Trendyol Satış Eşleştirme Yönetimi
 *
 * Admin page showing unmatched TrendyolSalesRecord rows grouped by
 * (merchantSku, barcode). One-click re-match button fixes rows by
 * SKU/barcode lookup. Remaining unmatched rows have an in-page
 * "Bağla →" button (Phase 84) to manually link to a product.
 *
 * ADMIN-ONLY. No schema change.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { getCurrentSession, isOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { RematchButton } from "./rematch-button";
import { LinkProductButton } from "./link-product-button";

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
           -- Step 3 (name-embedded stock code → Product.sku); see trendyol-rematch-action.ts
           OR (p.sku IS NOT NULL AND LOWER(p.sku) = LOWER(trim(substring(
                 regexp_replace(tsr."productName", ',[[:space:]]*one size[[:space:]]*$', '', 'i')
                 from '([^[:space:]]+)[[:space:]]*$'))))
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
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1">
          Trendyol
        </p>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Satış Eşleştirme Yönetimi
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Eşleşmeyen Trendyol siparişlerini ürün kataloğuyla otomatik eşleştir.
          Eşleşme T30G satış hızını ve ithalat ROI hesaplamalarını etkiler.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1">
            Toplam Kayıt
          </p>
          <p className="text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">
            {totalRecords.toLocaleString("tr-TR")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1">
            Eşleşen
          </p>
          <p className="text-2xl font-semibold tabular-nums font-mono text-[var(--ok)]">
            {matchedRecords.toLocaleString("tr-TR")}
          </p>
          <p className="text-xs text-[var(--text-muted)] tabular-nums">%{matchRate}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1">
            Eşleşmeyen
          </p>
          <p className="text-2xl font-semibold tabular-nums font-mono text-[var(--danger)]">
            {unmatchedRecords.toLocaleString("tr-TR")}
          </p>
          <p className="text-xs text-[var(--text-muted)] tabular-nums">
            {unmatchedGroupCount} farklı ürün
          </p>
        </Card>
        <Card className="p-4 border-[var(--ok-border)] bg-[var(--ok-dim)]">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--ok)] mb-1">
            Otomatik Düzeltilebilir
          </p>
          <p className="text-2xl font-semibold tabular-nums font-mono text-[var(--ok)]">
            {fixableCount.toLocaleString("tr-TR")}
          </p>
          <p className="text-xs text-[var(--ok)] opacity-70">SKU / barkod eşleşmesi</p>
        </Card>
      </div>

      {/* Re-match action */}
      <Card className="p-5 border-[var(--ok-border)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-[var(--text-primary)] mb-1">
              Otomatik Yeniden Eşleştir
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Eşleşmeyen kayıtlar arasında mevcut ürün SKU veya barkod eşleşmesi bulunanları
              otomatik olarak günceller. Trendyol API çağrısı yapılmaz — sadece DB güncellenir.
            </p>
            <p className="text-xs text-[var(--warn)] mt-2 inline-flex items-center gap-1.5">
              <AlertTriangle size={14} strokeWidth={1.5} />
              Bu işlem geri alınamaz. Yanlış eşleşme durumunda satış verileri etkilenebilir.
            </p>
          </div>
          <RematchButton fixableCount={fixableCount} />
        </div>
      </Card>

      {/* Unmatched groups table */}
      <Card className="p-5">
        <h2 className="font-semibold text-[var(--text-primary)] mb-4">
          Eşleşmeyen Ürünler ({unmatchedGroupCount} grup)
        </h2>
        {unmatchedGroups.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-6">
            Tüm kayıtlar eşleştirilmiş
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Ürün Adı
                  </th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Merchant SKU
                  </th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Barkod
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Toplam
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Son 30G
                  </th>
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
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
                      className={`hover:bg-[var(--surface-3)] ${g.cnt30d > 0 ? "" : "opacity-60"}`}
                    >
                      <td className="px-3 py-2 max-w-xs">
                        <p className="text-xs text-[var(--text-secondary)] truncate" title={g.sampleName}>
                          {cleanName}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <code className="text-xs bg-[var(--surface-3)] px-1.5 py-0.5 rounded text-[var(--text-secondary)] font-mono tabular-nums">
                          {g.merchantSku}
                        </code>
                      </td>
                      <td className="px-3 py-2">
                        {g.barcode ? (
                          <code className="text-xs bg-[var(--surface-3)] px-1.5 py-0.5 rounded text-[var(--text-muted)] font-mono tabular-nums">
                            {g.barcode}
                          </code>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-xs text-[var(--text-secondary)]">
                        {g.totalCnt}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {g.cnt30d > 0 ? (
                          <span className="font-mono tabular-nums text-xs font-semibold text-[var(--ok)]">
                            {g.cnt30d}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)] font-mono tabular-nums">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={searchHref}
                          className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:brightness-110 whitespace-nowrap"
                          target="_blank"
                        >
                          Ara <ArrowRight size={14} strokeWidth={1.5} />
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <LinkProductButton
                          merchantSku={g.merchantSku}
                          barcode={g.barcode}
                          sampleName={cleanName}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {unmatchedGroups.length >= 100 && (
              <p className="text-xs text-[var(--text-muted)] text-center mt-3">
                İlk 100 grup gösteriliyor. Otomatik eşleştirme sonrası liste güncellenir.
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="text-xs text-[var(--text-muted)] text-center">
        <Link href="/admin/trendyol-report" className="hover:text-[var(--text-primary)] transition-colors">
          ← Trendyol Raporu
        </Link>
      </div>
    </div>
  );
}
