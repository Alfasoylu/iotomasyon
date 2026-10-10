// DECISION MEMORY — beklenen ↔ gerçekleşen (SAF, deterministik; 2026-10-07 CFO yol haritası #3).
// cfo_hamle defteri (CFO'nun stratejik kararları: başlangıç, beklenen etki, ölçüm metriği, ilk ölçüm tarihi) vardı ama uygulama
// hiç okumuyordu → hiçbir karar otomatik ölçülmüyordu. Bu modül her kararın metriğini veriden çözer, başlangıçtan bu yana
// ilerlemeyi hedefe giden doğrusal yolla karşılaştırır ve kapanmış kararlarda isabeti (kalibrasyon) ölçer. Ölçülemeyen UNKNOWN kalır.

export type MetricKey = "debt_try" | "card_kmh_try" | "card_try" | "personal_card_try" | "kamu_monthly_try" | "fba_90d_try";
export const METRIC_LABEL: Record<MetricKey, string> = {
  debt_try: "toplam borç (fm_balance_day)", card_kmh_try: "kart + şirket KMH borcu", card_try: "kart borcu (aktif kartlar)",
  personal_card_try: "şahsi kart borcu (Alp kartları)", kamu_monthly_try: "kamu/kurumsal tahsilat, son 30 gün", fba_90d_try: "Amazon FBA cirosu, son 90 gün",
};
/** Borç metriklerinde düşük iyidir; ciro metriklerinde yüksek. */
export const LOWER_IS_BETTER: Record<MetricKey, boolean> = {
  debt_try: true, card_kmh_try: true, card_try: true, personal_card_try: true, kamu_monthly_try: false, fba_90d_try: false,
};

/** CFO-012 (2026-10-10): bu tarihten itibaren kaydedilen açık hamlede ölçülebilir metrik + başlangıç + beklenen SAYI + tarih zorunlu. */
export const EXPECTATION_REQUIRED_FROM = "2026-10-10";

const fold = (s: string) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

/** Ölçüm metriği metninden veri anahtarı (sıra önemli: özel olan önce). Eşleşmezse null → UNMEASURED. */
export function resolveMetric(text: string): MetricKey | null {
  // CFO-012: yeni hamleler metrik anahtarıyla başlar ("debt_try — net borç") → serbest metin yorumuna gerek kalmaz
  const key = text.trim().split(/[\s—:-]/)[0];
  if (Object.hasOwn(METRIC_LABEL, key)) return key as MetricKey;
  const t = fold(text);
  if (/fba/.test(t)) return "fba_90d_try";
  if (/kamu|kurumsal/.test(t)) return "kamu_monthly_try";
  if (/sahsi kart|akbank alp|garanti alp/.test(t)) return "personal_card_try";
  if (/kart\s*\+\s*kmh/.test(t)) return "card_kmh_try";
  if (/net borc|toplam borc/.test(t)) return "debt_try";
  if (/kart borcu/.test(t)) return "card_try";
  return null;
}

export type Hamle = {
  kod: string; baslik: string; kararTarihi: string; durum: string;
  baslangicMetrik: string | null; baslangicDeger: number | null;
  beklenenEtki: string | null; beklenenDeger: number | null;
  olcumMetrigi: string | null; ilkOlcumTarihi: string | null; gerceklesenDeger: number | null;
  /** kayıt anı (YYYY-MM-DD); CFO-012 kuralından önceki eski kayıtlar beklenen değersiz olabilir */
  createdAt?: string | null;
};
export type HamleStatus = "ACHIEVED" | "ON_TRACK" | "BEHIND" | "WRONG_DIRECTION" | "IMPROVING" | "WORSENING" | "NO_BASELINE" | "UNMEASURED" | "CLOSED"
  /** CFO-012: kural tarihinden sonra beklenen değer / başlangıç / ölçülebilir metrik olmadan kaydedilmiş karar */
  | "MISSING_EXPECTATION";
