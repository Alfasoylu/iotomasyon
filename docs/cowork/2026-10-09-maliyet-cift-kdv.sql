-- Cowork tek dosya — 12 üründe çift KDV düzeltmesi (D-P06 kontrolü, Alperen 2026-10-09). Diğer paketlerden bağımsız.
-- Migration 20261009190000 (net sermaye LCNRV maliyet ÷ 1,2) BU DOSYADA YOK — Alperen'in ayrı onayını bekliyor.
-- Alperen: maliyet = RMB alış + navlun + gümrük %X ve "belirttiğim yüzdeler KDV dahil". Bu 12 üründe kayıtlı maliyet birebir
-- (ürün + navlun) × (1 + gümrük%) × 1,20 → KDV, KDV'yi zaten içeren gümrük yüzdesinin ÜSTÜNE ikinci kez eklenmiş.
-- Düzeltme: unitCostUsd ve unitCostTry ÷ 1,20 (oran TL = USD × 48,5 korunur). Satır silinmez; eski/yeni değer cfo_change_log'a yazılır.
-- Güvenli tekrar: yalnız değeri hâlâ ölçülen eski değer olan satır güncellenir (ikinci çalıştırmada 0 satır; tekrar bölünmez).
-- Etki: stoklu 6 ürünün stok maliyeti 410.625 TL → ~342.190 TL (−68.435 TL); AL-PTZ04 tek başına −46.115 TL.
BEGIN;

WITH v(id, sku, old_usd, old_try) AS (VALUES
  ('cmpbgcb3400bb04ju5uzco086', 'AL-PTZ04',      83.8970::numeric, 4069.00::numeric),
  ('cmpbgcb3800cl04ju7tcrqz1p', '1028MN',        19.8700, 963.70),
  ('cmpaenq0q002j04l5og2c016f', 'AL-SOLAR01',    32.5420, 1578.29),
  ('cmpbgcb3700bs04ju75tgacce', '1024MN',        14.0302, 680.46),
  ('cmpbgcb32009m04jukomxbbci', '46523000',      47.4261, 2300.16),
  ('cmpbgcb3a00dm04jup0hi0l81', '281037104715',   2.2500, 109.13),
  ('cmpbgcb3400bd04jugde6tcie', 'AL-PTZ02',      21.5946, 1047.34),
  ('cmp92etnt008p04l5gqbu5p8r', '2251930284620',  2.8467, 138.07),
  ('cmpbgcb32009004ju6a6m466w', '272736382918',   4.8500, 235.23),
  ('cmpbgcb3a00dx04juee7bl4wr', '510874620135',   6.1500, 298.28),
  ('cmpbgcb32009t04ju3u4f8h7t', '52670484619',    4.2652, 206.86),
  ('cmpbgcb2t001b04juceoxtikw', 'TE-KOSUBANDI', 108.0132, 5238.64)
),
u AS (
  UPDATE public."Product" p
     SET "unitCostUsd" = round(v.old_usd / 1.2, 4), "unitCostTry" = round(v.old_try / 1.2, 2), "updatedAt" = now()
    FROM v
   WHERE p.id = v.id AND p.sku = v.sku AND p."unitCostUsd" = v.old_usd AND p."unitCostTry" = v.old_try
  RETURNING p.sku, v.old_usd, v.old_try, p."unitCostUsd" AS new_usd, p."unitCostTry" AS new_try
)
INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
SELECT gen_random_uuid()::text, 'maliyet', u.sku || ' birim maliyet (çift KDV)',
       u.old_usd::text || ' USD / ' || u.old_try::text || ' TL', u.new_usd::numeric(14,4)::text || ' USD / ' || u.new_try::numeric(14,2)::text || ' TL',
       'Kullanıcı', 'duzeltme',
       'D-P06 kontrolü (Alperen 2026-10-09): gümrük % KDV dahil; kayıtlı maliyet (ürün+navlun)×(1+gümrük%)×1,20 idi → ÷1,20.'
  FROM u;

COMMIT;

-- Doğrulama (salt-okuma): 12 satır, TL ÷ USD ≈ 48,5; değişiklik günlüğünde 12 kayıt
SELECT sku, "unitCostUsd", "unitCostTry", round("unitCostTry" / "unitCostUsd", 2) AS kur FROM public."Product"
 WHERE sku IN ('AL-PTZ04','1028MN','AL-SOLAR01','1024MN','46523000','281037104715','AL-PTZ02','2251930284620','272736382918','510874620135','52670484619','TE-KOSUBANDI')
 ORDER BY sku;
SELECT count(*) FROM public.cfo_change_log WHERE item LIKE '% birim maliyet (çift KDV)';
