/**
 * CFO / Ölü Stok / Eylem — öneri motoru (lib/olu-stok/plan.ts) + İNSAN ONAYLI pazaryeri eylemleri (lib/actions/olu-stok-actions.ts).
 * Sayfa hiçbir şeyi kendiliğinden göndermez: her eylem marketplaceListings.write izni + "ONAYLIYORUM" ister ve cfo_change_log'a yazılır.
 * Taban = birim maliyet / kanalın kalibre net oranı (cfo_kanal_net_oran); taban bilinmiyorsa fiyat önerisi yok.
 */
import Link from "next/link";
import { PackageX } from "lucide-react";
import { requirePermission, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { fmtTry, fmtNum } from "@/lib/cfo/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadPlans } from "@/lib/olu-stok/load";
import { floorPrice, independentCode, DUPLICATE_LISTING_RISK } from "@/lib/olu-stok/plan";
import { trendyolWriteEnabled } from "@/lib/trendyol/write";
import { pttavmConfig } from "@/lib/pttavm/client";
import { pttavmWriteEnabled } from "@/lib/pttavm/write";
import { EylemForm } from "./eylem-form";

export const dynamic = "force-dynamic";

export default async function DeadStockActionPage() {
  const user = await requirePermission(PERMISSIONS.CFO_READ);
  const canWrite = await checkPermission(user, PERMISSIONS.MARKETPLACE_LISTINGS_WRITE);
  const { plans, ctx, channels } = await loadPlans();
  const gates = { TRENDYOL: trendyolWriteEnabled(), PTTAVM: pttavmWriteEnabled(pttavmConfig()) };
  const rate = (c: string) => channels.find(x => x.channel === c)?.commissionRate;

  return (
    <>
      <PageHeader icon={PackageX} title="Ölü Stok — Eylem" subtitle="Fiyat düşürme, içerik optimizasyonu, Entegra'dan bağımsız yeni ilan. Her eylem insan onaylı." />
      <Card className="mb-4 p-4 text-[12px] leading-relaxed text-[var(--text-secondary)]">
        <p>
          Yazma: Trendyol <Badge>{gates.TRENDYOL ? "açık" : "kapalı (TRENDYOL_WRITE_ENABLED)"}</Badge> · PttAVM{" "}
          <Badge>{gates.PTTAVM ? "açık" : "kapalı (PTTAVM_WRITE_ENABLED + REST anahtarları)"}</Badge> · Yetkiniz:{" "}
          <Badge>{canWrite ? "var" : "yok (marketplaceListings.write)"}</Badge>
        </p>
        <p className="mt-1">
          Kesinti (kalibre, banka ekstresi): Trendyol {rate("TRENDYOL") != null ? `%${(rate("TRENDYOL")! * 100).toFixed(1)}` : "bilinmiyor"} · PttAVM{" "}
          {rate("PTTAVM") != null ? `%${(rate("PTTAVM")! * 100).toFixed(1)}` : "bilinmiyor"}. Taban bunun altına inmez.
        </p>
        <p className="mt-1 text-[var(--warn)]">⚠ {DUPLICATE_LISTING_RISK}. Yeni ilan ayrı SKU/barkod (ALFOS-…), yeni başlık (≤ %60 benzer) ve yeni AI görselleriyle açılır; stoğu her gece Entegra XML'inden eşitlenir (fiyat otomatik değişmez).</p>
        <p className="mt-1"><Link className="underline" href="/cfo/olu-stok">← Ölü stok listesi</Link></p>
      </Card>
      <div className="space-y-3">
        {plans.map(p => {
          const c = ctx.get(p.sku)!;
          const floors = Object.fromEntries(channels.map(ch => [ch.channel, floorPrice(c.row.unitCostTry, ch)]));
          return (
            <Card key={p.sku} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{p.sku} · {p.name}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {c.row.alarm && <Badge>{c.row.alarm}</Badge>} bağlı {fmtTry(p.boundCapitalTry)} · stok {fmtNum(c.row.stock)} · XML stok {fmtNum(c.xmlStock)} ·
                  son satış {c.row.daysSinceSale ?? "?"} gün · öncelik {fmtNum(Math.round(p.priority))}
                </p>
              </div>
              <ul className="mt-2 list-disc pl-5 text-[12px] text-[var(--text-secondary)]">
                {p.actions.map((a, i) => (
                  <li key={i}>
                    {a.kind === "PRICE_DROP" && <>{a.channel}: {fmtTry(a.fromTry)} → <strong>{fmtTry(a.toTry)}</strong> (%{a.stepPct}, taban {fmtTry(a.floorTry)})</>}
                    {a.kind === "PRICE_UNKNOWN" && <>{a.channel}: fiyat önerisi yok — {a.reason}</>}
                    {a.kind === "NEW_LISTING" && <>{a.channel}: yeni ilan önerilir ({a.reason}) — kod {independentCode(p.sku)}</>}
                    {a.kind === "CONTENT" && <>İçerik: {a.reason}</>}
                  </li>
                ))}
              </ul>
              {canWrite && (
                <EylemForm sku={p.sku} name={p.name} barcode={c.barcode} oldPrice={c.row.avgPrice90Try} floors={floors} gates={gates}
                  suggested={Object.fromEntries(p.actions.flatMap(a => (a.kind === "PRICE_DROP" ? [[a.channel, a.toTry]] : [])))}
                  description={c.description} imageUrl={c.imageUrl} />
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
