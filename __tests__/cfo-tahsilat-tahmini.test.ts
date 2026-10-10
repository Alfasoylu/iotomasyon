/**
 * Tahmini tahsilatın tek mekanizması (20261008170000_cfo_tahsilat_tahmini, Cowork CFO kararı 2026-10-08):
 * cfo_tahsilat_tahmini = cfo_nakit_projeksiyon(gun) içindeki kanal temposu (tah) — birebir; cfo_yaklasan_odeme dördüncü kolu ile
 * cfo_odeme_gunluk da aynı mekanizmayı görür. Üretim kopyası (baseline + üretimde uygulanan migration'lar) üzerinde, PGlite.
 * Çalıştır: node --import tsx __tests__/cfo-tahsilat-tahmini.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";

async function main() {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: s => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const m of res.pendingInProduction) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    await pg.exec("set search_path = public");
    // Trendyol: açık vadeler +3 ve +10 (ufuk +10), +1'deki tahsil edilmiş kayıt tempoya girer (24.09 düzeltmesi);
    // Hepsiburada: ufuk +5; N11: açık kaydı yok (ufuk dün) ama +2'de tahsil edilmiş hakedişi var → tahmin bugünden başlar;
    // Amazon: 30 günden eski kayıt → tempo yok.
    await pg.exec(`insert into cfo_bank_account (id,name,"updatedAt","balanceTry","lastUpdatedAt","isActive","accountType")
        values ('b1','Banka',now(),100000,now(),true,'TICARI');
      insert into cfo_receivable (id,channel,"dueDate","amountTry","updatedAt","isCollected") values
        ('r1','Trendyol',current_date+3,50000,now(),false),('r2','Trendyol',current_date+10,60000,now(),false),
        ('r3','Trendyol',current_date+1,30000,now(),true),('r4','Hepsiburada',current_date+5,20000,now(),false),
        ('r5','N11',current_date+2,9000,now(),true),('r6','Amazon',current_date-40,7000,now(),true);
      insert into cfo_cash_event (id,"eventDate",kind,description,"updatedAt","outflowTry","isSettled") values
        ('e1',current_date+20,'KREDI_TAKSITI','taksit',now(),500000,false);
      insert into cfo_cash_event (id,"eventDate",kind,description,"updatedAt","inflowTry","isSettled") values
        ('e2',current_date+40,'TAHSILAT','gerçek tahsilat',now(),100000,false);`);
    const q = async <T,>(s: string) => (await pg.query<T>(s)).rows;

    // 1) Kanal ufku ve tempo: tahmin yalnız kanalın kendi son açık vadesinden SONRA
    const kanal = await q<{ kanal: string; ufuk: number; ilk: number; tutar: string }>(`select kanal, (alacak_ufku - current_date) ufuk,
      (min(tarih) - current_date) ilk, max(tutar)::text tutar from cfo_tahsilat_tahmini group by kanal, alacak_ufku order by kanal`);
    assert.deepEqual(kanal.map(k => [k.kanal, k.ufuk, k.ilk, Number(k.tutar).toFixed(2)]),
      [["Hepsiburada", 5, 6, (20000 / 30).toFixed(2)], ["N11", -1, 0, (9000 / 30).toFixed(2)], ["Trendyol", 10, 11, (140000 / 30).toFixed(2)]],
      "her kanal kendi ufkundan sonra; tahsil edilmiş kayıt tempoya girer; 30 günden eski kanal tahmin üretmez");

    // 2) Projeksiyonla birebir: her gün giris = açık alacak + tahmin + diğer tahsilat (inflowTry — CFO-013, migration 110000; projeksiyon günlük yuvarlar)
    const fark = await q<{ tarih: string; giris: string; beklenen: string }>(`select p.tarih::text, p.giris::text,
        round(coalesce((select sum("amountTry") from cfo_receivable r where not "isCollected" and r."dueDate"::date = p.tarih),0)
          + coalesce((select sum(tutar) from cfo_tahsilat_tahmini t where t.tarih = p.tarih),0)
          + coalesce((select sum("inflowTry") from cfo_cash_event e where not "isSettled" and e."eventDate"::date = p.tarih),0))::text beklenen
      from cfo_nakit_projeksiyon(120) p`);
    assert.equal(fark.length, 121);
    assert.deepEqual(fark.filter(r => r.giris !== r.beklenen), [], "cfo_nakit_projeksiyon tah = cfo_tahsilat_tahmini (121 gün)");

    // 3) cfo_odeme_gunluk aynı mekanizmayı görür: girecek = açık alacak + tahmin + gerçek inflowTry
    const gun = await q<{ g: number; girecek: string; beklenen: string }>(`select (o.tarih - current_date) g, o.girecek::text,
        (coalesce((select sum("amountTry") from cfo_receivable r where not "isCollected" and r."dueDate"::date = o.tarih),0)
          + coalesce((select round(sum(tutar),2) from cfo_tahsilat_tahmini t where t.tarih = o.tarih),0)
          + coalesce((select sum("inflowTry") from cfo_cash_event e where not "isSettled" and e."eventDate"::date = o.tarih),0))::text beklenen
      from cfo_odeme_gunluk o order by o.tarih`);
    assert.equal(gun.length, 121, "ufuk içindeki her gün takvimde (tahmin günleri dahil)");
    assert.deepEqual(gun.filter(r => Number(r.girecek) !== Number(r.beklenen)), []);
    assert.equal(Number(gun.find(r => r.g === 40)!.girecek), 105633.33, "gerçek inflowTry (100.000) kalır, tahmine (169.000/30) eklenir");

    // 4) cfo_yaklasan_odeme: sütun tipleri değişmedi, tahmin satırı tek/gün, TAHMINI ve 'tahmin:' kimlikli
    const tip = await q<{ t: string }>(`select format_type(atttypid, atttypmod) t from pg_attribute where attrelid='public.cfo_yaklasan_odeme'::regclass and attname='tutar'`);
    assert.equal(tip[0].t, "numeric(14,2)");
    const th = await q<{ id: string; kesinlik: string; aciklama: string; n: number }>(`select id, kesinlik, aciklama, count(*) over (partition by tarih)::int n
      from cfo_yaklasan_odeme where tur = 'Tahmini tahsilat' and tarih = current_date + 12`);
    assert.equal(th.length, 1); assert.match(th[0].id, /^tahmin:\d{4}-\d{2}-\d{2}$/); assert.equal(th[0].kesinlik, "TAHMINI");
    assert.equal(th[0].aciklama, "Kanal temposu, alacak ufku dışı: Hepsiburada, N11, Trendyol");
    assert.equal((await q(`select 1 from cfo_yaklasan_odeme where id like 'tahmin:%' and tarih <= current_date + 10 and aciklama like '%Trendyol%'`)).length, 0,
      "Trendyol alacak ufku içinde tahmin yok (çift sayım yok)");

    // 5) iki nesnenin dipleri aynı mekanizmadan: başlangıç nakdi eşitken pozisyonlar günlük yuvarlama farkı içinde
    //    (CFO-013 sonrası projeksiyon diğer tahsilatı da okur → doğrudan eşit; kalan yalnız günlük yuvarlama)
    const poz = await q<{ fark: string }>(`select max(abs(p.pozisyon - o.gun_sonu_nakit))::text fark from cfo_nakit_projeksiyon(120) p
      join cfo_odeme_gunluk o on o.tarih = p.tarih where (select nakit_try from cfo_nakit_kapisi) = (select sum("balanceTry") from cfo_bank_account where "isActive")`);
    assert.ok(poz[0].fark != null, "başlangıç nakdi iki nesnede eşit (fikstür)");
    assert.ok(Number(poz[0].fark) <= 61, `pozisyon farkı yalnız günlük yuvarlama: ${poz[0].fark}`);

    // 6) yeni görünüme anon/authenticated/PUBLIC erişemez
    assert.deepEqual(await q(`select grantee from information_schema.role_table_grants where table_name='cfo_tahsilat_tahmini' and grantee in ('anon','authenticated','PUBLIC')`), []);
    console.log("cfo_tahsilat_tahmini: channel horizons + tempo, projection parity incl. other inflows (121 days), cfo_odeme_gunluk = receivables + forecast + real inflow, view types/ids, no double count, ACL passed");
  } finally { await pg.close(); }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
