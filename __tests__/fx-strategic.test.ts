import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pickStrategicFx, STRATEGIC_FX_SQL, STRATEGIC_FX_SQL_NOW } from "../lib/fx/strategic";
import { ensureTcmbMonthlyFx, istanbulDate } from "../lib/fm/tcmb-fx-sync";

// Stratejik kur (CFO-003, Alperen D-P04): TCMB döviz alış, ayın 15'i bülteni; bu ay yoksa önceki ay (B, işaretli); hiç yoksa BİLİNMİYOR.
// Otomatik kayıt: yalnız eksik ayı, yalnız doğrulanmış TCMB değeriyle ekler; mevcut satıra dokunmaz; hata/bülten yoksa yazmaz.
// Çalıştır: node --import tsx __tests__/fx-strategic.test.ts
const bulletin = (d: string, rate: string) => {
  const [y, m, day] = d.split("-");
  return `<Tarih_Date Tarih="${day}.${m}.${y}" Date="${m}/${day}/${y}" Bulten_No="2026/${day}"><Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><ForexBuying>${rate}</ForexBuying></Currency></Tarih_Date>`;
};

async function main() {
  // 1) Saf seçim
  const oct = new Date("2026-10-09T08:00:00Z");
  assert.equal(pickStrategicFx(null, oct), null, "kur yoksa BİLİNMİYOR (sabit yedek yok)");
  assert.equal(pickStrategicFx({ month: "2026-09-01", rate: "0" }, oct), null);
  const b = pickStrategicFx({ month: "2026-09-01", rate: "48.5585" }, oct)!;
  assert.deepEqual([b.usdTry, b.month, b.grade, b.priorMonth], [48.5585, "2026-09", "B", true]);
  assert.match(b.label, /önceki ay/);
  const a = pickStrategicFx({ month: "2026-10-01", rate: "49.1" }, new Date("2026-10-20T08:00:00Z"))!;
  assert.deepEqual([a.grade, a.priorMonth], ["A", false]);
  assert.equal(pickStrategicFx({ month: "2026-10-01", rate: "49.1" }, new Date("2026-10-31T22:30:00Z"))!.grade, "B", "İstanbul'da ay dönmüşse önceki ay");
  assert.equal(istanbulDate(new Date("2026-10-14T21:30:00Z")), "2026-10-15");

  const db = new PGlite();
  try {
    await db.exec(`create table fm_fx_monthly (month date primary key, usd_try_forex_buying numeric(12,4) not null, ref_date date not null, bulletin_no text not null,
        is_fallback_day boolean not null, source_url text not null, ingest_run_id uuid, fetched_at timestamptz not null default now());
      create view fm_memory_fx_monthly as select month, usd_try_forex_buying, ref_date from fm_fx_monthly;
      insert into fm_fx_monthly values ('2026-09-01', 48.5585, '2026-09-15', '2026/176', false, 'tcmb', null, now());`);
    const sdb = { query: async <T,>(sql: string, ...p: unknown[]) => (await db.query<T>(sql, p)).rows, execute: (sql: string, ...p: unknown[]) => db.query(sql, p) };

    // 2) SQL: değerlendirme ayından sonraki ay görülmez; tek kural hem parametreli hem "şimdi" sürümünde
    const [r] = await sdb.query<{ month: string; rate: string }>(STRATEGIC_FX_SQL, "2026-10-09T08:00:00Z");
    assert.deepEqual([r.month, Number(r.rate)], ["2026-09-01", 48.5585]);
    assert.ok(STRATEGIC_FX_SQL_NOW.includes("Europe/Istanbul") && !STRATEGIC_FX_SQL_NOW.includes("$1"));

    // 3) Otomatik kayıt
    const calls: string[] = [];
    const fake = (pages: Record<string, string>, fail = false) => async (url: string) => {
      calls.push(url);
      if (fail) return { status: 503, text: async () => "" };
      const hit = Object.entries(pages).find(([d]) => url.endsWith(`/${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(0, 4)}.xml`));
      return hit ? { status: 200, text: async () => bulletin(hit[0], hit[1]) } : { status: 404, text: async () => "" };
    };
    // 09.10: Eylül var (dokunulmaz, fetch yok), Ekim'in 15'i gelmedi → pending, hiçbir şey yazılmaz
    let res = await ensureTcmbMonthlyFx(sdb, fake({}), oct);
    assert.deepEqual(res.map(x => x.status), ["present", "pending"]); assert.equal(calls.length, 0);
    // 16.10: 15 Ekim (Perşembe) bülteni → eklenir
    res = await ensureTcmbMonthlyFx(sdb, fake({ "2026-10-15": "49.2100" }), new Date("2026-10-16T05:00:00Z"));
    assert.deepEqual(res.map(x => x.status), ["present", "inserted"]); assert.equal(res[1].rate, 49.21);
    const [o] = await sdb.query<{ rate: string; ref: string; fb: boolean }>(`select usd_try_forex_buying::text rate, ref_date::text ref, is_fallback_day fb from fm_fx_monthly where month = '2026-10-01'`);
    assert.deepEqual([Number(o.rate), o.ref, o.fb], [49.21, "2026-10-15", false]);
    // tekrar: mevcut satır asla güncellenmez (farklı değer gelse bile fetch bile yapılmaz)
    calls.length = 0;
    res = await ensureTcmbMonthlyFx(sdb, fake({ "2026-10-15": "99.9999" }), new Date("2026-10-17T05:00:00Z"));
    assert.deepEqual(res.map(x => x.status), ["present", "present"]); assert.equal(calls.length, 0);
    // Kasım: 15'i Pazar → 404, 14 Cumartesi 404, 13 Cuma bülteni (fallback day)
    res = await ensureTcmbMonthlyFx(sdb, fake({ "2026-11-13": "49.8000" }), new Date("2026-11-20T05:00:00Z"));
    assert.equal(res[1].status, "inserted");
    assert.equal((await sdb.query<{ fb: boolean }>(`select is_fallback_day fb from fm_fx_monthly where month = '2026-11-01'`))[0].fb, true);
    // Aralık: TCMB 503 → hata, hiçbir şey yazılmaz (sahte kur yok)
    res = await ensureTcmbMonthlyFx(sdb, fake({}, true), new Date("2026-12-20T05:00:00Z"));
    assert.equal(res[1].status, "error");
    assert.equal((await sdb.query(`select 1 from fm_fx_monthly where month = '2026-12-01'`)).length, 0);
    // Stratejik kur Aralık'ta önceki aya (Kasım) düşer, işaretli
    const [d] = await sdb.query<{ month: string; rate: string }>(STRATEGIC_FX_SQL, "2026-12-20T05:00:00Z");
    const dec = pickStrategicFx(d, new Date("2026-12-20T05:00:00Z"))!;
    assert.deepEqual([dec.month, dec.usdTry, dec.grade], ["2026-11", 49.8, "B"]);
    console.log("Stratejik kur: TCMB ay → önceki ay (B) → BİLİNMİYOR; otomatik kayıt yalnız eksik ay, doğrulanmış bülten, mevcut satıra dokunmaz, hata yazmaz passed");
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