export type HamleEval = Hamle & {
  metric: MetricKey | null; current: number | null; deadline: string | null;
  /** hedefe doğru katedilen oran (0 = başlangıç, 1 = hedef); hedef yoksa null */
  progress: number | null; timeElapsed: number | null;
  /** hedefe yetişmek için gereken günlük değişim (TL/gün); hedef yoksa ya da süre geçtiyse null */
  requiredPerDay: number | null;
  status: HamleStatus; note: string;
  /** kapalı kararlarda tahmin hatası |gerçekleşen − beklenen| / |beklenen − başlangıç| */
  calibrationError: number | null;
};

const CLOSED = new Set(["SONUCLANDI", "GERI_ALINDI"]);
const day = (s: string) => new Date(s + "T00:00:00Z").getTime();
/** Beklenen etki metnindeki ilk gg.aa.yyyy tarihi (ör. "31.12.2026 net borç 6.000.000"), yoksa ilk ölçüm tarihi. */
export function deadlineOf(h: Hamle): string | null {
  const m = h.beklenenEtki?.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : h.ilkOlcumTarihi;
}

export function evaluateHamle(h: Hamle, current: number | null, today: string): HamleEval {
  const metric = resolveMetric(`${h.olcumMetrigi ?? ""} ${h.baslangicMetrik ?? ""}`);
  const deadline = deadlineOf(h);
  const base: HamleEval = { ...h, metric, current, deadline, progress: null, timeElapsed: null, requiredPerDay: null, status: "UNMEASURED", note: "", calibrationError: null };
  if (!CLOSED.has(h.durum) && h.createdAt != null && h.createdAt >= EXPECTATION_REQUIRED_FROM
      && (metric == null || h.baslangicDeger == null || h.beklenenDeger == null || deadline == null))
    return { ...base, status: "MISSING_EXPECTATION", note: `${EXPECTATION_REQUIRED_FROM} sonrası karar: ölçülebilir metrik, başlangıç, beklenen değer ve tarih zorunlu (CFO-012) — eksik kayıt` };
  if (CLOSED.has(h.durum)) {
    const err = h.beklenenDeger != null && h.gerceklesenDeger != null && h.baslangicDeger != null && h.beklenenDeger !== h.baslangicDeger
      ? Math.abs(h.gerceklesenDeger - h.beklenenDeger) / Math.abs(h.beklenenDeger - h.baslangicDeger) : null;
    return { ...base, status: "CLOSED", calibrationError: err,
      note: err == null ? "kapandı; beklenen SAYI girilmediği için isabet ölçülemez" : `kapandı; tahmin hatası %${Math.round(err * 100)}` };
  }
  if (metric == null) return { ...base, note: "ölçüm metriği veriyle eşleşmedi — elle ölçülüyor" };
  if (current == null) return { ...base, note: `${METRIC_LABEL[metric]} okunamadı` };
  if (h.baslangicDeger == null) return { ...base, status: "NO_BASELINE", note: `başlangıç değeri yok; şu an ${Math.round(current)}` };
  const lower = LOWER_IS_BETTER[metric];
  const moved = current - h.baslangicDeger;
  const good = lower ? moved < 0 : moved > 0;
  if (h.beklenenDeger == null)
    return { ...base, status: moved === 0 ? "WORSENING" : good ? "IMPROVING" : "WORSENING",
      note: `${moved === 0 ? "hiç değişmedi" : good ? "doğru yönde" : "TERS yönde"} (${Math.round(h.baslangicDeger)} → ${Math.round(current)}); hedef sayısı yok` };
  const span = h.beklenenDeger - h.baslangicDeger;
  const progress = span === 0 ? 1 : moved / span;
  const t0 = day(h.kararTarihi), tNow = day(today), tEnd = deadline ? day(deadline) : null;
  const timeElapsed = tEnd != null && tEnd > t0 ? Math.min(1, Math.max(0, (tNow - t0) / (tEnd - t0))) : null;
  const daysLeft = tEnd != null ? Math.round((tEnd - tNow) / 86400000) : null;
  const requiredPerDay = daysLeft != null && daysLeft > 0 ? (h.beklenenDeger - current) / daysLeft : null;
  const status: HamleStatus = progress >= 1 ? "ACHIEVED" : progress < 0 ? "WRONG_DIRECTION"
    : timeElapsed != null && progress < timeElapsed - 0.1 ? "BEHIND" : "ON_TRACK";
  return { ...base, progress, timeElapsed, requiredPerDay, status,
    note: `${Math.round(h.baslangicDeger)} → ${Math.round(current)} (hedef ${Math.round(h.beklenenDeger)}${deadline ? `, ${deadline}` : ""}): ilerleme %${Math.round(progress * 100)}`
      + (timeElapsed != null ? `, sürenin %${Math.round(timeElapsed * 100)}'i geçti` : "")
      + (requiredPerDay != null ? `; gereken ${Math.round(requiredPerDay)} TL/gün` : "") };
}

