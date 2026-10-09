import "server-only";
import { prisma } from "@/lib/prisma";
import { loadCurrentFx } from "@/lib/fx/current";
import { COST_DERIVATION_SOURCE, DOMESTIC_PREF, deriveUnitCosts, derivationLog, type CostDerivation, type CostFx, type CostRow } from "./cost-derivation";

// CFO-029 veri katmanı: ürünleri oku → saf türetme (./cost-derivation.ts) → TEK SQL ifadesiyle korumalı yaz + günlük.
// Koruma: ürün yalnız okunan eski gümrük %/USD/TL değerlerindeyse güncellenir (arada elle düzeltme yapıldıysa dokunulmaz, sonraki
// koşu yeni değerden yeniden türetir). Her değişen alan cfo_change_log'a (area maliyet, kind duzeltme, source COST_DERIVATION_SOURCE),
// koşu başına bir özet satırı (kind analiz) — değişiklik yoksa hiçbir şey yazılmaz. Çağıran: xml-sync after() (TCMB kurundan hemen sonra).

export type CostDb = { query: <T>(sql: string, ...params: unknown[]) => Promise<T[]> };
export type CostRunResult = { status: CostDerivation["status"] | "hata"; updated: number; fields: number; planned: number; skipped: number; deltaStockTry: number; bigMovers: number };

/** İthal (RMB + ağırlık) ve yurt içi (IC_PIYASA) ürünler; gümrük yükü cfo_gtip_yuk ile aynı en uzun önek, KDV + ÖTV dahil. */
export function costRowsSql(): string {
  return `SELECT p.sku, p."sourceCostRmb"::text AS rmb, p."weightKg"::text AS kg, p."importPaymentFeePct"::text AS fee, p."shippingMethodPref" AS pref,
       p."customsRatePct"::text AS cus, p."unitCostUsd"::text AS usd, p."unitCostTry"::text AS try_, p."stockQuantity" AS stock,
       (SELECT mp."priceTry"::text FROM public."MarketplacePrice" mp WHERE mp."productId" = p.id AND mp.marketplace::text = 'TRENDYOL' LIMIT 1) AS ty,
       x."xmlTrendyolPrice"::text AS xml, t.yuk::text AS yuk
  FROM public."Product" p
  LEFT JOIN public."XmlProductData" x ON x."productId" = p.id
  LEFT JOIN LATERAL (
    SELECT round(((1 + (tr.gv_pct + tr.igv_pct) / 100) * (1 + coalesce(tr.otv_pct, 0) / 100) * (1 + tr.kdv_pct / 100) - 1) * 100, 1) AS yuk
      FROM public.cfo_gtip_tarife tr
     WHERE regexp_replace(coalesce(p.gtip1, ''), '[^0-9]', '', 'g') <> ''
       AND regexp_replace(coalesce(p.gtip1, ''), '[^0-9]', '', 'g') LIKE tr.gtip || '%'
     ORDER BY length(tr.gtip) DESC LIMIT 1) t ON true
 WHERE (p."sourceCostRmb" > 0 AND p."weightKg" > 0) OR p."shippingMethodPref" = '${DOMESTIC_PREF}'
 ORDER BY p.sku`;
}

type RawRow = { sku: string; rmb: string | null; kg: string | null; fee: string | null; pref: string | null; cus: string | null; usd: string | null;
  try_: string | null; stock: unknown; ty: string | null; xml: string | null; yuk: string | null };
const n = (s: string | null) => (s == null ? null : Number(s));
export function toCostRows(raw: RawRow[]): CostRow[] {
  return raw.map(r => ({ sku: r.sku, sourceCostRmb: n(r.rmb), weightKg: n(r.kg), importPaymentFeePct: n(r.fee), shippingMethodPref: r.pref,
    customsRatePct: r.cus, unitCostUsd: r.usd, unitCostTry: r.try_, trendyolPriceTry: n(r.ty), xmlTrendyolPriceUsd: n(r.xml),
    tariffBurdenPct: n(r.yuk), stock: Number(r.stock ?? 0) }));
}

