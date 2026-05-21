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
        shippingTiersJson:     p.shippingTiersJson,
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
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yönetim / Pazar Yeri
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Platform Marj Politikaları
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
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
        <Card className="p-4 rounded-lg">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Toplam Platform
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">{ALL_PLATFORMS.length}</p>
        </Card>
        <Card className="p-4 rounded-lg">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yapılandırıldı
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--ok)]">{configuredCount}</p>
        </Card>
        <Card className="p-4 rounded-lg">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yapılandırılmadı
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--warn)]">
            {ALL_PLATFORMS.length - configuredCount}
          </p>
        </Card>
        <Card className="p-4 rounded-lg">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Sistem Varsayılanı
          </p>
          <p className="mt-2 text-sm font-semibold tabular-nums font-mono text-[var(--text-secondary)]">
            Kargo: ₺0 · Komisyon: %20
          </p>
        </Card>
      </div>

      {/* Resolution order explanation */}
      <Card className="p-5 rounded-lg border-[var(--info-border)] bg-[var(--info-dim)]">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--info)] mb-3">
          Değer Çözümleme Sırası
        </h2>
        <ol className="space-y-1.5 text-xs text-[var(--text-secondary)]">
          <li>
            <span className="inline-block rounded-md border border-[var(--info-border)] bg-[var(--info-dim)] px-2 py-0.5 font-medium text-[var(--info)] mr-2 tabular-nums font-mono">1. Ürün Geçersiz Kılma</span>
            Ürün formundaki &quot;Kargo Geçersiz Kılma&quot; / &quot;Komisyon Geçersiz Kılma&quot; alanları — en yüksek öncelik
          </li>
          <li>
            <span className="inline-block rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 py-0.5 font-medium text-[var(--text-secondary)] mr-2 tabular-nums font-mono">2. Ürün Değeri</span>
            Ürün formundaki standart kargo / komisyon alanları
          </li>
          <li>
            <span className="inline-block rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] px-2 py-0.5 font-medium text-[var(--ok)] mr-2 tabular-nums font-mono">3. Platform Standardı</span>
            Aşağıdaki bu sayfa — platform bazında varsayılan değerler
          </li>
          <li>
            <span className="inline-block rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-2 py-0.5 font-medium text-[var(--warn)] mr-2 tabular-nums font-mono">4. Sistem Varsayılanı</span>
            Kargo ₺0 · Komisyon %20 — hiçbir değer tanımlanmamışsa
          </li>
        </ol>
      </Card>

      {/* Platform forms */}
      <div className="space-y-4">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">Platform Ayarları</h2>
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
