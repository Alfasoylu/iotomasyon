import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// Panelde olup CFO'nun hiç okumadığı finans defterleri (2026-10-07 panel taraması, "CFO tüm veriye hakim olsun"):
//   · Trendyol fatura + hakediş (trendyol_invoice / trendyol_settlement_line — /marketplace/trendyol/finans yüklemesi): ayın kesinti
//     dökümü (komisyon, kargo, hizmet, ceza, reklam), kesinti oranı, iade ve ceza. Pazar yeri reklam harcamasının tek kaydı burada.
//   · Banka hareketleri (cfo_banka_hareket — ekstre yüklemesi): banka başına son 30 gün giriş/çıkış ve son hareket tarihi.
//   · Teklifler (Quote): açık teklif sayısı/tutarı ve süresi geçmiş olanlar.
// Hepsi yükleme bazlıdır → tazelik kanıtın ölçülmüşlüğünü belirler (bayat yükleme ölçüm sayılmaz). Oranlar burada deterministik
// hesaplanır; model hesap yapmaz. Müşteri adı / açıklama / karşı taraf okunmaz. Salt-okunur.

export const TRENDYOL_FINANCE_STALE_DAYS = 14;
export const BANK_LEDGER_STALE_DAYS = 10;
const days = (from: string | null, at: string) => (from ? Math.floor((new Date(at).getTime() - new Date(from).getTime()) / 86400000) : null);
const r0 = (v: number) => Math.round(v);

export type TrendyolFinanceAgg = {
  lastImport: string | null; lastInvoice: string | null;
  /** son TAM ay (YYYY-MM): son fatura ayından bir önceki ay */
  month: string | null;
  expenseByGroup: { group: string; expenseTry: number }[];
  monthSalesTry: number | null;
  returns90Try: number | null; sales90Try: number | null;
  penalties90: { n: number; try: number };
};

export function trendyolFinanceEvidence(a: TrendyolFinanceAgg, at: string): Evidence[] {
  const age = days(a.lastImport, at);
  const fresh = age != null && age <= TRENDYOL_FINANCE_STALE_DAYS;
  const src = "trendyol_invoice";
  const out: Evidence[] = [evidence("trendyol_finance_import", "trendyol_finans.yukleme (fatura/hakediş dosyası, /marketplace/trendyol/finans)",
    a.lastImport ? `son yükleme ${a.lastImport.slice(0, 10)} (${age} gün)${fresh ? "" : " — BAYAT, yeni dosya yüklenmeli"} · son fatura ${a.lastInvoice?.slice(0, 10) ?? "yok"}` : "hiç yükleme yok",
    "state", at, fresh)];
  if (!a.month) return out;
  const total = a.expenseByGroup.reduce((s, g) => s + g.expenseTry, 0);
  for (const g of a.expenseByGroup.filter(x => x.expenseTry > 0))
    out.push(evidence(src, `trendyol_finans.${a.month}.kesinti_${g.group.toLowerCase()}_try`, r0(g.expenseTry), "TRY", at, fresh));
  out.push(evidence(src, `trendyol_finans.${a.month}.kesinti_toplam_try`, r0(total), "TRY", at, fresh));
  if (a.monthSalesTry && a.monthSalesTry > 0) {
    out.push(evidence("trendyol_settlement_line", `trendyol_finans.${a.month}.satis_brut_try (hakediş "Satış")`, r0(a.monthSalesTry), "TRY", at, fresh));
    out.push(evidence(src, `trendyol_finans.${a.month}.kesinti_orani_pct (kesinti toplamı / brüt satış)`, Math.round((total / a.monthSalesTry) * 1000) / 10, "pct", at, fresh));
  }
  if (a.sales90Try && a.sales90Try > 0 && a.returns90Try != null)
    out.push(evidence("trendyol_settlement_line", "trendyol_finans.iade_orani_son_90_gun_pct (iade / brüt satış)", Math.round((a.returns90Try / a.sales90Try) * 1000) / 10, "pct", at, fresh));
  if (a.penalties90.n > 0)
    out.push(evidence(src, "trendyol_finans.ceza_son_90_gun_try", r0(a.penalties90.try), "TRY", at, fresh),
      evidence(src, "trendyol_finans.ceza_son_90_gun_adet", a.penalties90.n, "count", at, fresh));
  return out;
}

export type BankLedgerRow = { bank: string; lastDate: string | null; in30: number; out30: number };
export function bankLedgerEvidence(rows: BankLedgerRow[], at: string): Evidence[] {
  const out: Evidence[] = [];
  for (const r of rows) {
    const age = days(r.lastDate, at), fresh = age != null && age <= BANK_LEDGER_STALE_DAYS;
    const k = `banka_hareket.${r.bank}`;
    out.push(evidence("cfo_banka_hareket", `${k}.son_hareket (ekstre)`, `${r.lastDate ?? "yok"}${fresh ? "" : " — BAYAT, ekstre yüklenmeli"}`, "date", at, fresh));
    out.push(evidence("cfo_banka_hareket", `${k}.giris_son_30_gun_try`, r0(r.in30), "TRY", at, fresh));
    out.push(evidence("cfo_banka_hareket", `${k}.cikis_son_30_gun_try`, r0(r.out30), "TRY", at, fresh));
  }
  return out;
}

