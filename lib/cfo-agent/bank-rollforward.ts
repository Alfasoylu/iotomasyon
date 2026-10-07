import type { ReadSource } from "./sources";

// Banka bakiyesi ileri taşıma (2026-10-07 kullanıcı kararı): bakiyeler haftalık girilir; aradaki günlerde her hesabın
// son girilen bakiyesi, ödeme takviminde TARİHİ GEÇMİŞ (ya da ödendi işaretli) kalemlerle ileri taşınır.
//  • Çıkış/giriş: cfo_cash_event (banka sütunu) · pazaryeri hakedişi: cfo_receivable (kanal → banka YALNIZ cfo_kanal_sozluk'tan;
//    2026-10-07: cfo_pay_obs'tan türetme bırakıldı — aynı kanal 3 yazımla geçiyor, gözlemlerin %94'ü hesap adıyla eşleşmiyordu).
//    Sözlükte olmayan yazım ya da banka=null (guven OLCULMEDI) satırı EŞLENMEZ, nedeniyle raporlanır; sözlüğü el kitabı sahibi tutar.
//  • Hesabın son güncellendiği GÜNÜN kalemleri bakiyeye dahil sayılır (06.10: Ziraat taksiti ödendi, bakiye
//    aynı gün 20:13'te girildi) → yalnız sonraki günler eklenir. • Bugünün kalemi henüz "geçmedi" (ödendi işareti yoksa).
//  • Banka adı → hesap: önce birebir ad, yoksa o markada TEK aktif hesap; eşlenmeyen tutar ayrıca raporlanır, uydurulmaz.
//  • Hesabı belirsiz kalem HİÇBİR hesaba atanmaz (yanlış hesabı gerçekte olmadığı kadar eksiye düşürür); yalnız ŞİRKET
//    toplamından düşülür. Çift düşmemek için yalnız en son bakiye girilen günden SONRAKİ kalemler sayılır.
// Sonuç TAHMİNİdir (measured=false); haftalık gerçek bakiye girişi yine istenir (health.ts).

export type RfAccount = { name: string; balanceTry: number | null; lastUpdatedAt: string };
/** reason: banka neden bilinmiyor (takvimde boş, sözlükte yok, sözlükte ölçülmedi) — rapora aynen geçer. */
export type RfMovement = { date: string; bank: string | null; amountTry: number; settled: boolean; label: string; reason?: string };
export type RfResult = {
  accounts: { name: string; anchorTry: number; anchorDate: string; netTry: number; projectedTry: number; movements: number }[];
  unmapped: { label: string; bank: string | null; amountTry: number; reason: string }[];
  /** Hesabı belirsiz kalemlerin net toplamı: hesaplara değil yalnız şirket toplamına yansır. */
  unassignedTry: number;
  /** anchorTotalTry: son girilen bakiyeler · accountsProjectedTry: hesap bazında ileri taşınan toplam ·
   *  projectedTotalTry: şirket toplamı = hesaplar + hesabı belirsiz kalemler. */
  anchorTotalTry: number; accountsProjectedTry: number; projectedTotalTry: number;
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
    if (!row) {
      if (m.date > maxAnchor(rows)) unmapped.push({ label: m.label, bank: m.bank, amountTry: m.amountTry,
        reason: m.reason ?? (m.bank ? `hesap bulunamadı: ${m.bank}` : "takvimde banka yok") });
      continue;
    }
    if (m.date <= row.anchorDate) continue; // bakiye girildiği günün ve öncesinin kalemleri bakiyede
    row.netTry += m.amountTry; row.projectedTry += m.amountTry; row.movements++;
  }
  const list = [...rows.values()].map(r => ({ ...r, netTry: round(r.netTry), projectedTry: round(r.projectedTry) }));
  const accountsProjectedTry = round(list.reduce((s, r) => s + r.projectedTry, 0)), unassignedTry = round(unmapped.reduce((s, u) => s + u.amountTry, 0));
  return { accounts: list, unmapped, unassignedTry, anchorTotalTry: round(list.reduce((s, r) => s + r.anchorTry, 0)), accountsProjectedTry,
    projectedTotalTry: round(accountsProjectedTry + unassignedTry) };
}
const round = (n: number) => Math.round(n * 100) / 100;
/** En son bakiye girilen gün: ondan önceki hesabı belirsiz kalemin, hangi hesaptan çıktıysa o bakiyede olduğu varsayılır. */
const maxAnchor = (rows: Map<string, { anchorDate: string }>) => [...rows.values()].reduce((m, r) => (r.anchorDate > m ? r.anchorDate : m), "0000-01-01");

/** Salt-okunur yükleyici: hesaplar + son 45 günün takvim kalemleri + kanal → banka (cfo_kanal_sozluk). */
export async function loadBankRollForward(db: ReadSource, today: string): Promise<RfResult | null> {
  const present = new Set((await db.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema='public'
    and table_name = any($1::text[])`, ["cfo_bank_account", "cfo_cash_event", "cfo_receivable", "cfo_kanal_sozluk"])).map(r => r.name));
  if (!present.has("cfo_bank_account") || !present.has("cfo_cash_event")) return null;
  const accounts = (await db.query(`select name, "balanceTry" as b, "lastUpdatedAt" as u from cfo_bank_account where "isActive"`))
    .map(r => ({ name: String(r.name), balanceTry: r.b == null ? null : Number(r.b), lastUpdatedAt: new Date(String(r.u)).toISOString() }));
  const events = (await db.query(`select "eventDate"::date::text as d, bank, coalesce("inflowTry",0)::float8 - coalesce("outflowTry",0)::float8 as amt, coalesce("isSettled",false) as s,
      coalesce(description, kind::text) as l from cfo_cash_event where "eventDate"::date >= $1::text::date - 45 and "eventDate"::date <= $1::text::date`, today))
    .map(r => ({ date: String(r.d), bank: r.bank == null ? null : String(r.bank), amountTry: Number(r.amt), settled: r.s === true, label: String(r.l ?? "") }));
  const dict = present.has("cfo_kanal_sozluk");
  const receivables = present.has("cfo_receivable") ? (await db.query(`select r."dueDate"::date::text as d, r.channel, r."amountTry"::float8 as amt, coalesce(r."isCollected",false) as s,
      ${dict ? `k.banka as bank, k.yazim is not null as known, k.guven` : "null::text as bank, false as known, null::text as guven"}
      from cfo_receivable r ${dict ? `left join cfo_kanal_sozluk k on k.yazim = r.channel` : ""}
      where r."dueDate"::date >= $1::text::date - 45 and r."dueDate"::date <= $1::text::date`, today))
    .map(r => ({ date: String(r.d), bank: r.bank == null ? null : String(r.bank), amountTry: Number(r.amt), settled: r.s === true, label: `${r.channel} hakediş`,
      ...(r.bank == null ? { reason: !dict ? "kanal sözlüğü yok" : r.known !== true ? `sözlükte yok: ${r.channel}` : `sözlükte banka ölçülmedi (${r.guven ?? "?"})` } : {}) })) : [];
  return rollForwardBalances(accounts, [...events, ...receivables], today);
}
