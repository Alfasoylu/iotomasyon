import "server-only";
import { silencedRules } from "./anomalies";
import { loadBankRollForward } from "./bank-rollforward";
import { loadImportRevenue } from "./import-revenue";
import { loadAlfashomeSales } from "./alfashome-sales";
import { loadCapitalConfig } from "./capital-config";
import { loadBankLedger, loadQuotes, loadTrendyolFinance } from "./finance-ledgers";
import { loadCapitalEvidence } from "./capital-evidence";
import { loadVoiEvidence } from "./voi-evidence";
import { loadDecisionMemoryEvidence, loadGoalAttributionEvidence } from "./decision-memory-evidence";
import { loadRevenueEvidence } from "./revenue-evidence";
import { loadDownsideEvidence } from "./downside-evidence";
import type { CfoConfig } from "./config";
import { evidence } from "./evidence";
import { businessSource, type ReadSource } from "./sources";
import type { CfoAgentSnapshot, Evidence } from "./types";

// CFO bağlamı: Blok B (bugünün durumu) + Blok C (hafıza) ve Blok A tablo eki — 2026-10-07 girdi şartnamesi §3.
// 2026-10-08'den beri LLM'e gitmez: Blok B satırları deterministik motorun METRIK satırlarıdır (cfo_gun_ozeti, Cowork CFO okur).
// Her satır bir kanıttır (id'li). Her kaynak önce varlığı
// kontrol edilerek okunur (eksik görünüm/fonksiyon koşuyu düşürmez, o bölüm atlanır). Müşteri alanı okunmaz.

export type CfoContext = { tables: string; state: Evidence[]; memory: Evidence[] };

const LOG_LIMIT = 20, QUESTION_LIMIT = 10, RUN_LIMIT = 3, TEXT = 160;
const clip = (v: unknown, n = TEXT) => (v == null ? null : String(v).replace(/\s+/g, " ").trim().slice(0, n));
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
/** A4 dip bandı: dip gününe kalan süreye göre gerçekleşme bandı; 35 günden uzaksa uygulanmaz. */
export function dipBand(days: number | null): string {
  if (days == null) return "bilinmiyor";
  return days <= 14 ? "~%100" : days <= 25 ? "%60–95" : days <= 35 ? "%20–50" : "uygulanmaz (>35 gün)";
}

