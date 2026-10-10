import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { computeCfo, buildDailyActions, type CfoInput } from "../lib/cfo/engine";
import { REVIEWED_SOURCE_HASHES } from "../lib/cfo-agent/reviewed-sources";
import { PAYMENT_CAPACITY_SQL } from "../lib/cfo/payment-capacity";
import { loadDownside } from "../lib/cfo/downside-data";

// CFO-013 (RF-20261008-015) TEK NAKİT YOLU — migration 20261010110000: nakit projeksiyonu = ödeme takvimi. Üretim kopyasında:
// vadesi geçmiş ödenmemiş çıkış / tahsil edilmemiş alacak / diğer tahsilat projeksiyonda BUGÜNE taşınır, diğer tahsilat dahil,
// takvim açılışı şahsi hariç (cfo_nakit_kapisi), her gün pozisyon = takvim gün sonu nakdi; yetkiler ve AI CFO incelenmiş hash'i.
// Eski motor (lib/cfo/engine.ts) aynı kural. Çalıştır: node --conditions=react-server --import tsx __tests__/cfo-tek-nakit-yolu.test.ts

// ── Eski motor: vadesi geçmiş kalem pencerede bugün vadeli; günlük eylem önce vadesi geçmiş ödemeyi söyler ──
const today = new Date(2026, 9, 10);
const day = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
const ev = (id: string, n: number, o: Partial<CfoInput["cashEvents"][number]>) => ({ id, eventDate: day(n), kind: "DIGER", description: id, bank: null,
  inflowTry: null, outflowTry: null, certainty: "KESIN", relatedDebt: null, relatedImport: null, isSettled: false, note: null, ...o }) as unknown as CfoInput["cashEvents"][number];
const input: CfoInput = { settings: null, banks: [], cards: [], loans: [], expenses: [], imports: [], today, forecast: [],
  receivables: [{ id: "r0", channel: "Trendyol", dueDate: day(-3), amountTry: 2000, isCollected: false } as unknown as CfoInput["receivables"][number]],
  cashEvents: [ev("gecikmis-cikis", -2, { outflowTry: 3000 }), ev("gelecek-cikis", 10, { outflowTry: 10000 }), ev("diger-giris", 4, { inflowTry: 1500 }),
    ev("odenmis", -5, { outflowTry: 999, isSettled: true })] };
const o = computeCfo(input);
const h7 = o.horizons.find(h => h.days === 7)!;
assert.deepEqual([h7.inflow, h7.outflow], [2000 + 1500, 3000], "7 gün: vadesi geçmiş alacak + diğer tahsilat girer, vadesi geçmiş çıkış bugün; ödenmiş sayılmaz");
assert.equal(o.horizons.find(h => h.days === 30)!.outflow, 13000);
assert.match(buildDailyActions(o, input)[0].text, /^VADESİ GEÇTİ: .*gecikmis-cikis için 3\.000 TL/);

