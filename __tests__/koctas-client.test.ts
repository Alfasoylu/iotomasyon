/**
 * Koçtaş / Mirakl istemcisi (lib/koctas/client.ts): yapılandırma (yalnız *.mirakl.net), Authorization başlığı (Bearer yok), okuma izin
 * listesi, sipariş sayfalama (max 100 / offset), komisyon özeti (commission_fee / fiyat; iptal/red/iade hariç; kişisel veri yok),
 * mesaj konusu modeli (gönderen adı taşınmaz), M12 yanıt (multipart message_input, 3–50.000), 429 Retry-After, TL02 komisyon toplamı.
 * Ağ yok (sahte fetch). Çalıştır: node --import tsx __tests__/koctas-client.test.ts
 */
import assert from "node:assert/strict";
import { koctasConfig, koctasGet, listOrders, listThreads, replyToThread, summarizeCommission, transactionSummary } from "../lib/koctas/client";

async function main() {
  assert.equal(koctasConfig({}), null);
  const cfg = koctasConfig({ KOCTAS_API_KEY: " key-1 " })!;
  assert.deepEqual(cfg, { baseUrl: "https://koctas.mirakl.net", apiKey: "key-1", shopId: undefined });
  assert.throws(() => koctasConfig({ KOCTAS_API_KEY: "k", KOCTAS_BASE_URL: "https://evil.example.com" }), /mirakl\.net/);

  const calls: { url: string; init: RequestInit }[] = [];
  const line = (o: object) => ({ order_line_state: "SHIPPED", price: 1000, commission_fee: 120, total_commission: 144, ...o });
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init });
    const u = new URL(url);
    if (u.pathname === "/api/orders") return new Response(JSON.stringify(u.searchParams.get("offset") === "0"
      ? { orders: Array.from({ length: 100 }, () => ({ order_state: "SHIPPED", order_lines: [line({})] })), total_count: 101 }
      : { orders: [{ order_state: "CANCELED", order_lines: [line({ order_line_state: "CANCELED" })] }], total_count: 101 }), { status: 200 });
    if (u.pathname === "/api/inbox/threads") return new Response(JSON.stringify({ data: [{ id: "t1", topic: { value: "Teslimat" },
      entities: [{ type: "MMP_ORDER", id: "O-1", label: "O-1" }], metadata: { shop_reply_needed_since: "2026-10-10T10:00:00Z", last_sender: { type: "CUSTOMER_USER", display_name: "Ayşe Y." } },
      messages: [{ body: "Ne zaman gelir?", date_created: "2026-10-10T10:00:00Z", from: { type: "CUSTOMER_USER", display_name: "Ayşe Y." } }] }], next_page_token: null }), { status: 200 });
    if (u.pathname === "/api/sellerpayment/transactions_logs") return new Response(JSON.stringify({ data: [{ type: "COMMISSION_FEE", amount: -120 },
      { type: "COMMISSION_VAT", amount: -24 }, { type: "ORDER_AMOUNT", amount: 1000 }], next_page_token: null }), { status: 200 });
    if (u.pathname === "/api/inbox/threads/t1/message") return new Response(JSON.stringify({ message_id: "m9", thread_id: "t1" }), { status: 201 });
    return new Response("yok", { status: 404 }); }) as unknown as typeof fetch;

  const orders = await listOrders(cfg, new Date("2026-09-10T00:00:00Z"), new Date("2026-10-10T00:00:00Z"), f);
  assert.equal(orders.length, 101);
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "key-1", "Bearer öneki yok");
  assert.match(calls[0].url, /^https:\/\/koctas\.mirakl\.net\/api\/orders\?start_date=2026-09-10T00%3A00%3A00\.000Z&end_date=.*&max=100&offset=0&sort=dateCreated$/);
  const s = summarizeCommission(orders);
  assert.deepEqual([s.lines, s.excludedLines, s.grossTry, s.commissionFeeTry, s.commissionInclVatTry, s.commissionPctOfGross], [100, 1, 100000, 12000, 14400, 12]);
  await assert.rejects(koctasGet(cfg, "/api/offers/imports", {}, f), /okuma listesinde değil/);

  const th = await listThreads(cfg, {}, f);
  assert.deepEqual(th.items[0], { id: "t1", topic: "Teslimat", entityType: "MMP_ORDER", entityId: "O-1", entityLabel: "O-1",
    replyNeededSince: "2026-10-10T10:00:00Z", lastSenderType: "CUSTOMER_USER", messages: [{ fromType: "CUSTOMER_USER", body: "Ne zaman gelir?", date: "2026-10-10T10:00:00Z" }] });
  assert.ok(!JSON.stringify(th).includes("Ayşe"), "gönderen adı taşınmaz");

  await assert.rejects(replyToThread(cfg, "../x", "merhaba", "CUSTOMER", f), /geçersiz konu/);
  await assert.rejects(replyToThread(cfg, "t1", "ok", "CUSTOMER", f), /3–50\.000/);
  assert.equal((await replyToThread(cfg, "t1", "Yarın kargoda.", "CUSTOMER", f)).message_id, "m9");
  const post = calls.find(c => c.url.endsWith("/api/inbox/threads/t1/message"))!;
  assert.equal(post.init.method, "POST");
  const mi = (post.init.body as FormData).get("message_input") as Blob;
  assert.equal(mi.type, "application/json");
  assert.deepEqual(JSON.parse(await mi.text()), { body: "Yarın kargoda.", to: [{ type: "CUSTOMER" }] });

  const tx = await transactionSummary(cfg, new Date("2026-09-10T00:00:00Z"), new Date("2026-10-10T00:00:00Z"), f);
  assert.deepEqual([tx.transactions, tx.commissionNetTry], [3, -144]);

  const limited = (async () => new Response("çok fazla", { status: 429, headers: { "Retry-After": "60" } })) as unknown as typeof fetch;
  await assert.rejects(listOrders(cfg, new Date(), new Date(), limited), (e: Error & { retryAfterSec?: number }) => e.retryAfterSec === 60);
  console.log("Koçtaş/Mirakl istemcisi: yapılandırma, Authorization, izin listesi, sayfalama, komisyon özeti, mesaj modeli (ad yok), M12 yanıt, TL02, 429 passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