export type NewHamle = {
  kod: string; baslik: string; kararTarihi: string; alan: string; neden: string; yapilan: string;
  metric: MetricKey; baslangicDeger: number; beklenenDeger: number; ilkOlcumTarihi: string; beklenenEtki?: string | null; kaynak?: string | null;
};

/** Form sayısı: "6.000.000", "6000000", "1.234,5", "-12,5" → sayı; boş / geçersiz → NaN (0 sayılmaz). */
export function parseTrNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const t = String(v ?? "").replace(/\s/g, "");
  if (t === "") return NaN;
  const n = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : NaN;
}

/** Yeni karar kaydının defter satırı (CFO-012): olcum_metrigi metrik ANAHTARIYLA başlar → resolveMetric serbest metin yorumlamaz. */
export function newHamleRow(h: NewHamle) {
  const label = METRIC_LABEL[h.metric];
  return { kod: h.kod, baslik: h.baslik.trim(), karar_tarihi: h.kararTarihi, alan: h.alan.trim(), durum: "KARAR_VERILDI", neden: h.neden.trim(), yapilan: h.yapilan.trim(),
    baslangic_metrik: label, baslangic_deger: h.baslangicDeger, beklenen_deger: h.beklenenDeger, olcum_metrigi: `${h.metric} — ${label}`,
    beklenen_etki: h.beklenenEtki?.trim() || `${h.ilkOlcumTarihi.split("-").reverse().join(".")} ${label} ${h.beklenenDeger}`,
    ilk_olcum_tarihi: h.ilkOlcumTarihi, kaynak: h.kaynak?.trim() || null };
}

/** Yeni hamle doğrulaması (yazma yolu): boş liste = geçerli. */
export function validateNewHamle(h: Partial<NewHamle>): string[] {
  const e: string[] = [];
  const d = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(day(s));
  if (!h.kod || !/^[A-Z0-9][A-Z0-9-]{2,40}$/.test(h.kod)) e.push("kod: büyük harf/rakam/tire, 3–41 karakter");
  for (const f of ["baslik", "alan", "neden", "yapilan"] as const) if (!h[f] || String(h[f]).trim().length < 3) e.push(`${f} zorunlu`);
  if (!h.metric || !Object.hasOwn(METRIC_LABEL, h.metric)) e.push("ölçüm metriği veriden ölçülebilen bir anahtar olmalı");
  if (!Number.isFinite(h.baslangicDeger)) e.push("başlangıç değeri zorunlu");
  if (!Number.isFinite(h.beklenenDeger)) e.push("beklenen değer zorunlu (kalibrasyon için SAYI)");
  if (Number.isFinite(h.baslangicDeger) && h.beklenenDeger === h.baslangicDeger) e.push("beklenen değer başlangıçtan farklı olmalı");
  if (!d(h.kararTarihi)) e.push("karar tarihi YYYY-AA-GG");
  if (!d(h.ilkOlcumTarihi)) e.push("ölçüm tarihi YYYY-AA-GG");
  else if (d(h.kararTarihi) && h.ilkOlcumTarihi! <= h.kararTarihi!) e.push("ölçüm tarihi karar tarihinden sonra olmalı");
  return e;
}

