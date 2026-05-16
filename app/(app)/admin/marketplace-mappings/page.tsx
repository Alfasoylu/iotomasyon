/**
 * Phase 16 — Marketplace Product Mapping Management
 *
 * Manage many-to-one mappings: multiple platform identities → one internal product.
 * Supports Trendyol and all other MarketplacePlatform values.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MappingForm, DeleteMappingButton } from "@/components/marketplace/mapping-form";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL: "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11: "N11",
  PTTAVM: "PttAVM",
  KOCTAS: "Koçtaş",
  TEKNOSA: "Teknosa",
  TEMU: "Temu",
  CUSTOM: "Diğer",
};

export default async function MarketplaceMappingsPage() {
  await requirePermission(PERMISSIONS.MARKETPLACE_MAPPINGS_READ);

  const [mappings, products] = await Promise.all([
    prisma.marketplaceProductMapping.findMany({
      include: {
        product: { select: { id: true, name: true, sku: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      select: { id: true, name: true, sku: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Yönetim / Ürün Eşleştirme
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Pazar Yeri Ürün Eşleştirme
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Platform kimliklerini (barkod, SKU, listeleme ID) iç ürünlere bağlayın.
          </p>
        </div>
        <Link href="/admin">
          <Button variant="secondary">← Admin Panel</Button>
        </Link>
      </div>

      {/* Add form */}
      <Card className="p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Yeni Eşleştirme Ekle</h2>
        <MappingForm products={products} />
      </Card>

      {/* Mappings list */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">
          Mevcut Eşleştirmeler ({mappings.length})
        </h2>
        {mappings.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-slate-400 text-sm">Henüz eşleştirme eklenmedi.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İç Ürün</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Barkod</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">SKU</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Listeleme ID</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform Başlığı</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Güven</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ekleyen</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
                          {PLATFORM_LABELS[m.platform] ?? m.platform}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/products/${m.product.id}`}
                          className="text-xs font-medium text-slate-800 hover:text-slate-950 underline decoration-dotted"
                        >
                          {m.product.name}
                        </Link>
                        {m.product.sku && (
                          <span className="block font-mono text-[10px] text-slate-400">{m.product.sku}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{m.platformBarcode ?? "—"}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{m.platformSku ?? "—"}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{m.platformListingId ?? "—"}</td>
                      <td className="py-3 px-4 text-xs text-slate-500 max-w-[180px] truncate">{m.platformTitle ?? "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.confidence === "MANUAL" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                          {m.confidence}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">{m.createdBy?.name ?? "—"}</td>
                      <td className="py-3 px-4">
                        <DeleteMappingButton id={m.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