export type QuoteAgg = { open: number; openTry: number; expired: number; oldest: string | null };
export function quoteEvidence(q: QuoteAgg, at: string): Evidence[] {
  if (q.open === 0) return [evidence("Quote", "teklif.acik (taslak + gönderilmiş)", 0, "count", at, true)];
  return [
    evidence("Quote", "teklif.acik (taslak + gönderilmiş)", q.open, "count", at, true),
    evidence("Quote", "teklif.acik_tutar_try", r0(q.openTry), "TRY", at, true),
    evidence("Quote", "teklif.suresi_gecmis_acik", q.expired, "count", at, true),
    evidence("Quote", "teklif.en_eski_acik", q.oldest?.slice(0, 10) ?? "bilinmiyor", "date", at, true),
  ];
}

async function present(db: ReadSource, names: string[]) {
  return new Set((await db.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema='public' and table_name = any($1::text[])`, names)).map(r => r.name));
}
const iso = (v: unknown) => (v == null ? null : new Date(String(v)).toISOString());
const n = (v: unknown) => (v == null ? null : Number(v));

export async function loadTrendyolFinance(db: ReadSource, at: string): Promise<Evidence[]> {
  const p = await present(db, ["trendyol_invoice", "trendyol_settlement_line", "trendyol_finance_import"]);
  if (!p.has("trendyol_invoice") || !p.has("trendyol_settlement_line")) return [];
  const [h] = await db.query(`select (select max("importedAt") from trendyol_finance_import where ok) as last_import,
      (select max("invoiceDate") from trendyol_invoice) as last_invoice,
      to_char(date_trunc('month', (select max("invoiceDate") from trendyol_invoice)) - interval '1 month', 'YYYY-MM') as month`);
  const month = h?.month ? String(h.month) : null;
  const groups = month ? await db.query(`select "costGroup"::text as g, coalesce(sum("expenseTry"),0)::float8 as e from trendyol_invoice
      where to_char("invoiceDate", 'YYYY-MM') = $1 group by 1 order by 2 desc`, month) : [];
  const [s] = await db.query(`select
      (select sum("totalTry") from trendyol_settlement_line where "transactionType"='Satış' and to_char("transactionDate",'YYYY-MM') = $1)::float8 as month_sales,
      (select sum("totalTry") from trendyol_settlement_line where "transactionType"='Satış' and "transactionDate" > $2::timestamptz - interval '90 days')::float8 as sales90,
      (select -sum("totalTry") from trendyol_settlement_line where "transactionType"='İade' and "transactionDate" > $2::timestamptz - interval '90 days')::float8 as returns90,
      (select count(*) from trendyol_invoice where "costGroup"::text='CEZA' and "invoiceDate" > $2::timestamptz - interval '90 days')::int as pen_n,
      (select coalesce(sum("expenseTry"),0) from trendyol_invoice where "costGroup"::text='CEZA' and "invoiceDate" > $2::timestamptz - interval '90 days')::float8 as pen_try`, month ?? "", at);
  return trendyolFinanceEvidence({
    lastImport: iso(h?.last_import), lastInvoice: iso(h?.last_invoice), month,
    expenseByGroup: groups.map(g => ({ group: String(g.g), expenseTry: Number(g.e) })),
    monthSalesTry: n(s?.month_sales), sales90Try: n(s?.sales90), returns90Try: n(s?.returns90),
    penalties90: { n: Number(s?.pen_n ?? 0), try: Number(s?.pen_try ?? 0) },
  }, at);
}

export async function loadBankLedger(db: ReadSource, at: string): Promise<Evidence[]> {
  if (!(await present(db, ["cfo_banka_hareket"])).has("cfo_banka_hareket")) return [];
  const rows = await db.query(`select banka, max(tarih)::text as last,
      coalesce(sum(tutar_try) filter (where tutar_try > 0 and tarih > $1::timestamptz::date - 30),0)::float8 as in30,
      coalesce(-sum(tutar_try) filter (where tutar_try < 0 and tarih > $1::timestamptz::date - 30),0)::float8 as out30
    from cfo_banka_hareket group by banka order by banka limit 8`, at);
  return bankLedgerEvidence(rows.map(r => ({ bank: String(r.banka), lastDate: r.last ? String(r.last) : null, in30: Number(r.in30), out30: Number(r.out30) })), at);
}

export async function loadQuotes(db: ReadSource, at: string): Promise<Evidence[]> {
  if (!(await present(db, ["Quote"])).has("Quote")) return [];
  const [q] = await db.query(`select count(*)::int as open, coalesce(sum(total),0)::float8 as open_try,
      count(*) filter (where "validityDate" < $1::timestamptz)::int as expired, min("createdAt") as oldest
    from "Quote" where status::text in ('DRAFT','SENT')`, at);
  return quoteEvidence({ open: Number(q?.open ?? 0), openTry: Number(q?.open_try ?? 0), expired: Number(q?.expired ?? 0), oldest: iso(q?.oldest) }, at);
}
