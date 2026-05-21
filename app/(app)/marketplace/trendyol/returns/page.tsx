/**
 * Phase 16 — Trendyol Returns Action Center
 *
 * Enhanced returns view with approve and reject (create issue) capabilities.
 * Fetches claim issue reasons from Trendyol API for reject workflow.
 */

import Link from "next/link";
import { Settings, ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClaimActionPanel } from "@/components/trendyol/claim-action-panel";
import {
  fetchTrendyolReturns,
  fetchClaimIssueReasons,
  TrendyolApiError,
  type TrendyolReturn,
  type TrendyolClaimIssueReason,
} from "@/lib/trendyol-api";

export const dynamic = "force-dynamic";

const CLAIM_STATUS_TR: Record<string, string> = {
  WaitingForArrival: "Kargo bekleniyor",
  Arrived: "Ulaştı",
  Rejected: "Reddedildi",
  Refunded: "İade edildi",
  PendingApproval: "Onay bekleniyor",
  Accepted: "Kabul edildi",
  InAnalysis: "İnceleniyor",
  Resolved: "Çözüldü",
  Cancelled: "İptal",
  Created: "Oluşturuldu",
};

function StatusBadge({ status }: { status: string }) {
  const label = CLAIM_STATUS_TR[status] ?? status;
  const isGood = status === "Accepted" || status === "Refunded" || status === "Resolved";
  const isBad = status === "Rejected" || status === "Cancelled";
  const variant: "ok" | "danger" | "warn" = isGood ? "ok" : isBad ? "danger" : "warn";
  return <Badge variant={variant}>{label}</Badge>;
}

function isActionable(ret: TrendyolReturn): boolean {
  // Actionable = at least one item in PendingApproval, WaitingForArrival, or InAnalysis state
  return ret.items.some((item) =>
    item.claimItems.some((ci) =>
      ["PendingApproval", "WaitingForArrival", "InAnalysis", "Created"].includes(
        ci.claimItemStatus.name,
      ),
    ),
  );
}

