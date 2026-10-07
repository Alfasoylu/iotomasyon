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

const fold = (s: string) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

/** Ölçüm metriği metninden veri anahtarı (sıra önemli: özel olan önce). Eşleşmezse null → UNMEASURED. */
export function resolveMetric(text: string): MetricKey | null {
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
};
export type HamleStatus = "ACHIEVED" | "ON_TRACK" | "BEHIND" | "WRONG_DIRECTION" | "IMPROVING" | "WORSENING" | "NO_BASELINE" | "UNMEASURED" | "CLOSED";
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

export type DecisionMemory = { evals: HamleEval[]; byStatus: Partial<Record<HamleStatus, number>>; calibration: { measured: number; meanError: number | null; unmeasurableClosed: number } };

export function summarize(evals: HamleEval[]): DecisionMemory {
  const byStatus: DecisionMemory["byStatus"] = {};
  for (const e of evals) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  const cal = evals.filter(e => e.calibrationError != null);
  const closed = evals.filter(e => e.status === "CLOSED");
  const order: HamleStatus[] = ["WRONG_DIRECTION", "WORSENING", "BEHIND", "NO_BASELINE", "ON_TRACK", "IMPROVING", "ACHIEVED", "UNMEASURED", "CLOSED"];
  return { evals: [...evals].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.kararTarihi.localeCompare(b.kararTarihi)), byStatus,
    calibration: { measured: cal.length, meanError: cal.length ? cal.reduce((s, e) => s + e.calibrationError!, 0) / cal.length : null, unmeasurableClosed: closed.length - cal.length } };
}
