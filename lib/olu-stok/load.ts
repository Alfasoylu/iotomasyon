// Ölü stok eylem planı veri yükleyici (salt-okur). Kaynak: cfo_olu_stok (kural görünümde) + Product (barkod, görsel, açıklama, XML stok)
// + cfo_kanal_net_oran (banka ekstresinden kalibre net oran; PttAVM = EPTT). Birim maliyet yalnız deger_kaynagi = MALIYET iken
// bağlı sermaye / stoktan türetilir; satıştan türetilmiş değer maliyet sayılmaz (taban uydurulmaz).
import { prisma } from "@/lib/prisma";
import { economicsFromNetRate, planAll, type ChannelEconomics, type DeadStockRow, type Plan } from "./plan";

type ViewRow = { sku: string | null; ad: string | null; stok: number | null; bagli_sermaye: unknown; adet_90g: bigint | null;
  gecen_gun: number | null; deger_kaynagi: string | null; satis_90g_try: unknown; alarm: string | null };
const num = (v: unknown) => (v == null ? null : Number(v));

export type DeadStockContext = { row: DeadStockRow; barcode: string | null; xmlStock: number; imageUrl: string | null; description: string | null };

export async function loadChannels(): Promise<ChannelEconomics[]> {
  const rates = await prisma.$queryRaw<{ channel: string; net_oran: unknown }[]>`
    select channel, net_oran from cfo_kanal_net_oran where channel in ('TRENDYOL', 'EPTT')`;
  const rate = (c: string) => num(rates.find(r => r.channel === c)?.net_oran);
  return [economicsFromNetRate("TRENDYOL", rate("TRENDYOL")), economicsFromNetRate("PTTAVM", rate("EPTT"))];
}

export async function loadDeadStock(): Promise<Map<string, DeadStockContext>> {
  const view = await prisma.$queryRaw<ViewRow[]>`
    select sku, ad, stok, bagli_sermaye, adet_90g, gecen_gun, deger_kaynagi, satis_90g_try, alarm from cfo_olu_stok where sku is not null`;
  const skus = view.map(v => v.sku!).filter(Boolean);
  const products = await prisma.product.findMany({ where: { sku: { in: skus } },
    select: { sku: true, barcode: true, imageUrl: true, description: true, stockQuantity: true } });
  const bySku = new Map(products.map(p => [p.sku, p]));
  const out = new Map<string, DeadStockContext>();
  for (const v of view) {
    const sku = v.sku!; const p = bySku.get(sku);
    const stock = v.stok ?? p?.stockQuantity ?? 0; const bound = num(v.bagli_sermaye); const units90 = Number(v.adet_90g ?? 0);
    const sales90 = num(v.satis_90g_try);
    out.set(sku, { barcode: p?.barcode ?? null, xmlStock: p?.stockQuantity ?? 0, imageUrl: p?.imageUrl ?? null, description: p?.description ?? null,
      row: { sku, name: v.ad ?? sku, stock, boundCapitalTry: bound, units90, daysSinceSale: v.gecen_gun, alarm: v.alarm,
        unitCostTry: v.deger_kaynagi === "MALIYET" && bound != null && stock > 0 ? Math.round((bound / stock) * 100) / 100 : null,
        avgPrice90Try: units90 > 0 && sales90 != null ? Math.round((sales90 / units90) * 100) / 100 : null,
        descriptionLength: p?.description?.length ?? 0, hasImage: !!p?.imageUrl, hasBarcode: !!p?.barcode } });
  }
  return out;
}

export async function loadPlans(): Promise<{ plans: Plan[]; ctx: Map<string, DeadStockContext>; channels: ChannelEconomics[] }> {
  const [ctx, channels] = await Promise.all([loadDeadStock(), loadChannels()]);
  return { plans: planAll([...ctx.values()].map(c => c.row), channels), ctx, channels };
}
