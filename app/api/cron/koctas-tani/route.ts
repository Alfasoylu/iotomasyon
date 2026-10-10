import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { countReturns, koctasConfig, koctasGet, listOrders, listThreads, summarizeCommission, transactionSummary } from "@/lib/koctas/client";

// Koçtaş (Mirakl) bağlantı teşhisi (CRON_SECRET; yalnız elle — pazaryeri-api-test.yml kanal=koctas). SALT OKUMA: sürüm, son N gün sipariş
// komisyon özeti (yalnız sayı/tutar/oran), yanıt bekleyen mesaj sayısı, TL02 komisyon kalemleri, iade sayısı. Anahtar ve kişisel veri dönmez.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function step<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "hata" }; }
}

export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  let cfg;
  try { cfg = koctasConfig(); } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "yapılandırma" }, { status: 502 }); }
  if (!cfg) return NextResponse.json({ ok: false, error: "KOCTAS_API_KEY tanımlı değil" }, { status: 502 });
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("gun") ?? 30) || 30));
  const to = new Date(), from = new Date(to.getTime() - days * 86400000);
  const version = await step(() => koctasGet<{ version?: string }>(cfg, "/api/version"));
  const orders = await step(async () => summarizeCommission(await listOrders(cfg, from, to)));
  const messages = await step(async () => { const r = await listThreads(cfg, { updatedSince: from, limit: 100 });
    return { threads: r.items.length, replyNeeded: r.items.filter(t => t.replyNeededSince).length, more: Boolean(r.nextPageToken) }; });
  const payments = await step(() => transactionSummary(cfg, from, to));
  const returns = await step(async () => ({ count: await countReturns(cfg, from) }));
  const ok = orders.ok;
  return NextResponse.json({ ok, baseUrl: cfg.baseUrl, window: { from: from.toISOString(), to: to.toISOString(), days }, version, orders, messages, payments, returns,
    note: "commissionFeeTry = commission_fee (KDV hariç) toplamı; payments.commissionNetTry TL02 komisyon kalemleri (negatif = kesinti) — çapraz kontrol" },
    { status: ok ? 200 : 502, headers: { "Cache-Control": "private, no-store" } });
}
