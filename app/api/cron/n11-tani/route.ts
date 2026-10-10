import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { listQuestions, listReturns, listSettlements, listShipmentPackages, n11Config, productQuery, summarizeCommission } from "@/lib/n11/client";

// N11 bağlantı teşhisi (CRON_SECRET; yalnız elle — pazaryeri-api-test.yml kanal=n11). SALT OKUMA: son N gün sipariş paketi komisyon özeti
// (yalnız sayı/tutar/oran — ad/adres/e-posta yok), ürün sorgusu 1. sayfa adedi, açık soru sayısı, iade sayısı, hakediş (SettlementService
// çalışıyor mu — DOĞRULANMADI). Anahtar dönmez. Soru listesi dakikada 1 kez çağrılabilir.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function step<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "hata" }; }
}

export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const cfg = n11Config();
  if (!cfg) return NextResponse.json({ ok: false, error: "N11_APP_KEY + N11_APP_SECRET tanımlı değil" }, { status: 502 });
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("gun") ?? 30) || 30));
  const to = new Date(), from = new Date(to.getTime() - days * 86400000);
  const orders = await step(async () => summarizeCommission(await listShipmentPackages(cfg, from, to)));
  const products = await step(async () => { const r = await productQuery(cfg, { size: 20 }); return { page1: r.items.length, totalElements: r.totalElements }; });
  const questions = await step(async () => { const r = await listQuestions(cfg, { status: "OPEN", from, to, pageSize: 50 }); return { open: r.totalCount ?? r.items.length }; });
  const returns = await step(async () => ({ count: (await listReturns(cfg, from, to)).length }));
  const settlements = await step(async () => { const r = await listSettlements(cfg, from, to);
    return { count: r.length, settlementTry: Math.round(r.reduce((a, x) => a + (x.settlementAmount ?? 0), 0) * 100) / 100,
      deductionTry: Math.round(r.reduce((a, x) => a + (x.deductionAmount ?? 0), 0) * 100) / 100 }; });
  const ok = orders.ok && products.ok;
  return NextResponse.json({ ok, window: { from: from.toISOString(), to: to.toISOString(), days }, orders, products, questions, returns, settlements,
    note: "komisyon = satıcı fatura tutarı × (commissionRate − sellerCampaignCommissionRate); hakediş SettlementService portalda yok — sonuç doğrulama içindir" },
    { status: ok ? 200 : 502, headers: { "Cache-Control": "private, no-store" } });
}
