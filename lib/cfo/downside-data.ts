import type { SqlQuery } from "./capital-efficiency-data";
import { runDownside, stressGapTry, type DayFlow, type Downside, type Resources } from "./downside";

// Aşağı yön senaryoları veri yükleyicisi (salt-okunur; /cfo/sermaye Prisma ile, AI CFO salt-okunur iş kaynağıyla çağırır).
// Günlük akış cfo_nakit_projeksiyon(120) ile AYNI kurallarla, ama bileşenlerine ayrılmış okunur (fonksiyon yalnız toplam giriş
// döndürüyor): defterdeki açık alacak / kanal temposundan tahmini tahsilat / çıkış / kur duyarlı çıkış (VERGI_GUMRUK).
// Eşlik denetimi: her gün giriş ve çıkış fonksiyonla 1 TL içinde aynı olmalı; değilse `parity.mismatchDays` > 0 ve sonuç
// "projeksiyonla uyuşmuyor" işaretlenir (fonksiyon değişmiş demektir — bu SQL güncellenmeli).
// Kaynaklar: cfo_nakit_kapisi (nakit, boş genel KMH, amaca bağlı KMH), cfo_kaynak_yeterliligi ('Sahsi KMH' kalemi), KMH aylık faiz
// cfo_settings.kmhMonthlyRatePct, taban Goal Engine net_position_floor_try gözleminin inputs.floor_try'si.

const HORIZON = 120;
const FLOW_SQL = `
with kanal as (
  select channel,
         coalesce(max("dueDate") filter (where not "isCollected" and "dueDate" >= current_date)::date, current_date - 1) son_d,
         coalesce(sum("amountTry") filter (where "dueDate" between current_date and current_date + 30), 0) / 30.0 gunluk
  from cfo_receivable where "dueDate" >= current_date - 30 group by channel),
takvim as (select generate_series(current_date, current_date + ${HORIZON}, '1 day')::date d),
gir as (select "dueDate"::date d, sum("amountTry") v from cfo_receivable
        where not "isCollected" and "dueDate" between current_date and current_date + ${HORIZON} group by 1),
cik as (select "eventDate"::date d, sum("outflowTry") v, sum("outflowTry") filter (where kind::text = 'VERGI_GUMRUK') fx from cfo_cash_event
        where not "isSettled" and "eventDate" between current_date and current_date + ${HORIZON} group by 1),
tah as (select t.d, sum(k.gunluk) v from takvim t join kanal k on t.d > k.son_d and k.gunluk > 0 group by t.d)
select t.d::text as date, coalesce(g.v, 0) as ledger_in, coalesce(th.v, 0) as forecast_in, coalesce(c.v, 0) as out, coalesce(c.fx, 0) as fx_out,
       p.giris as p_in, p.cikis as p_out
from takvim t left join gir g on g.d = t.d left join tah th on th.d = t.d left join cik c on c.d = t.d
left join cfo_nakit_projeksiyon(${HORIZON}) p on p.tarih = t.d
order by t.d`;

export type DownsideData = Downside & {
  startCash: number; resources: Resources;
  /** KMH aylık faizi (cfo_settings); girilmemişse null → faiz 0 alınır ve dip iyimser kalır (UNKNOWN, uydurma oran yok) */
  kmhMonthly: number | null; floorTry: number | null; stressGapTry: number;
  parity: { days: number; mismatchDays: number };
};

export async function loadDownside(q: SqlQuery): Promise<DownsideData | null> {
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  // Hata yakalamaya güvenme (işlem içinde başarısız sorgu sonrakileri bozar): önce nesneler var mı bak.
  const [have] = await q<{ p: string | null; k: string | null; y: string | null }>(`select to_regprocedure('public.cfo_nakit_projeksiyon(integer)')::text as p,
    to_regclass('public.cfo_nakit_kapisi')::text as k, to_regprocedure('public.cfo_kaynak_yeterliligi()')::text as y`);
  if (!have?.p || !have.k) return null;
  const [rows, gate, personal, settings, floor] = await Promise.all([
    q<{ date: string; ledger_in: unknown; forecast_in: unknown; out: unknown; fx_out: unknown; p_in: unknown; p_out: unknown }>(FLOW_SQL),
    q<{ nakit: unknown; genel: unknown; amacli: unknown }>(`select nakit_try as nakit, bos_kmh_try as genel, amacli_kmh_try as amacli from cfo_nakit_kapisi`),
    have.y ? q<{ tutar: unknown }>(`select tutar from cfo_kaynak_yeterliligi() where kalem ilike 'Sahsi KMH%' limit 1`) : Promise.resolve([] as { tutar: unknown }[]),
    q<{ kmh: unknown }>(`select "kmhMonthlyRatePct" as kmh from cfo_settings limit 1`),
    q<{ floor: unknown }>(`select inputs->>'floor_try' as floor from fm_goal_observation where goal_key = 'net_position_floor_try' order by evaluated_at desc limit 1`)
      .catch(() => []),
  ]);
  if (!rows.length || !gate[0]) return null;
  const days: DayFlow[] = rows.map(r => ({ date: r.date, ledgerIn: Number(r.ledger_in), forecastIn: Number(r.forecast_in), out: Number(r.out), fxOut: Number(r.fx_out) }));
  const mismatchDays = rows.filter(r => Math.abs(Number(r.ledger_in) + Number(r.forecast_in) - (num(r.p_in) ?? NaN)) > 1
    || Math.abs(Number(r.out) - (num(r.p_out) ?? NaN)) > 1).length;
  const startCash = num(gate[0].nakit) ?? 0;
  const resources: Resources = { generalTry: num(gate[0].genel) ?? 0, customsTry: num(gate[0].amacli) ?? 0, personalTry: num(personal[0]?.tutar) };
  const kmhPct = num(settings[0]?.kmh), kmhMonthly = kmhPct == null ? null : kmhPct / 100;
  const floorTry = num(floor[0]?.floor);
  const d = runDownside(days, startCash, resources, kmhMonthly ?? 0);
  return { ...d, startCash, resources, kmhMonthly, floorTry, stressGapTry: floorTry == null || mismatchDays > 0 ? 0 : stressGapTry(d, floorTry), parity: { days: rows.length, mismatchDays } };
}