export async function loadCfoContext(snapshot: CfoAgentSnapshot, config: CfoConfig, db: ReadSource = businessSource): Promise<CfoContext> {
  const at = snapshot.generatedAt;
  const names = new Set((await db.query<{ name: string }>(`select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname = any($1::text[]) union select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = any($1::text[])`, ["cfo_nakit_kapisi", "cfo_kaynak_yeterliligi", "cfo_odeme_gunluk", "cfo_servet", "fm_balance_day",
      "fm_goal_observation", "cfo_change_log", "cfo_question", "cfo_run", "cfo_kargo_tarife", "cfo_kanal_net_oran", "cfo_kaldirac_basamak"])).map(r => r.name));
  const state: Evidence[] = [], memory: Evidence[] = [];
  const s = (source: string, query: string, value: Evidence["value"], unit: string, measured = true, asOf = at) => state.push(evidence(source, query, value, unit, asOf, measured));

  // B1 — nakit kapısı
  if (names.has("cfo_nakit_kapisi")) {
    const [k] = await db.query(`select * from cfo_nakit_kapisi limit 1`);
    if (k) for (const key of ["nakit_try", "girecek_10g", "cikacak_10g", "bos_kmh_try", "amacli_kmh_try", "vadesi_gecmis_alacak_try"]) if (key in k) s("cfo_nakit_kapisi", `nakit_kapisi.${key}`, num(k[key]), "TRY");
  }
  // B2 — fon ihtiyacı ↔ kaynak ↔ açık
  if (names.has("cfo_kaynak_yeterliligi")) {
    for (const r of await db.query(`select kalem, tutar, aciklama from cfo_kaynak_yeterliligi()`))
      s("cfo_kaynak_yeterliligi", `kaynak.${clip(r.kalem, 60)}${r.aciklama ? ` (${clip(r.aciklama, 80)})` : ""}`, num(r.tutar), "TRY");
  }
  // B3 — yakın dip (≤35 gün, bant uygulanır) + uzak dip (>35 gün, bant uygulanmaz) ayrı
  if (names.has("cfo_odeme_gunluk")) {
    const dips = await db.query(`select 'yakin' as hangi, d.* from (select tarih_str, kalan_gun, gun_ici_dip from cfo_odeme_gunluk where kalan_gun between 0 and 35 order by gun_ici_dip asc nulls last limit 1) d
      union all select 'uzak', u.* from (select tarih_str, kalan_gun, gun_ici_dip from cfo_odeme_gunluk where kalan_gun > 35 order by gun_ici_dip asc nulls last limit 1) u`);
    for (const d of dips) {
      const days = num(d.kalan_gun);
      s("cfo_odeme_gunluk", `dip.${d.hangi}.tutar`, num(d.gun_ici_dip), "TRY", false);
      s("cfo_odeme_gunluk", `dip.${d.hangi}.tarih`, clip(d.tarih_str, 20), "date", false);
      s("cfo_odeme_gunluk", `dip.${d.hangi}.kalan_gun`, days, "days", false);
      s("cfo_odeme_gunluk", `dip.${d.hangi}.gerceklesme_bandi`, dipBand(days), "band", false);
    }
  }
  // B4 — servet iki türlü (A7): geniş (varlık − borç) ↔ dar (net sermaye), ikisi etiketli
  if (names.has("cfo_servet")) {
    const [w] = await db.query(`select servet_try, servet_usd, kur from cfo_servet limit 1`);
    if (w) { s("cfo_servet", "servet.genis_try (varlık − borç)", num(w.servet_try), "TRY"); s("cfo_servet", "servet.genis_usd", num(w.servet_usd), "USD"); s("cfo_servet", "servet.kur", num(w.kur), "TRY/USD"); }
  }
  if (names.has("fm_balance_day")) {
    const [b] = await db.query(`select economic_date::text as d, value_try from fm_balance_day where metric_key='net_capital_try' order by economic_date desc limit 1`);
    if (b) s("fm_balance_day", "servet.dar_try (net sermaye)", num(b.value_try), "TRY", true, String(b.d));
  }
  // B4b — banka bakiyesi ileri taşıma (haftalık bakiye + tarihi geçmiş takvim kalemleri; TAHMİNİ)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(at));
  const rf = await loadBankRollForward(db, today);
  if (rf) {
    s("cfo_bank_account", "banka.son_girilen_toplam_try", rf.anchorTotalTry, "TRY");
    s("cfo_cash_event", "banka.ileri_tasinan_toplam_try (şirket: hesaplar + hesabı belirsiz kalemler)", rf.projectedTotalTry, "TRY", false);
    for (const a of rf.accounts.filter(x => x.movements > 0))
      s("cfo_cash_event", `banka.${a.name}.ileri_tasinan_try (bakiye ${a.anchorDate} + ${a.movements} kalem)`, a.projectedTry, "TRY", false);
    if (rf.unmapped.length) {
      // Hesabı belirsiz: hiçbir hesaba atanmadı, yalnız şirket toplamından düşüldü. Bayat bakiye kullanılmış KMH'yi göstermez (§7).
      s("cfo_cash_event", "banka.hesabi_belirsiz_try (hiçbir hesaba atanmadı, şirket toplamından düşüldü)", rf.unassignedTry, "TRY", false);
      s("cfo_cash_event", "banka.eslenmeyen_kalemler", `${rf.unmapped.length} kalem: ${rf.unmapped.slice(0, 5).map(u => `${clip(u.label, 50)} ${Math.round(u.amountTry)} TRY — ${u.reason}`).join("; ")}`, "text", false);
    }
  }
  // B4c — kaldıraç merdiveni (§2E): hangi basamak kullanımda / boşta / bilinçli tutuluyor. BILINCLI_TUTULUYOR önerilmez.
  if (names.has("cfo_kaldirac_basamak")) {
    for (const b of await db.query(`select basamak, ad, durum, tl_kapasite, tl_maliyet, guven, note from cfo_kaldirac_basamak order by basamak`)) {
      const key = `merdiven.${b.basamak}.${clip(b.ad, 40)}`, measured = b.guven === "OLCULDU" || b.guven === "KESIN";
      s("cfo_kaldirac_basamak", `${key}.durum`, `${b.durum}${b.durum === "BILINCLI_TUTULUYOR" ? " (ÖNERME)" : ""}${b.note ? ` — ${clip(b.note)}` : ""}`, "state", measured);
      if (num(b.tl_kapasite) != null) s("cfo_kaldirac_basamak", `${key}.kapasite_try`, num(b.tl_kapasite), "TRY", measured);
      if (num(b.tl_maliyet) != null) s("cfo_kaldirac_basamak", `${key}.maliyet_try`, num(b.tl_maliyet), "TRY", measured);
    }
  }
  // B4d — gelecek ithalatın beklenen cirosu/kârı ve konteynerdeki yeni ürünler (TAHMİNİ; 2026-10-07)
  state.push(...await loadImportRevenue(db, at));
  // B4e — ALFASHOME kanalı (Entegra'da yok; sipariş toplamı bazlı ciro)
  state.push(...await loadAlfashomeSales(db, at));
  // B4f — sermaye ayarı (/admin/sermaye): elle girilen toplam sermaye çerçevesi + stokta bağlı + kullanılabilir
  state.push(...await loadCapitalConfig(db, at));
  // B4g — panelde olup CFO'nun okumadığı defterler: Trendyol fatura/hakediş (kesinti dökümü, reklam, ceza, iade), banka
  // hareketleri (ekstre), açık teklifler. Yükleme bazlı → tazelik ölçülmüşlüğü belirler.
  state.push(...await loadTrendyolFinance(db, at), ...await loadBankLedger(db, at), ...await loadQuotes(db, at));
  // B4h — sermaye verimliliği: borç eşiğine göre SKU sınıfları, değer kaybı, açığa çıkarılabilir nakit, tahsis planı (deterministik)
  state.push(...await loadCapitalEvidence(db, at));
  // B4i — bilgi değeri: hangi bilinmeyen en çok TL'lik kararı değiştirir; düşük değerliler sorulmaz (deterministik)
  state.push(...await loadVoiEvidence(db, at));
  // B4j — karar hafızası: geçmiş stratejik kararlar veriyle ölçülür (ters yön / geride / kalibrasyon)
  state.push(...await loadDecisionMemoryEvidence(db, at));
  // B4k — hedef açığı atfı: bildirilen net sermaye ↔ operasyonel (stok değerleme hariç) değişim ve hedef hızı
  state.push(...await loadGoalAttributionEvidence(db, at));
  // B4l — ciro hedefine giden yol: açık ve gelir kaldıraçları (batık sermayeyi çalıştıran önce)
  state.push(...await loadRevenueEvidence(db, at));
  // B4m — aşağı yön: KMH faizi dahil nakit dibi, makul stres, emniyet payı, en zararlı şok (deterministik)
  state.push(...await loadDownsideEvidence(db, at));
  // B5 — hedef notları (son gözlem)
  if (names.has("fm_goal_observation")) {
    for (const g of await db.query(`select distinct on (goal_key) goal_key, state, grade, gap_try, current_rate_try_per_day, required_rate_try_per_day, as_of::text as as_of
      from fm_goal_observation order by goal_key, evaluated_at desc limit 8`)) {
      s("fm_goal_observation", `hedef.${g.goal_key}.durum`, `${g.state}/${g.grade ?? "?"}`, "state", false, String(g.as_of));
      s("fm_goal_observation", `hedef.${g.goal_key}.acik_try`, num(g.gap_try), "TRY", false, String(g.as_of));
      s("fm_goal_observation", `hedef.${g.goal_key}.gereken_hiz_try_gun`, num(g.required_rate_try_per_day), "TRY/day", false, String(g.as_of));
      s("fm_goal_observation", `hedef.${g.goal_key}.mevcut_hiz_try_gun`, num(g.current_rate_try_per_day), "TRY/day", false, String(g.as_of));
    }
  }
  // B6 — veri tazeliği ve bu yüzden SUSAN kurallar
  const stale = snapshot.dataQuality.sourceWatermarks.filter(w => w.stale).map(w => `${w.source} (son: ${w.syncedAt?.slice(0, 10) ?? "yok"})`);
  s("snapshot", "tazelik.bayat_kaynaklar", stale.join(", ") || "yok", "state");
  s("snapshot", "tazelik.susan_kurallar", silencedRules(snapshot, config).join(" | ") || "yok", "state");

  // C1 — defter (dün ne ölçüldü, neye karar verildi)
  const m = (source: string, query: string, value: Evidence["value"], asOf: string) => memory.push(evidence(source, query, value, "text", asOf, true));
  if (names.has("cfo_change_log")) {
    for (const r of await db.query(`select id, area, kind, item, "newValue", "changedAt" from cfo_change_log order by "changedAt" desc limit ${LOG_LIMIT}`))
      m("cfo_change_log", `defter.${r.id}.${r.area}/${r.kind}: ${clip(r.item, 70)}`, clip(r.newValue), new Date(String(r.changedAt)).toISOString());
  }
  // C2 — açık P1 sorular (Alperen'de bekleyen şeyi önerme)
  if (names.has("cfo_question")) {
    for (const q of await db.query(`select id, code, question, "askedAt" from cfo_question where priority=1 and status='ACIK' order by "askedAt" desc limit ${QUESTION_LIMIT}`))
      m("cfo_question", `soru.${q.code ?? q.id}`, clip(q.question), new Date(String(q.askedAt)).toISOString());
  }
  // C3 — kendi son koşuları
  if (names.has("cfo_run")) {
    for (const r of await db.query(`select type, status, error, "generatedAt" from cfo_run where status <> 'running' order by "generatedAt" desc limit ${RUN_LIMIT}`))
      m("cfo_run", `kosu.${new Date(String(r.generatedAt)).toISOString().slice(0, 16)}.${r.type}`, `${r.status}${r.error ? ` (${clip(r.error, 80)})` : ""}`, new Date(String(r.generatedAt)).toISOString());
  }

  // Blok A eki — tek kaynaktan okunan tablolar (kopyalanmaz). Sıra sabit: önbellek öneki her koşuda aynı kalsın.
  const tables: string[] = [];
  if (names.has("cfo_kargo_tarife")) {
    const rows = await db.query(`select pazaryeri, band, alt_sinir, ust_sinir, toplam, gecerli_tarih::text as g from cfo_kargo_tarife order by pazaryeri, alt_sinir nulls first, band`);
    if (rows.length) tables.push(`KARGO TARİFESİ (cfo_kargo_tarife): ${rows.map(r => `${r.pazaryeri} ${r.band} [${r.alt_sinir ?? "-"}–${r.ust_sinir ?? "-"}] ${r.toplam} TL (${r.g ?? "?"})`).join(" · ")}`);
  }
  if (names.has("cfo_kanal_net_oran")) {
    const rows = await db.query(`select channel, net_oran, guven, kargo_payi from cfo_kanal_net_oran order by channel`);
    if (rows.length) tables.push(`KANAL NET ORAN (cfo_kanal_net_oran): ${rows.map(r => `${r.channel} ${r.net_oran} (güven ${r.guven ?? "?"}${r.kargo_payi != null ? `, kargo payı ${r.kargo_payi}` : ""})`).join(" · ")}`);
  }
  const coverage = snapshot.dataQuality.commissionCoverage;
  if (coverage?.length) tables.push(`KOMİSYON ALANI KAPSAMI: ${coverage.map(c => `${c.channel} %${c.coveragePct == null ? "?" : Math.round(c.coveragePct)}`).join(" · ")}`);
  return { tables: tables.join("\n"), state, memory };
}
