import type { ReadSource } from "./sources";

// Banka bakiyesi ileri taşıma (2026-10-07 kullanıcı kararı): bakiyeler haftalık girilir; aradaki günlerde her hesabın
// son girilen bakiyesi, ödeme takviminde TARİHİ GEÇMİŞ (ya da ödendi işaretli) kalemlerle ileri taşınır.
//  • Çıkış/giriş: cfo_cash_event (banka sütunu) · pazaryeri hakedişi: cfo_receivable (kanal → banka, gözlenen ödemelerden
//    cfo_pay_obs). • Hesabın son güncellendiği GÜNÜN kalemleri bakiyeye dahil sayılır (06.10: Ziraat taksiti ödendi, bakiye
//    aynı gün 20:13'te girildi) → yalnız sonraki günler eklenir. • Bugünün kalemi henüz "geçmedi" (ödendi işareti yoksa).
//  • Banka adı → hesap: önce birebir ad, yoksa o markada TEK aktif hesap; eşlenmeyen tutar ayrıca raporlanır, uydurulmaz.
// Sonuç TAHMİNİdir (measured=false); haftalık gerçek bakiye girişi yine istenir (health.ts).

export type RfAccount = { name: string; balanceTry: number | null; lastUpdatedAt: string };
export type RfMovement = { date: string; bank: string | null; amountTry: number; settled: boolean; label: string };
export type RfResult = {
  accounts: { name: string; anchorTry: number; anchorDate: string; netTry: number; projectedTry: number; movements: number }[];
  unmapped: { label: string; bank: string | null; amountTry: number }[];
  anchorTotalTry: number; projectedTotalTry: number;
};

const fold = (s: string) => s.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/\s+/g, " ").trim();
/** Takvim kalemleri İstanbul günüyle tutulur; bakiye güncelleme anı da İstanbul gününe çevrilir (23:17 girilen bakiye UTC'de ertesi güne kaymasın). */
const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(iso));

export function resolveAccount(bank: string | null, accounts: RfAccount[]): RfAccount | null {
  if (!bank) return null;
  const b = fold(bank);
  const exact = accounts.filter(a => fold(a.name) === b);
  if (exact.length === 1) return exact[0];
  const brand = accounts.filter(a => fold(a.name).startsWith(`${b} `) || fold(a.name) === b);
  return brand.length === 1 ? brand[0] : null;
}

/** today: Europe/Istanbul takvim günü (YYYY-MM-DD). Hareket tutarı işaretli: giriş +, çıkış −. */
export function rollForwardBalances(accounts: RfAccount[], movements: RfMovement[], today: string): RfResult {
  const rows = new Map(accounts.filter(a => a.balanceTry != null).map(a => [a.name, { name: a.name, anchorTry: a.balanceTry!, anchorDate: day(a.lastUpdatedAt), netTry: 0, projectedTry: a.balanceTry!, movements: 0 }]));
  const unmapped: RfResult["unmapped"] = [];
  for (const m of movements) {
    const realized = m.date < today || m.settled; // "tarihi geçince" gerçekleşmiş sayılır
    if (!realized || m.amountTry === 0) continue;
    const account = resolveAccount(m.bank, accounts);
    const row = account ? rows.get(account.name) : undefined;
    if (!row) { if (m.date > minAnchor(rows)) unmapped.push({ label: m.label, bank: m.bank, amountTry: m.amountTry }); continue; }
    if (m.date <= row.anchorDate) continue; // bakiye girildiği günün ve öncesinin kalemleri bakiyede
    row.netTry += m.amountTry; row.projectedTry += m.amountTry; row.movements++;
  }
  const list = [...rows.values()].map(r => ({ ...r, netTry: round(r.netTry), projectedTry: round(r.projectedTry) }));
  return { accounts: list, unmapped, anchorTotalTry: round(list.reduce((s, r) => s + r.anchorTry, 0)), projectedTotalTry: round(list.reduce((s, r) => s + r.projectedTry, 0)) };
}
const round = (n: number) => Math.round(n * 100) / 100;
const minAnchor = (rows: Map<string, { anchorDate: string }>) => [...rows.values()].reduce((m, r) => (r.anchorDate < m ? r.anchorDate : m), "9999-12-31");

/** Salt-okunur yükleyici: hesaplar + son 45 günün takvim kalemleri + kanal → banka (gözlenen son ödeme). */
export async function loadBankRollForward(db: ReadSource, today: string): Promise<RfResult | null> {
  const present = new Set((await db.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema='public'
    and table_name = any($1::text[])`, ["cfo_bank_account", "cfo_cash_event", "cfo_receivable", "cfo_pay_obs"])).map(r => r.name));
  if (!present.has("cfo_bank_account") || !present.has("cfo_cash_event")) return null;
  const accounts = (await db.query(`select name, "balanceTry" as b, "lastUpdatedAt" as u from cfo_bank_account where "isActive"`))
    .map(r => ({ name: String(r.name), balanceTry: r.b == null ? null : Number(r.b), lastUpdatedAt: new Date(String(r.u)).toISOString() }));
  const events = (await db.query(`select "eventDate"::date::text as d, bank, coalesce("inflowTry",0)::float8 - coalesce("outflowTry",0)::float8 as amt, coalesce("isSettled",false) as s,
      coalesce(description, kind::text) as l from cfo_cash_event where "eventDate"::date >= $1::text::date - 45 and "eventDate"::date <= $1::text::date`, today))
    .map(r => ({ date: String(r.d), bank: r.bank == null ? null : String(r.bank), amountTry: Number(r.amt), settled: r.s === true, label: String(r.l ?? "") }));
  const receivables = present.has("cfo_receivable") ? (await db.query(`select r."dueDate"::date::text as d, r.channel, r."amountTry"::float8 as amt, coalesce(r."isCollected",false) as s,
      ${present.has("cfo_pay_obs") ? `(select p.banka from cfo_pay_obs p where p.kanal = r.channel and p.banka is not null order by p.odeme_tarihi desc limit 1)` : "null::text"} as bank
      from cfo_receivable r where r."dueDate"::date >= $1::text::date - 45 and r."dueDate"::date <= $1::text::date`, today))
    .map(r => ({ date: String(r.d), bank: r.bank == null ? null : String(r.bank), amountTry: Number(r.amt), settled: r.s === true, label: `${r.channel} hakediş` })) : [];
  return rollForwardBalances(accounts, [...events, ...receivables], today);
}