export default async function TrendyolReturnsPage() {
  await requirePermission(PERMISSIONS.MARKETPLACE_RETURNS_READ);

  const config = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
  const notConfigured = !config || !config.isEnabled || !config.supplierId || !config.apiKey || !config.apiSecret;

  let returns: TrendyolReturn[] = [];
  let totalElements = 0;
  let issueReasons: TrendyolClaimIssueReason[] = [];
  let apiError: string | null = null;

  if (!notConfigured) {
    const cfg = { supplierId: config.supplierId, apiKey: config.apiKey, apiSecret: config.apiSecret };
    try {
      const [returnsResp, reasonsResp] = await Promise.allSettled([
        fetchTrendyolReturns(cfg, { size: 50 }),
        fetchClaimIssueReasons(cfg),
      ]);

      if (returnsResp.status === "fulfilled") {
        returns = Array.isArray(returnsResp.value?.content) ? returnsResp.value.content : [];
        totalElements = returnsResp.value?.totalElements ?? 0;
      } else {
        throw returnsResp.reason;
      }

      if (reasonsResp.status === "fulfilled") {
        issueReasons = Array.isArray(reasonsResp.value) ? reasonsResp.value : [];
      }
      // issueReasons failure is non-fatal — reject UI still works, just without reason list
    } catch (err) {
      apiError = err instanceof TrendyolApiError
        ? `Trendyol API hatası (${err.status}): ${err.body.slice(0, 120)}`
        : `Bağlantı hatası: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`;
    }
  }

  const actionableReturns = returns.filter(isActionable);
  const otherReturns = returns.filter((r) => !isActionable(r));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Pazar Yerleri / Trendyol / İadeler
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            İade İşlem Merkezi
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Trendyol iade taleplerini onaylayın veya itiraz edin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketplace/trendyol">
            <Button variant="secondary">
              <ArrowLeft size={14} strokeWidth={1.5} className="mr-1" />
              Trendyol Paneli
            </Button>
          </Link>
        </div>
      </div>

      {/* Not-configured state */}
      {notConfigured && (
        <Card className="p-10 text-center space-y-4 rounded-lg">
          <p className="text-[var(--text-secondary)] text-sm font-medium">Trendyol API yapılandırılmamış veya pasif.</p>
          <Link href="/admin/trendyol">
            <Button className="mt-2">
              <Settings size={14} strokeWidth={1.5} className="mr-1" />
              API Ayarlarına git
            </Button>
          </Link>
        </Card>
      )}

      {/* API error state */}
      {!notConfigured && apiError && (
        <Card className="p-6 rounded-lg border-[var(--danger-border)] bg-[var(--danger-dim)]">
          <p className="text-sm font-semibold text-[var(--danger)]">API bağlantısı başarısız</p>
          <p className="mt-1 text-xs text-[var(--danger)]">{apiError}</p>
        </Card>
      )}

      {/* Returns */}
      {!notConfigured && !apiError && (
        <>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
            <Card className="p-4 rounded-lg">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Toplam İade</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">{totalElements}</p>
            </Card>
            <Card className="p-4 rounded-lg">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İşlem Bekleyen</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--warn)]">{actionableReturns.length}</p>
            </Card>
            <Card className="p-4 rounded-lg">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Tamamlanan</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--text-secondary)]">{otherReturns.length}</p>
            </Card>
          </div>

          {/* Actionable claims first */}
          {actionableReturns.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[var(--warn)]"></span>
                İşlem Bekleyen İadeler ({actionableReturns.length})
              </h2>
              {actionableReturns.map((ret) => (
                <ReturnCard key={ret.claimId} ret={ret} issueReasons={issueReasons} showActions />
              ))}
            </section>
          )}

          {/* Other / completed claims */}
          {otherReturns.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                Diğer İadeler ({otherReturns.length})
              </h2>
              {otherReturns.map((ret) => (
                <ReturnCard key={ret.claimId} ret={ret} issueReasons={issueReasons} showActions={false} />
              ))}
            </section>
          )}

          {returns.length === 0 && (
            <Card className="p-10 text-center rounded-lg">
              <p className="text-[var(--text-muted)] text-sm">Son 30 günde iade bulunamadı.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ReturnCard({
  ret,
  issueReasons,
  showActions,
}: {
  ret: TrendyolReturn;
  issueReasons: TrendyolClaimIssueReason[];
  showActions: boolean;
}) {
  function fmtDate(epochMs: number | null | undefined) {
    if (!epochMs) return "—";
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    }).format(new Date(epochMs));
  }

  // Build line items for action panel
  const lineItems = ret.items.flatMap((item) =>
    item.claimItems.map((ci) => ({
      claimItemId: ci.id,
      orderLineId: item.orderLine.id,
      productName: item.orderLine.productName,
    })),
  );

  const firstStatus = ret.items?.[0]?.claimItems?.[0]?.claimItemStatus?.name ?? "";
  const productNames = ret.items.map((i) => i.orderLine?.productName ?? "").filter(Boolean);
  const firstReason = ret.items?.[0]?.claimItems?.[0]?.customerClaimItemReason?.name ?? "";

  return (
    <Card className="p-5 space-y-4 rounded-lg">
      {/* Claim header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            {firstStatus && <StatusBadge status={firstStatus} />}
            <span className="font-mono text-xs text-[var(--text-muted)]">{ret.claimId}</span>
            <span className="text-xs text-[var(--text-muted)]">Sipariş: {ret.orderNumber ?? "—"}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {ret.customerFirstName} {ret.customerLastName} · <span className="tabular-nums font-mono">{fmtDate(ret.claimDate)}</span>
          </p>
        </div>
      </div>

      {/* Products */}
      <div className="space-y-1">
        {productNames.map((name, i) => (
          <p key={i} className="text-sm text-[var(--text-secondary)]">{name}</p>
        ))}
        {firstReason && (
          <p className="text-xs text-[var(--text-muted)]">Neden: {firstReason}</p>
        )}
      </div>

      {/* Claim items detail */}
      <div className="space-y-1">
        {ret.items.flatMap((item) =>
          item.claimItems.map((ci) => (
            <div key={ci.id} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <StatusBadge status={ci.claimItemStatus.name} />
              <span className="font-mono text-[10px]">#{ci.id.slice(-8)}</span>
              {ci.note && <span className="text-[var(--text-muted)] truncate">· {ci.note}</span>}
            </div>
          )),
        )}
      </div>

      {/* Action panel */}
      {showActions && lineItems.length > 0 && (
        <ClaimActionPanel
          claimId={ret.claimId}
          lineItems={lineItems}
          issueReasons={issueReasons}
        />
      )}
    </Card>
  );
}
