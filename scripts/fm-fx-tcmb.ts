/**
 * TCMB aylık USD/TRY referans serisini çeker ve `fm_fx_monthly` için SQL üretir (DB'ye BAĞLANMAZ, yazmaz).
 *   NODE_USE_ENV_PROXY=1 node --import tsx scripts/fm-fx-tcmb.ts 2020-08 2026-10 > fx.sql
 * Ağ erişimi yoksa script hata verir; alternatif/kazıma yolu YOKTUR (TCMB olmayan kur kullanılmaz).
 */
import { fxUpsertSql, monthsBetween, referenceRateForMonth, type FetchLike, type FxResult } from "../lib/fm/tcmb-fx";

const [from = "2020-08", to = new Date().toISOString().slice(0, 7)] = process.argv.slice(2);
const runId = process.env.FM_RUN_ID ?? null;
const today = new Date().toISOString().slice(0, 10);
const fetchLike: FetchLike = async url => {
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000) });
  return { status: res.status, text: () => res.text() };
};

async function main() {
  const months = monthsBetween(from, to);
  const results: FxResult[] = [];
  for (let i = 0; i < months.length; i += 4) {
    results.push(...await Promise.all(months.slice(i, i + 4).map(m => referenceRateForMonth(m, fetchLike, today))));
  }
  const ok = results.filter(r => r.status === "ok").length;
  const notOk = results.filter(r => r.status !== "ok");
  console.error(`FX: ${ok}/${results.length} ay doğrulandı; eksik/bekleyen: ${notOk.map(r => `${r.month}(${r.status})`).join(", ") || "yok"}`);
  process.stdout.write(fxUpsertSql(results, runId) + "\n");
}
main().catch(error => { console.error(`TCMB alınamadı: ${(error as Error).message}`); process.exitCode = 1; });
