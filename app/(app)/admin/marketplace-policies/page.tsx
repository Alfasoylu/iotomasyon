/**
 * Phase 30 — Marketplace Platform Policy Management
 *
 * Admin page to configure per-platform standard shipping cost,
 * commission rate, VAT, payment fee, and return reserve.
 *
 * Resolution order (highest priority first):
 *   1. product.shippingCostOverride / marketplaceCommissionOverride
 *   2. product.shippingCost         / marketplaceCommission
 *   3. MarketplacePlatformPolicy    (this page)
 *   4. system default (shipping=0, commission=20%)
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformPolicyForm } from "@/components/marketplace/platform-policy-form";
import { MarketplacePlatform } from "@prisma/client";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL:    "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11:         "N11",
  PTTAVM:      "PTT AVM",
  KOCTAS:      "Koçtaş",
  TEKNOSA:     "Teknosa",
  TEMU:        "Temu",
  CUSTOM:      "Diğer",
};

const ALL_PLATFORMS = Object.values(MarketplacePlatform);

function toNum(v: { toNumber(): number } | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  return v.toNumber();
}

export default async function MarketplacePoliciesPage() {
  await requirePermission(PERMISSIONS.MARKETPLACE_POLICIES_MANAGE);

  const policies = await prisma.marketplacePlatformPolicy.findMany();

  const policyMap = Object.fromEntries(
    policies.map((p) => [
      p.platform,
      {
        standardShippingTry:   toNum(p.standardShippingTry),
        standardCommissionPct: toNum(p.standardCommissionPct),
        paymentFeePct:         toNum(p.paymentFeePct),
        returnReservePct:      toNum(p.returnReservePct),
        vatPct:                toNum(p.vatPct),
        notes:                 p.notes,
      },
    ]),
  );

  const configuredCount = policies.length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Yönetim / Pazar Yeri
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Platform Marj Politikaları
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Her platform için standart kargo maliyeti ve komisyon oranını tanımlayın.
            Ürün düzeyinde geçersiz kılma değerleri bu standartları ezer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketplace/profit">
            <Button variant="secondary">Kâr Paneli →</Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Toplam Platform
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{ALL_PLATFORMS.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Yapılandırıldı
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{configuredCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Yapılandırılmadı
          </p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">
            {ALL_PLATFORMS.length - configuredCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Sistem Varsayılanı
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            Kargo: ₺0 · Komisyon: %20
          </p>
        </Card>
      </div>

      {/* Resolution order explanation */}
      <Card className="p-5 bg-blue-50/50 border-blue-100">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">
          Değer Çözümleme Sırası
        </h2>
        <ol className="space-y-1 text-xs text-slate-600">
          <li>
            <span className="inline-block rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-medium mr-2">1. Ürün Geçersiz Kılma</span>
            Ürün formundaki &quot;Kargo Geçersiz Kılma&quot; / &quot;Komisyon Geçersiz Kılma&quot; alanları — en yüksek öncelik
          </li>
          <li>
            <span className="inline-block rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 font-medium mr-2">2. Ürün Değeri</span>
            Ürün formundaki standart kargo / komisyon alanları
          </li>
          <li>
            <span className="inline-block rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 font-medium mr-2">3. Platform Standardı</span>
            Aşağıdaki bu sayfa — platform bazında varsayılan değerler
          </li>
          <li>
            <span className="inline-block rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-medium mr-2">4. Sistem Varsayılanı</span>
            Kargo ₺0 · Komisyon %20 — hiçbir değer tanımlanmamışsa
          </li>
        </ol>
      </Card>

      {/* Platform forms */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Platform Ayarları</h2>
        {ALL_PLATFORMS.map((platform) => (
          <PlatformPolicyForm
            key={platform}
            platform={platform}
            platformLabel={PLATFORM_LABELS[platform] ?? platform}
            current={policyMap[platform] ?? null}
          />
        ))}
      </div>
    </div>
  );
}