export type Measurement = { date: string; value: number };
/** Geçmiş bir gün itibarıyla ölçülebilen metrikler (günlük bakiye / tarihli tahsilat-satış). Kart/KMH bakiyesi yalnız bugünkü değerdir. */
export const AS_OF_METRICS: ReadonlySet<MetricKey> = new Set(["debt_try", "kamu_monthly_try", "fba_90d_try"]);
export type PlannedMeasurement = { kod: string; metric: MetricKey; checkpoint: string; date: string; asOf: boolean };

/** Ölçüm planı (saf, CFO-012): açık ve ölçülebilir her hamlenin kontrol noktaları (ilk ölçüm tarihi, hedef tarihi) için o gün ya da sonrası
 *  tarihli ölçüm yoksa bir satır. As-of metrik kontrol noktasının ERTESİ günü o günün değeriyle (gün kapanmadan ölçülmez); canlı bakiye
 *  metrikleri kontrol noktası gelince bugünkü değerle (tarih = ölçüm günü). Kapalı karar, ölçülemeyen metrik ve elle ölçülen hamle atlanır. */
export function planMeasurements(hamleler: Hamle[], measurements: Map<string, Measurement[]>, today: string): PlannedMeasurement[] {
  const out: PlannedMeasurement[] = [];
  for (const h of hamleler) {
    if (CLOSED.has(h.durum)) continue;
    const metric = resolveMetric(`${h.olcumMetrigi ?? ""} ${h.baslangicMetrik ?? ""}`);
    if (metric == null) continue;
    const asOf = AS_OF_METRICS.has(metric);
    const have = measurements.get(h.kod) ?? [];
    const cps = [...new Set([h.ilkOlcumTarihi, deadlineOf(h)])].filter((x): x is string => x != null && (asOf ? x < today : x <= today)).sort();
    for (const cp of cps) {
      if (have.some(m => m.date >= cp) || out.some(o => o.kod === h.kod && o.date >= cp)) continue;
      out.push({ kod: h.kod, metric, checkpoint: cp, date: asOf ? cp : today, asOf });
    }
  }
  return out;
}

export type Calibration = {
  /** isabet ölçülen karar sayısı (kapanmış + gerçekleşen, ya da hedef tarihi geçmiş + ölçülmüş) */
  measured: number; meanError: number | null; unmeasurableClosed: number;
  /** hedefe ulaşan oran (yön duyarlı) */
  hitRate: number | null;
  /** + = iyimser (beklenen gerçekleşenden iyi), − = karamsar; |beklenen − başlangıç| birimi */
  bias: number | null;
  /** beklenen SAYI girilmiş karar oranı */
  coverage: number | null;
};
export type DecisionMemory = { evals: HamleEval[]; byStatus: Partial<Record<HamleStatus, number>>; calibration: Calibration };

/** Tek karar isabeti (CFO-012): gerçekleşen = kapanışta girilen değer; açık kararda hedef tarihinde ya da sonrasındaki ilk ölçüm.
 *  Beklenen SAYI ve başlangıç yoksa (ya da eşitse) ölçülemez. Yön metrikten, metrik yoksa beklenen − başlangıç işaretinden. */
export function scoreHamle(e: HamleEval, ms: Measurement[] = []): { error: number; hit: boolean; optimism: number } | null {
  if (e.baslangicDeger == null || e.beklenenDeger == null || e.beklenenDeger === e.baslangicDeger) return null;
  const span = e.beklenenDeger - e.baslangicDeger;
  const actual = e.status === "CLOSED" ? e.gerceklesenDeger
    : e.deadline == null ? null : [...ms].filter(m => m.date >= e.deadline!).sort((a, b) => a.date.localeCompare(b.date))[0]?.value ?? null;
  if (actual == null) return null;
  const lower = e.metric != null ? LOWER_IS_BETTER[e.metric] : span < 0;
  return { error: Math.abs(actual - e.beklenenDeger) / Math.abs(span), hit: lower ? actual <= e.beklenenDeger : actual >= e.beklenenDeger,
    optimism: (lower ? actual - e.beklenenDeger : e.beklenenDeger - actual) / Math.abs(span) };
}

