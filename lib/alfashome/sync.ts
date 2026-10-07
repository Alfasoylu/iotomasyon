import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchAlfasOrders, type AlfasSiparis } from "./client";

// alfashome.com siparişlerini veritabanına yazar (2026-10-07): CFO'nun ALFASHOME kanalı bu tablodan okur. Kişisel veri
// (e-posta, ad, telefon, şehir, müşteri kimliği) YAZILMAZ. Tablo yoksa (migration uygulanmadıysa) sessizce atlar.
// Günlük trendyol-sync cron'unda CFO döngüsünden önce çağrılır; idempotent (id üzerinden upsert).

export type AlfasOrderRow = { id: string; order_no: number | null; ordered_at: string | null; amount: number; currency: string;
  status: string | null; payment_status: string | null; item_qty: number };
/** Yalnız sipariş alanları — kişisel veriler bilerek dışarıda. */
export const toOrderRow = (s: AlfasSiparis): AlfasOrderRow => ({ id: s.id, order_no: s.no, ordered_at: s.tarih, amount: Number(s.tutar) || 0,
  currency: (s.para || "try").toLowerCase(), status: s.durum, payment_status: s.odeme, item_qty: s.kalem_adet || 0 });

export type AlfasSyncResult = { status: "synced" | "table_missing" | "not_configured" | "error"; rows?: number; error?: string };

export async function syncAlfasOrders(limit = 500): Promise<AlfasSyncResult> {
  const [t] = await prisma.$queryRaw<{ t: string | null }[]>`select to_regclass('public.alfashome_order')::text as t`;
  if (!t?.t) return { status: "table_missing" };
  const res = await fetchAlfasOrders(limit);
  if (!res.ok) return { status: res.hata.mesaj.includes("yapılandırılmadı") ? "not_configured" : "error", error: res.hata.mesaj };
  const rows = res.siparisler.map(toOrderRow);
  if (!rows.length) return { status: "synced", rows: 0 };
  await prisma.$executeRaw`insert into public.alfashome_order (id, order_no, ordered_at, amount, currency, status, payment_status, item_qty)
    select id, order_no, ordered_at, amount, currency, status, payment_status, item_qty
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(id text, order_no integer, ordered_at timestamptz, amount numeric, currency text,
      status text, payment_status text, item_qty integer)
    on conflict (id) do update set order_no = excluded.order_no, ordered_at = excluded.ordered_at, amount = excluded.amount, currency = excluded.currency,
      status = excluded.status, payment_status = excluded.payment_status, item_qty = excluded.item_qty, synced_at = now()`;
  return { status: "synced", rows: rows.length };
}

/** Cron içinde güvenli çağrı: hata CFO döngüsünü durdurmaz; kod sabit kalır, ayrıntı loglanmaz. */
export async function safeSyncAlfasOrders(): Promise<AlfasSyncResult> {
  try { return await syncAlfasOrders(); } catch { return { status: "error", error: "alfashome_sync_failed" }; }
}
