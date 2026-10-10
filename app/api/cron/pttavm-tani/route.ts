import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { getCargoProfiles, getMainCategories, ping, pttavmConfig, searchOrders, searchProducts, summarizeOrders } from "@/lib/pttavm/client";

// PttAVM bağlantı teşhisi (CRON_SECRET; yalnız elle — pazaryeri-api-test.yml kanal=pttavm). SALT OKUMA: bağlantı, son N gün sipariş
// özeti (yalnız sayı/tutar — ad/TCKN/adres yok), ürün listesi 1. sayfa adedi, kargo profilleri, ana kategoriler. Anahtar/şifre dönmez.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function step<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "hata" }; }
}
const count = (v: unknown) => Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : null;

export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const cfg = pttavmConfig();
  if (!cfg) return NextResponse.json({ ok: false, mode: null, error: "PTTAVM_API_KEY + PTTAVM_ACCESS_TOKEN (REST) ya da PTTAVM_USERNAME + PTTAVM_PASSWORD (SOAP) tanımlı değil" }, { status: 502 });
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("gun") ?? 30) || 30));
  const to = new Date(), from = new Date(to.getTime() - days * 86400000);
  const connection = await step(() => ping(cfg));
  const orders = await step(async () => summarizeOrders(await searchOrders(cfg, from, to)));
  const products = await step(async () => ({ page1: (await searchProducts(cfg, 1)).length }));
  const cargoProfiles = await step(async () => ({ count: count(await getCargoProfiles(cfg)) }));
  const categories = await step(async () => ({ count: count(await getMainCategories(cfg)) }));
  const ok = connection.ok && orders.ok;
  return NextResponse.json({ ok, mode: cfg.mode, shopIdSet: Boolean(cfg.shopId), window: { from: from.toISOString(), to: to.toISOString(), days },
    connection, orders, products, cargoProfiles, categories,
    note: "komisyon satırda ORAN (%) — tutar = KDV dahil satır × oran; iptal/iade hariç (üretim 10.10 doğrulaması)" },
    { status: ok ? 200 : 502, headers: { "Cache-Control": "private, no-store" } });
}
