-- Kart vergi çarpanı 1,30 → 1,20 (Alperen kararı 2026-10-09, Cowork itirazı): kredi kartı akdi faizine KKDF %15 + BSMV %5 (BSMV %15 değil).
-- lib/cfo/card-cost.ts CARD_TAX ile aynı. Yalnız cfo_kart_karari'deki üç 1.30 sabiti ve gerekçe metni değişir; karar mantığı, sıralama,
-- dönüş tipi, imza ve yetkiler 20261009110000 ile birebir (üretim tanımı o migration'la aynı — 2026-10-09 yorumsuz gövde md5 2cb05699… eşit).
-- Geri alma: 20261009110000 içindeki tanım.
CREATE OR REPLACE FUNCTION public.cfo_kart_karari()
 RETURNS TABLE(sira integer, karar text, tarih date, kalem text, mevcut_odeme numeric, yeni_odeme numeric, kazanc numeric, aylik_faiz numeric, kumulatif_kazanc numeric, yeni_dip numeric, gerekce text)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_taban numeric := (select "netPositionFloorTry" from cfo_settings);
  v_minpct numeric := (select "cardMinPct" from cfo_settings);
  v_dip numeric; v_dip_tarih date; v_acik numeric;
  v_kum numeric := 0; v_i int := 0; r record; v_poz numeric;
begin
  select min(p.pozisyon) into v_dip from cfo_nakit_projeksiyon(120) p;
  select p.tarih into v_dip_tarih from cfo_nakit_projeksiyon(120) p
   where p.pozisyon = v_dip order by p.tarih limit 1;

  if v_dip >= v_taban then
    return query select 1,'TABAN KORUNUYOR'::text, v_dip_tarih,'-'::text,
      0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,v_dip,
      ('En dip '||round(v_dip)||' TL, taban '||round(v_taban)||' TL, pay '||round(v_dip-v_taban)
       ||' TL. Kart odemeleri PLANLANDIGI GIBI yapilir.')::text;
    return;
  end if;

  v_acik := v_taban - v_dip;
  return query select 0,'TABAN DELINIYOR'::text, v_dip_tarih,'-'::text,
    0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,v_dip,
    ('En dip '||round(v_dip)||' TL ('||v_dip_tarih||'), taban '||round(v_taban)||' TL. ACIK '
     ||round(v_acik)||' TL.')::text;

  for r in
    with kalem as (
      select e."eventDate"::date d, e.description aciklama, e."outflowTry" tam,
        (e.description ilike '%HARD DEADLINE%') korumali,
        (select coalesce(c."minOverrideTry", round(coalesce(c."statementDebtTry", e."outflowTry")*v_minpct/100.0,2))
           from cfo_credit_card c where c."isActive" and e.description ilike '%'||c.bank||'%'
          order by c."sortOrder" limit 1) asg,
        (select c."contractMonthlyRatePct"
           from cfo_credit_card c where c."isActive" and e.description ilike '%'||c.bank||'%'
          order by c."sortOrder" limit 1) oran
      from cfo_cash_event e
      where not e."isSettled" and e.kind::text='KART_ODEMESI'
        and e."eventDate"::date <= v_dip_tarih
        and e.description not ilike '%asgari%'
        and not (e.description ilike '%taksiti%' and e.description not ilike '%dahil%')
    )
    select d, aciklama, tam, asg, korumali, oran from kalem where asg is not null and tam > asg + 1
    order by korumali asc, (tam - asg) desc
  loop
    if r.korumali then
      select p.pozisyon into v_poz from cfo_nakit_projeksiyon(120) p where p.tarih = r.d;
      if coalesce(v_poz, -1) >= 0 then
        return query select 50,'KORUMALI — TAM ODENIR'::text, r.d, left(r.aciklama,45),
          r.tam, r.tam, 0::numeric, 0::numeric, v_kum, (v_dip+v_kum),
          ('HARD DEADLINE var ve o gun pozisyon '||round(coalesce(v_poz,0))||' TL: tam odenir.')::text;
      else
        v_i := v_i + 1; v_kum := v_kum + (r.tam - r.asg);
        return query select 51,'KORUMALI AMA NAKIT YOK — ASGARIYE CEK'::text, r.d, left(r.aciklama,45),
          r.tam, r.asg, (r.tam-r.asg), (case when r.oran is null or r.oran <= 0 then null else round((r.tam-r.asg)*r.oran/100.0*1.20,2) end), v_kum, (v_dip+v_kum),
          ('HARD DEADLINE var AMA o gun pozisyon '||round(coalesce(v_poz,0))
           ||' TL — tam odeme MUMKUN DEGIL. Asgari odenir, kalan '||round(r.tam-r.asg)
           ||' TL sonraki ekstreye devreder. Korumanin kaybi RAPORDA belirtilir.')::text;
      end if;
      continue;
    end if;

    exit when v_kum >= v_acik;
    v_i := v_i + 1; v_kum := v_kum + (r.tam - r.asg);
    return query select v_i,'ASGARIYE CEK'::text, r.d, left(r.aciklama,45),
      r.tam, r.asg, (r.tam-r.asg), (case when r.oran is null or r.oran <= 0 then null else round((r.tam-r.asg)*r.oran/100.0*1.20,2) end), v_kum, (v_dip+v_kum),
      ('Ertelenen '||round(r.tam-r.asg)||' TL · aylik faiz '
       ||coalesce('~'||round((r.tam-r.asg)*nullif(r.oran,0)/100.0*1.20)||' TL (kart akdi orani x 1,20 KKDF+BSMV)', 'BILINMIYOR (kartin akdi orani girilmemis)'))::text;
  end loop;

  if coalesce(v_kum,0) < v_acik then
    return query select 99,'YETERSIZ — BASKA KALDIRAC SART'::text, v_dip_tarih,'-'::text,
      0::numeric,0::numeric,0::numeric,0::numeric, coalesce(v_kum,0), (v_dip+coalesce(v_kum,0)),
      ('Kart asgarilerinden sonra taban hala '||round(v_acik-coalesce(v_kum,0))
       ||' TL deliniyor. GECERLI KALDIRAC MERDIVENI (30.08 teyidi sonrasi): '
       ||'(1) 28.09 KISMI CEKIM karari — beyannameyi bol, kaynagin yettigi kadarini cek [cfo_gumruk_dilim()]; '
       ||'(2) antrepoda bekletme — ardiye maliyeti karsiligi nakdi zamana yay; '
       ||'(3) Trendyol erken odeme — ekim hakedislerini 04.10 oncesine cek; '
       ||'(4) 01.10 sabit giderlerini kis (348.400 TL, dip oncesindeki tek buyuk esnek kalem); '
       ||'(5) en pahali borcu yapilandir; (6) sahsi hesaplar — son care, sifir tampon. '
       ||'DIKKAT: gumruk TAKSITLENDIRME ve TEMINAT MEKTUBU ile mal cekimi YOKTUR '
       ||'(gumruk musaviri 30.08.2026 kesin ret). Yurtdisi siparis erteleme 30.08de zaten yapildi.')::text;
  end if;
end;
$function$;