export function summarize(evals: HamleEval[], measurements: Map<string, Measurement[]> = new Map()): DecisionMemory {
  const byStatus: DecisionMemory["byStatus"] = {};
  for (const e of evals) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  const scored = evals.map(e => scoreHamle(e, measurements.get(e.kod))).filter((x): x is NonNullable<typeof x> => x != null);
  const closed = evals.filter(e => e.status === "CLOSED");
  const closedScored = closed.filter(e => scoreHamle(e) != null).length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const order: HamleStatus[] = ["MISSING_EXPECTATION", "WRONG_DIRECTION", "WORSENING", "BEHIND", "NO_BASELINE", "ON_TRACK", "IMPROVING", "ACHIEVED", "UNMEASURED", "CLOSED"];
  return { evals: [...evals].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.kararTarihi.localeCompare(b.kararTarihi)), byStatus,
    calibration: { measured: scored.length, meanError: avg(scored.map(x => x.error)), unmeasurableClosed: closed.length - closedScored,
      hitRate: avg(scored.map(x => (x.hit ? 1 : 0))), bias: avg(scored.map(x => x.optimism)),
      coverage: evals.length ? evals.filter(e => e.beklenenDeger != null).length / evals.length : null } };
}

/** Sermaye motoru önerisi → karar taslağı (CFO-012). Yalnız veriyle ölçülebilen öneriler: kredi kapama (toplam borç düşer) ve kart devreden
 *  bakiyesi kapama (kart borcu düşer). Beklenen = bugünkü değer − önerilen tutar. Taslak KAYDEDİLMEZ: onaylayan kişi formda görür,
 *  düzeltir, kaydeder (createHamleAction → validateNewHamle). Stok yenileme / likidite önerileri bu 6 metrikle ölçülemez → taslak yok. */
export type ProposalUse = { kind: string; label: string; returnMonthly: number | null; capitalTry: number; debt?: { name: string; kind: "LOAN" | "CARD" | "KMH" } };
export type HamleDraft = { kod: string; baslik: string; kararTarihi: string; alan: string; neden: string; yapilan: string; metric: MetricKey;
  baslangicDeger: string; beklenenDeger: string; ilkOlcumTarihi: string; beklenenEtki: string; kaynak: string };
export const PROPOSAL_MEASURE_DAYS = 60;
export function proposalDrafts(plan: { use: ProposalUse; amountTry: number }[], current: Partial<Record<MetricKey, number | null>>, today: string): HamleDraft[] {
  const out: HamleDraft[] = [];
  const plus = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const slug = (x: string) => fold(x).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  for (const { use, amountTry } of plan) {
    if (use.kind !== "DEBT_PAYOFF" || !(amountTry > 0)) continue;
    const name = use.debt?.name ?? use.label;
    const kind = use.debt?.kind;
    const metric: MetricKey | null = kind === "LOAN" ? "debt_try" : kind === "CARD" ? "card_try" : null;
    const base = metric ? current[metric] : null;
    if (metric == null || base == null) continue;
    const amount = Math.round(amountTry);
    out.push({ kod: `O-${today.replace(/-/g, "").slice(2)}-${slug(name)}`, baslik: use.label, kararTarihi: today, alan: "borç",
      neden: `Sermaye motoru: aylık getiri %${use.returnMonthly == null ? "?" : Math.round(use.returnMonthly * 1000) / 10} (kesin), plan tutarı ${amount} TL`,
      yapilan: `${amount} TL ile ${use.label.toLocaleLowerCase("tr")}`, metric, baslangicDeger: String(Math.round(base)),
      beklenenDeger: String(Math.round(base - amount)), ilkOlcumTarihi: plus(today, PROPOSAL_MEASURE_DAYS), beklenenEtki: "",
      kaynak: `CFO motoru — sermaye tahsisi önerisi (${today})` });
  }
  return out;
}