async function main() {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    const MIG = "20261010110000_cfo_tek_nakit_yolu";
    assert.ok(res.pendingInProduction.includes(MIG) && !res.pendingNotInProduction.includes(MIG), "üretimde uygulandı (2026-10-10, Alperen onayı)");
    for (const m of res.pendingInProduction.filter(x => x !== MIG)) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    await pg.exec("set search_path = public");
    const q = async <T,>(s: string) => (await pg.query<T>(s)).rows;
    const defHash = async () => createHash("sha256").update((await q<{ d: string }>(`select pg_get_functiondef('public.cfo_nakit_projeksiyon(integer)'::regprocedure) d`))[0].d).digest("hex");
    // 110000 öncesi üretim tanımının (baseline 2026-10-06) hash'i: PGlite biçimi üretimle birebir
    assert.equal(await defHash(), "3d5a2913aabf4835dd42fe4b28e1f6cdee130b1ee08716e31af1c622c4f17db2", "üretim kopyası: 110000 öncesi tanım");

    const sql = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
    await pg.exec(sql); await pg.exec(sql);
    assert.equal(await defHash(), REVIEWED_SOURCE_HASHES.cfo_nakit_projeksiyon, "yeni tanımın hash'i AI CFO'nun incelenmiş hash'i (üretimde ölçülen 9f3b9b2e…)");

    await pg.exec(`delete from cfo_bank_account; delete from cfo_receivable; delete from cfo_cash_event;
      insert into cfo_bank_account (id, name, "accountType", "balanceTry", "kmhLimitTry", "purposeLimitTry", "isActive", "updatedAt") values
        ('b1','Şirket','Vadesiz + KMH',100000,200000,40000,true,now()), ('b2','Alp','vadesiz + kmh (şahsi)',500,30000,7000,true,now()),
        ('b3','Bakiyesiz','Vadesiz + KMH',null,50000,null,true,now()), ('b4','Pasif','Vadesiz + KMH',9999,99999,null,false,now());
      insert into cfo_receivable (id, channel, "dueDate", "amountTry", "isCollected", "updatedAt") values
        ('r0','Trendyol', current_date - 3, 2000, false, now()), ('r1','Trendyol', current_date + 5, 5000, false, now()),
        ('r2','Trendyol', current_date - 20, 4000, true, now());
      insert into cfo_cash_event (id, "eventDate", kind, description, "inflowTry", "outflowTry", "isSettled", "updatedAt") values
        ('e0', current_date - 2, 'KREDI_TAKSITI', 'gecikmis taksit', null, 3000, false, now()),
        ('e1', current_date + 10, 'SABIT_GIDER', 'kira', null, 10000, false, now()),
        ('e2', current_date + 4, 'TAHSILAT', 'iade', 1500, null, false, now()),
        ('e3', current_date - 1, 'TAHSILAT', 'gecikmis iade', 700, null, false, now()),
        ('e4', current_date - 5, 'SABIT_GIDER', 'odendi', null, 999, true, now());`);

    const proj = await q<{ tarih: string; pozisyon: string; aciklama: string | null }>(`select tarih::text, pozisyon::text, aciklama from cfo_nakit_projeksiyon(40)`);
    const est0 = Number((await q<{ v: string | null }>(`select sum(tutar)::text v from cfo_tahsilat_tahmini where tarih = current_date`))[0].v ?? 0);
    assert.equal(Number(proj[0].pozisyon), Math.round(100000 + 2000 + 700 - 3000 + est0), "açılış şahsi hariç; vadesi geçmiş alacak/diğer tahsilat/çıkış BUGÜN");
    assert.match(proj[0].aciklama ?? "", /GECIKMIS gecikmis taksit/);
    assert.match(proj[0].aciklama ?? "", /GECIKMIS Trendyol/);

    // Kimlik: her gün projeksiyon pozisyonu = takvimin o güne kadarki son gün sonu nakdi (tahmin kuruş yuvarlaması ±1 TL)
    const cal = await q<{ tarih: string; g: string }>(`select tarih::text, gun_sonu_nakit::text g from cfo_odeme_gunluk order by tarih`);
    for (const p of proj) {
      const last = cal.filter(c => c.tarih <= p.tarih).pop();
      assert.ok(last, `takvimde ${p.tarih} öncesi satır var`);
      assert.ok(Math.abs(Number(p.pozisyon) - Number(last.g)) <= 1, `${p.tarih}: projeksiyon ${p.pozisyon} ≠ takvim ${last.g}`);
    }
    const [m] = await q<{ b: string }>(`select banka_nakit::text b from cfo_nakit_mutabakat`);
    assert.equal(Number(m.b), 100000, "mutabakat bankası takvimle aynı taban (şahsi hariç)");
    // /cfo/odemeler kapasitesi (RF-010 son parça): açılış = şirket nakdi = takvim açılışı; bilinmeyen bakiyeli limit kapasiteye girmez
    const [cap] = await q<Record<string, string | null>>(PAYMENT_CAPACITY_SQL);
    const [kap] = await q<{ n: string }>(`select nakit_try::text n from cfo_nakit_kapisi`);
    assert.deepEqual(["acilis", "ticari_kmh", "bilinmeyen_kmh", "sahsi_kmh", "amac_kmh"].map(c => Number(cap[c])), [100000, 200000, 50000, 30000, 40000],
      "kapasite: şahsi (küçük harf 'şahsi' dahil) ve pasif hariç, bakiyesiz hesabın limiti ayrı");
    assert.equal(Number(cap.acilis), Number(kap.n), "kapasite açılışı = cfo_nakit_kapisi = takvim açılışı");
    // Aşağı yön senaryosu projeksiyonu bileşenlerine ayırır (lib/cfo/downside-data.ts): vadesi geçmiş + diğer tahsilat dahil eşlik bozulmaz
    const down = await loadDownside(q);
    assert.ok(down, "aşağı yön yüklenir");
    assert.deepEqual([down!.parity.mismatchDays, down!.parity.days], [0, 121], "downside akışı = cfo_nakit_projeksiyon (her gün, CFO-013 kuralı)");
    assert.ok((await q(`select * from cfo_nakit_dibi`)).length > 0, "bağımlı görünüm çalışır");

    const pr = (await q<{ f: boolean; v: boolean; a: boolean }>(`select has_function_privilege('cfo_acceptance_reader','public.cfo_nakit_projeksiyon(integer)','execute') f,
      has_table_privilege('cfo_acceptance_reader','public.cfo_odeme_gunluk','select') v, has_table_privilege('anon','public.cfo_yaklasan_odeme','select') a`))[0];
    assert.deepEqual([pr.f, pr.v, pr.a], [true, true, false], "yetkiler korunur");
  } finally { await pg.close(); }
}

main().then(() => console.log("CFO-013 tek nakit yolu: vadesi geçmiş bugüne, diğer tahsilat, şahsi hariç açılış, projeksiyon = takvim (her gün), mutabakat tabanı, ödeme kapasitesi, aşağı yön eşliği, yetkiler, incelenmiş hash, eski motor passed"),
  e => { console.error(e); process.exitCode = 1; });
