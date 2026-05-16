/**
 * Phase 16 — Trendyol Returns Action Center
 *
 * Enhanced returns view with approve and reject (create issue) capabilities.
 * Fetches claim issue reasons from Trendyol API for reject workflow.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClaimActionPanel } from "@/components/trendyol/claim-action-panel";
import {
  fetchTrendyolReturns,
  fetchClaimIssueReasons,
  TrendyolApiError,
  type TrendyolReturn,
  type TrendyolClaimIssueReason,
} from "@/lib/trendyol-api";

export const dynamic = "force-dynamic";

function fmtDate(epochMs: number | null | undefined) {
  if (!epochMs) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(epochMs));
}

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
  const cls = isGood
    ? "bg-emerald-100 text-emerald-700"
    : isBad
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Pazar Yerleri / Trendyol / İadeler
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            İade İşlem Merkezi
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Trendyol iade taleplerini onaylayın veya itiraz edin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketplace/trendyol">
            <Button variant="secondary">← Trendyol Paneli</Button>
          </Link>
        </div>
      </div>

      {/* Not-configured state */}
      {notConfigured && (
        <Card className="p-10 text-center space-y-4">
          <p className="text-slate-600 text-sm font-medium">Trendyol API yapılandırılmamış veya pasif.</p>
          <Link href="/admin/trendyol">
            <Button className="mt-2">⚙ API Ayarlarına git</Button>
          </Link>
        </Card>
      )}

      {/* API error state */}
      {!notConfigured && apiError && (
        <Card className="p-6 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">API bağlantısı başarısız</p>
          <p className="mt-1 text-xs text-red-600">{apiError}</p>
        </Card>
      )}

      {/* Returns */}
      {!notConfigured && !apiError && (
        <>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Toplam İade</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{totalElements}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">İşlem Bekleyen</p>
              <p className="mt-1 text-2xl font-semibold text-amber-600">{actionableReturns.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tamamlanan</p>
              <p className="mt-1 text-2xl font-semibold text-slate-600">{otherReturns.length}</p>
            </Card>
          </div>

          {/* Actionable claims first */}
          {actionableReturns.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
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
              <h2 className="text-base font-semibold text-slate-900">
                Diğer İadeler ({otherReturns.length})
              </h2>
              {otherReturns.map((ret) => (
                <ReturnCard key={ret.claimId} ret={ret} issueReasons={issueReasons} showActions={false} />
              ))}
            </section>
          )}

          {returns.length === 0 && (
            <Card className="p-10 text-center">
              <p className="text-slate-400 text-sm">Son 30 günde iade bulunamadı.</p>
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
    <Card className="p-5 space-y-4">
      {/* Claim header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            {firstStatus && <StatusBadge status={firstStatus} />}
            <span className="font-mono text-xs text-slate-500">{ret.claimId}</span>
            <span className="text-xs text-slate-400">Sipariş: {ret.orderNumber ?? "—"}</span>
          </div>
          <p className="text-xs text-slate-500">
            {ret.customerFirstName} {ret.customerLastName} · {fmtDate(ret.claimDate)}
          </p>
        </div>
      </div>

      {/* Products */}
      <div className="space-y-1">
        {productNames.map((name, i) => (
          <p key={i} className="text-sm text-slate-700">{name}</p>
        ))}
        {firstReason && (
          <p className="text-xs text-slate-400">Neden: {firstReason}</p>
        )}
      </div>

      {/* Claim items detail */}
      <div className="space-y-1">
        {ret.items.flatMap((item) =>
          item.claimItems.map((ci) => (
            <div key={ci.id} className="flex items-center gap-2 text-xs text-slate-500">
              <StatusBadge status={ci.claimItemStatus.name} />
              <span className="font-mono text-[10px]">#{ci.id.slice(-8)}</span>
              {ci.note && <span className="text-slate-400 truncate">· {ci.note}</span>}
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
