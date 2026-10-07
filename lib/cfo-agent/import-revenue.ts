import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// Gelecek ithalatın beklenen cirosu (2026-10-07 panel taraması): beklenen ciro/kâr üç yerde duruyordu ama hiçbir CFO
// hesabı kullanmıyordu — cfo_import_project.expected* (proje), urun_aday.satis_try × adet (konteynerdeki yeni ürünler,
// çoğu katalogda henüz yok). Bu modül onları CFO'nun okuyabileceği KANIT'a çevirir; hepsi TAHMİNİDİR (plan, ölçüm değil).
// Aylık katkı = beklenen ciro / satış ayı (proje kendi varsayımı); varıştan önce katkı yok. Salt-okunur.

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const day = (v: unknown) => (v == null ? null : new Date(String(v)).toISOString().slice(0, 10));

export type ImportProjectRow = { code: string; status: string; eta: string | null; revenue: number | null; profit: number | null; months: number | null; tag: string };
/** Açık projeler varış sırasına göre; ciro/kâr/aylık katkı ayrı kanıt. */
export function importProjectEvidence(rows: ImportProjectRow[], at: string): Evidence[] {
  const out: Evidence[] = [];
  for (const r of rows) {
    const k = `ithalat.${r.code}`;
    // Varış tarihi geçmiş ama hâlâ YOLDA/PLANLANDI → kayıt bayat (07.10: 07.26sea varış 05.10, durum YOLDA).
    const overdue = r.eta != null && r.eta < at.slice(0, 10) && (r.status === "YOLDA" || r.status === "PLANLANDI");
    out.push(evidence("cfo_import_project", `${k}.durum`, `${r.status} · varış ${r.eta ?? "bilinmiyor"}${overdue ? " (varış tarihi geçti — durum güncellenmeli)" : ""} · veri ${r.tag}`, "state", at, r.tag === "KESIN" && !overdue));
    if (r.revenue != null) out.push(evidence("cfo_import_project", `${k}.beklenen_ciro_try`, r.revenue, "TRY", at, false));
    if (r.profit != null) out.push(evidence("cfo_import_project", `${k}.beklenen_kar_try`, r.profit, "TRY", at, false));
    if (r.revenue != null && r.months != null && r.months > 0)
      out.push(evidence("cfo_import_project", `${k}.aylik_ciro_katkisi_try (beklenen ciro / ${r.months} ay, varıştan sonra)`, Math.round(r.revenue / r.months), "TRY/month", at, false));
  }
  const total = rows.reduce((s, r) => s + (r.revenue ?? 0), 0);
  if (rows.some(r => r.revenue != null)) out.push(evidence("cfo_import_project", "ithalat.toplam_beklenen_ciro_try (açık projeler)", Math.round(total), "TRY", at, false));
  return out;
}

export async function loadImportRevenue(db: ReadSource, at: string): Promise<Evidence[]> {
  const present = new Set((await db.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema='public'
    and table_name = any($1::text[])`, ["cfo_import_project", "urun_aday", "cfo_yoldaki_kalem"])).map(r => r.name));
  const out: Evidence[] = [];
  if (present.has("cfo_import_project")) {
    const rows = await db.query(`select code, status::text as status, "etaDate" as eta, "expectedRevenueTry" as rev, "expectedProfitTry" as profit,
      "salesMonths" as months, "dataTag"::text as tag from cfo_import_project where status::text not in ('TESLIM_ALINDI','IPTAL')
      order by "etaDate" asc nulls last, code limit 6`);
    out.push(...importProjectEvidence(rows.map(r => ({ code: String(r.code), status: String(r.status), eta: day(r.eta), revenue: num(r.rev), profit: num(r.profit),
      months: num(r.months), tag: String(r.tag ?? "TAHMINI") })), at));
  }
  if (present.has("urun_aday")) {
    // Konteynerdeki yeni ürünler: liste fiyatıyla brüt değer (ciro değil — satış hızı bilinmiyor) ve katalogda olmayan sayısı.
    const [u] = await db.query(`select count(*)::int as n, coalesce(sum(u.satis_try * u.adet),0)::float8 as gross, coalesce(sum(u.adet),0)::int as qty,
      count(*) filter (where not exists (select 1 from "Product" p where lower(p.sku) = lower(u.sku)))::int as not_in_catalog
      from urun_aday u where u.durum in ('TASLAK','HAZIR')`);
    if (u && Number(u.n) > 0) {
      out.push(evidence("urun_aday", "ithalat.yeni_urun.liste_fiyatli_brut_try (satis_try × adet; ciro değil, hız bilinmiyor)", Math.round(Number(u.gross)), "TRY", at, false));
      out.push(evidence("urun_aday", "ithalat.yeni_urun.katalogda_olmayan (listelenmeden satılamaz)", `${u.not_in_catalog}/${u.n} ürün, ${u.qty} adet`, "text", at, true));
    }
  }
  return out;
}
