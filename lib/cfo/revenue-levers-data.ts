import { loadCapitalEfficiency, type SqlQuery } from "./capital-efficiency-data";
import { newProductsLever, rankLevers, scaleProtectLever, stockoutLever } from "./revenue-levers";
import { pickStrategicFx, STRATEGIC_FX_SQL_NOW } from "../fx/strategic";
import { lastCompleteDays } from "./revenue";

// Gelir kaldıraçları veri yükleyicisi (salt-okunur; sayfa ve AI CFO aynı kodu çağırır). Ciro: TEK kaynak lib/cfo/revenue.ts (CFO-008 —
// Goal Engine satırları, son 90 TAM gün ÷ 3, KDV dahil); stoksuz satan SKU listesi satır düzeyinde cfo_satis_birim_duz. Hedef: cfo_settings.monthlyRevenueTargetUsd × STRATEJİK kur (TCMB, lib/fx/strategic; CFO-003) — kur yoksa hedef
// BİLİNMİYOR (sabit kur yedeği yok). İthal malın TL maliyeti operasyonel kurla (cfo_kur; yoksa stratejik). Stoksuz satan: aktif, stok 0,
// son 90 günde ≥3 adet. Yeni ürün: urun_aday TASLAK/HAZIR (gümrüklü USD × adet = batık sermaye). Yıldız: sermaye motoru SCALE.

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export async function loadRevenueLevers(q: SqlQuery) {
  const [ce, cur, set, kur, so, np, months, sfx] = await Promise.all([
    loadCapitalEfficiency(q, { budgetTry: 0 }),
    // CFO-008: aylık ciro tek kaynaktan (Goal Engine satırları, son 90 TAM gün ÷ 3; KDV dahil) — SKU dağılımı aşağıda satır düzeyinde kalır
    lastCompleteDays(q, 90).catch(() => null),
    q<{ usd: unknown; air: unknown; sea: unknown }>(`select "monthlyRevenueTargetUsd" as usd, "importAirLeadDays" as air, "importSeaLeadDays" as sea from cfo_settings limit 1`),
    q<{ v: unknown }>(`select usd_try as v from cfo_kur where usd_try > 0 order by ay desc limit 1`).catch(() => []),
    q<{ sku: string; rev90: unknown; u90: unknown; cost: unknown }>(`with s as (select coalesce(d."productId", p.id) pid, sum(d.tutar_duz) rev90, sum(d.adet_duz) u90
        from cfo_satis_birim_duz d left join "Product" p on p.sku = d."productCode" where d."orderDate" > current_date - 90 group by 1)
      select p.sku, s.rev90, s.u90, p."unitCostTry" as cost from s join "Product" p on p.id = s.pid
      where p."isActive" and p."stockQuantity" = 0 and s.u90 >= 3 order by s.rev90 desc`),
    q<{ n: unknown; nic: unknown; gross: unknown; landed_usd: unknown }>(`select count(*) as n, count(*) filter (where not exists (select 1 from "Product" p where lower(p.sku) = lower(u.sku))) as nic,
        sum(satis_try * adet) as gross, sum(coalesce(gumruklu_usd, 0) * adet) as landed_usd from urun_aday u where durum in ('TASLAK','HAZIR')`).catch(() => []),
    q<{ v: unknown }>(`select avg("salesMonths") as v from cfo_import_project where status::text not in ('TESLIM_ALINDI','IPTAL') and "salesMonths" > 0`).catch(() => []),
    q<{ month: unknown; rate: unknown }>(STRATEGIC_FX_SQL_NOW).catch(() => []),
  ]);
  const strategic = pickStrategicFx(sfx[0], new Date());
  const fx = strategic?.usdTry ?? null;
  const landedFx = num(kur[0]?.v) ?? fx;
  // Hedef ayarı ya da kur yoksa hedef BİLİNMİYOR (100.000 USD varsayılanı yok — RF-019)
  const targetUsd = num(set[0]?.usd);
  const targetMonthlyTry = fx == null || targetUsd == null ? null : targetUsd * fx;
  // Son 90 günde hiç satış satırı yoksa bugünkü ciro BİLİNMİYOR (kaynak boş olabilir): plan 0 ile kurulur ama işaretlenir (CFO-014)
  const currentUnknown = cur == null || cur.rows === 0;
  const currentMonthlyTry = cur == null ? 0 : cur.inclTry / 3;
  const sea = num(set[0]?.sea) ?? 67, air = num(set[0]?.air) ?? 22;
  const scale = ce.skus.filter(s => s.cls === "SCALE");
  const levers = [
    // kur hiç yoksa ithal malın TL maliyeti bilinmez → kaldıraç hesaplanmaz (0 TL maliyet uydurulmaz)
    landedFx == null ? null : newProductsLever({ n: num(np[0]?.n) ?? 0, notInCatalog: num(np[0]?.nic) ?? 0, grossListTry: num(np[0]?.gross) ?? 0,
      landedTry: (num(np[0]?.landed_usd) ?? 0) * landedFx, salesMonths: Math.max(1, num(months[0]?.v) ?? 6) }),
    stockoutLever(so.map(r => ({ sku: r.sku, rev90: num(r.rev90) ?? 0, units90: num(r.u90) ?? 0, unitCost: num(r.cost) })), air, ce.params.targetCoverDays),
    scaleProtectLever(scale.reduce((s, r) => s + r.restockCapitalTry, 0), scale.reduce((s, r) => s + r.dailyVelocity * 30 * (r.unitNet ?? 0), 0),
      scale.reduce((s, r) => s + (r.monthlyContributionTry ?? 0), 0), sea),
  ];
  // hedef bilinmiyorsa açık 0 değil: plan hedefsiz kurulur ve targetUnknown işaretlenir
  return { ...rankLevers(levers, currentMonthlyTry, targetMonthlyTry ?? currentMonthlyTry), targetUnknown: targetMonthlyTry == null, targetUsd, currentUnknown, fx,
    revenueSource: cur ? `${cur.source}, ${cur.from} – ${cur.to}${cur.complete ? "" : " (eksik gün var)"}` : null,
    fxLabel: strategic?.label ?? "stratejik kur BİLİNMİYOR (fm_fx_monthly boş)", stockoutTop: so.slice(0, 10).map(r => ({ sku: r.sku, revMonthlyTry: Math.round((num(r.rev90) ?? 0) / 3) })) };
}
