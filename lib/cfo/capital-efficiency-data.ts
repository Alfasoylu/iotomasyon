import { allocate, DEFAULT_PARAMS, type DebtInput, type SkuInput } from "./capital-efficiency";
import { loadDownside } from "./downside-data";
import { CARD_COLUMNS_SQL, cardEffectiveMonthlyRate, isPersonalCard } from "./card-cost";

// Sermaye verimliliği veri yükleyicisi (salt-okunur, TEK yükleyici: /cfo/sermaye sayfası Prisma ile, AI CFO bağlamı salt-okunur
// iş kaynağı ile çağırır — `q` yalnız SQL çalıştırır). Kaynaklar:
//   SKU    → cfo_stok_deger (gercek_stok; yer tutucu stoklar hariç). Net değer YALNIZ gerçekleşen satıştan: deger_kaynagi
//            'GERCEKLESEN_SATIS' değilse birim_net_deger maliyete düşer (görünüm yedeği) → burada null (UNKNOWN) sayılır.
//   Borç   → cfo_loan AKTIF (interestRatePct YILLIK → /12), kullanılan KMH (eksi bakiye; hesabın ölçülmüş oranı, yoksa UNKNOWN),
//            kartlarda YALNIZ devreden bakiye, akdi faiz × (1 + KKDF + BSMV) ile (lib/cfo/card-cost.ts); devreden ya da oran
//            girilmemiş kart eşiğe ve tahsise girmez (UNKNOWN). Şahsi kartlar (sahibi 'Alp') eşik dışı.
//   Likidite açığı → Goal Engine net pozisyon tabanı gözlemi (fm_goal_observation, MET değilse gap_try) ile makul stres
//            senaryosundaki (KMH faizi dahil) dibin tabana uzaklığının büyüğü (lib/cfo/downside.ts).
//   Hedef örtü → cfo_settings.importSeaLeadDays + 30 gün emniyet.

export type SqlQuery = <T = Record<string, unknown>>(sql: string) => Promise<T[]>;

export async function loadCapitalEfficiency(q: SqlQuery, opts: { budgetTry?: number } = {}) {
  const [cc] = await q<{ n: number }>(CARD_COLUMNS_SQL);
  const [skus, loans, kmh, settings, floor, downside, cards] = await Promise.all([
    q<{ id: string; sku: string; name: string; stok: unknown; birim_maliyet: unknown; birim_net_deger: unknown; gunluk_hiz: unknown; deger_kaynagi: string }>(
      `select id, sku, name, stok, birim_maliyet, birim_net_deger, gunluk_hiz, deger_kaynagi from cfo_stok_deger where gercek_stok`),
    q<{ bank: string; name: string; remaining: unknown; payoff: unknown; payment: unknown; rate: unknown }>(
      `select bank, name, "remainingTry" as remaining, "earlyPayoffTry" as payoff, "monthlyPaymentTry" as payment, "interestRatePct" as rate
         from cfo_loan where status::text = 'AKTIF'`),
    q<{ name: string; balance: unknown; rate: unknown; type: string | null }>(
      `select name, "balanceTry" as balance, "monthlyRatePct" as rate, "accountType"::text as type from cfo_bank_account where "isActive" and "balanceTry" < 0`),
    q<{ sea: unknown }>(`select "importSeaLeadDays" as sea from cfo_settings limit 1`),
    q<{ state: string; gap: unknown }>(`select state, gap_try as gap from fm_goal_observation where goal_key = 'net_position_floor_try' order by evaluated_at desc limit 1`)
      .catch(() => []),
    loadDownside(q).catch(() => null),
    Number(cc?.n) === 2 ? q<{ bank: string; holder: string | null; revolving: unknown; rate: unknown }>(
      `select bank, holder, "revolvingTry" as revolving, "contractMonthlyRatePct" as rate from cfo_credit_card where "isActive" and "revolvingTry" > 0`)
      : Promise.resolve([] as { bank: string; holder: string | null; revolving: unknown; rate: unknown }[]),
  ]);
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const skuInputs: SkuInput[] = skus.map(s => ({
    id: s.id, sku: s.sku, name: s.name, stock: Number(s.stok),
    unitCost: num(s.birim_maliyet), unitNet: s.deger_kaynagi === "GERCEKLESEN_SATIS" ? num(s.birim_net_deger) : null,
    dailyVelocity: num(s.gunluk_hiz) ?? 0,
  }));
  const debts: DebtInput[] = [
    ...loans.map(l => {
      const annual = num(l.rate);
      return { name: `${l.bank} — ${l.name}`, kind: "LOAN" as const, payoffTry: num(l.payoff) ?? num(l.remaining) ?? 0,
        monthlyRate: annual != null ? annual / 100 / 12 : null, monthlyPaymentTry: num(l.payment) };
    }),
    ...kmh.map(k => ({ name: `${k.name} KMH`, kind: "KMH" as const, payoffTry: -Number(k.balance),
      // hesabın ölçülmüş oranı; yoksa UNKNOWN (küresel cfo_settings oranı kullanılmaz — CFO-005)
      monthlyRate: num(k.rate) != null && Number(k.rate) > 0 ? Number(k.rate) / 100 : null, monthlyPaymentTry: null,
      personal: /ŞAHSİ|şahsi/i.test(`${k.type ?? ""} ${k.name}`) })),
    ...cards.map(c => ({ name: `${c.bank} ${c.holder ?? ""} kart`.replace(/\s+/g, " ").trim(), kind: "CARD" as const, payoffTry: Number(c.revolving),
      monthlyRate: cardEffectiveMonthlyRate(num(c.rate)), monthlyPaymentTry: null, personal: isPersonalCard(c.holder) })),
  ];
  const liquidityGapTry = floor[0] && floor[0].state !== "MET" ? Math.max(0, num(floor[0].gap) ?? 0) : 0;
  const params = { ...DEFAULT_PARAMS, targetCoverDays: (num(settings[0]?.sea) ?? 67) + 30 };
  const stressGapTry = downside?.stressGapTry ?? 0;
  const first = allocate(skuInputs, debts, { liquidityGapTry, budgetTry: 0, stressGapTry }, params);
  // Plan bütçesi: varsayılan olarak tasfiye/fazla stoktan açığa çıkabilecek nakit (kaynak → kullanım döngüsü).
  const budgetTry = opts.budgetTry ?? first.releasableCashTry;
  const result = allocate(skuInputs, debts, { liquidityGapTry, budgetTry, stressGapTry }, params);
  return { ...result, params, liquidityGapTry, stressGapTry, budgetTry, debts, downside };
}