/** $1 güncellemeler (jsonb), $2 kaynak, $3 alan günlüğü (jsonb), $4 özet notu. Tek ifade = tek işlem. */
export const APPLY_COST_SQL = `WITH v AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(sku text, old_cus text, new_cus text, old_usd text, new_usd text, old_try text, new_try text)),
  u AS (
    UPDATE public."Product" p SET "customsRatePct" = v.new_cus::numeric, "unitCostUsd" = v.new_usd::numeric, "unitCostTry" = v.new_try::numeric, "updatedAt" = now()
      FROM v
     WHERE p.sku = v.sku
       AND p."customsRatePct" IS NOT DISTINCT FROM v.old_cus::numeric
       AND p."unitCostUsd" IS NOT DISTINCT FROM v.old_usd::numeric
       AND p."unitCostTry" IS NOT DISTINCT FROM v.old_try::numeric
    RETURNING p.sku),
  l AS (
    INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
    SELECT gen_random_uuid()::text, 'maliyet', c.sku || ' ' || c.field, c.old, c.new, $2, 'duzeltme', c.note
      FROM jsonb_to_recordset($3::jsonb) AS c(sku text, field text, old text, new text, note text)
     WHERE c.sku IN (SELECT sku FROM u)
    RETURNING 1),
  s AS (
    INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
    SELECT gen_random_uuid()::text, 'maliyet', 'CFO-029 maliyet türetme özeti', NULL, (SELECT count(*) FROM u)::text || ' ürün güncellendi', $2, 'analiz', $4
     WHERE EXISTS (SELECT 1 FROM u)
    RETURNING 1)
SELECT (SELECT count(*) FROM u)::int AS urun, (SELECT count(*) FROM l)::int AS alan`;

export function applyParams(d: CostDerivation): [string, string, string, string] {
  const log = derivationLog(d);
  const updates = d.updates.map(u => ({ sku: u.sku, old_cus: u.old.customsRatePct, new_cus: u.next.customsRatePct, old_usd: u.old.unitCostUsd,
    new_usd: u.next.unitCostUsd, old_try: u.old.unitCostTry, new_try: u.next.unitCostTry }));
  return [JSON.stringify(updates), COST_DERIVATION_SOURCE, JSON.stringify(log.rows), log.summary];
}

export async function runCostDerivation(db: CostDb, fx: CostFx): Promise<CostRunResult> {
  const d = deriveUnitCosts(toCostRows(await db.query<RawRow>(costRowsSql())), fx);
  const base = { planned: d.updates.length, skipped: d.skipped.length, deltaStockTry: d.deltaStockTry, bigMovers: d.bigMovers.length };
  if (d.status !== "ok" || !d.updates.length) return { status: d.status, updated: 0, fields: 0, ...base };
  const [res] = await db.query<{ urun: number; alan: number }>(APPLY_COST_SQL, ...applyParams(d));
  return { status: "ok", updated: Number(res?.urun ?? 0), fields: Number(res?.alan ?? 0), ...base };
}

const prismaDb: CostDb = { query: <T>(sql: string, ...p: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...p) };

/** xml-sync after() adımı. Hata akışı durdurmaz; kur bilinmiyorsa ya da hata olursa günlüğe bir araştırma satırı düşer (sır içermez). */
export async function safeDeriveUnitCosts(): Promise<CostRunResult | null> {
  try {
    const result = await runCostDerivation(prismaDb, await loadCurrentFx());
    if (result.status === "kur_bilinmiyor")
      await prisma.cfoChangeLog.create({ data: { area: "maliyet", item: "CFO-029 maliyet türetme atlandı", source: COST_DERIVATION_SOURCE, kind: "arastirma",
        note: "RMB/USD kuru girilmemiş (MonthlyExchangeRate) ya da USD/TRY varsayılan değerde; birim maliyetler değiştirilmedi." } }).catch(() => undefined);
    return result;
  } catch (e) {
    await prisma.cfoChangeLog.create({ data: { area: "maliyet", item: "CFO-029 maliyet türetme hatası", source: COST_DERIVATION_SOURCE, kind: "arastirma",
      note: String(e instanceof Error ? e.message : e).slice(0, 300) } }).catch(() => undefined);
    return null;
  }
}
