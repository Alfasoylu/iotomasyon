-- Claude Code — maliyeti eksik 20 ürün (Alperen'in doldurduğu liste, 2026-10-10; yetki: "Tam yetkilisin").
-- ITHAL (8): sourceCostRmb/weightKg (Alperen), customsRatePct = GTİP yasal yükü (cfo_gtip_tarife; KDV+ÖTV dahil, 1 hane), importPaymentFeePct 5,
--   shippingMethodPref NULL (deniz/hava kararı ithalat motoru), eksik GTİP atandı, 1688 bağlantısı source1688Url1'e;
--   unitCostUsd = lib/importer-cost.ts calcImportCost (RMB/6,8 × 1,05 + motorun seçtiği navlun + gümrük), unitCostTry = × 48,98 (cfo_kur 2026-10).
-- YURTICI (6): İstoç/Euromix tedarikçi fiyatı "USD + KDV" → unitCostUsd = USD × 1,2 (D-P06: maliyet KDV dahil kayıtlı), unitCostTry = × 48,98;
--   supplier yazıldı, shippingMethodPref = 'IC_PIYASA' (ithalat motoru dışı).
-- NO_REORDER (7): privateNote'a CFO_POLICY:NO_REORDER eklendi (lib/cfo-agent/product-policy.ts bunu okur; sipariş önerilmez). Mevcut not korunur, sona eklenir.
-- Koruma: tek alan bile okunan eski değerde değilse (privateNote için md5) tüm işlem iptal. Her değişiklik cfo_change_log'da (privateNote içeriği günlüğe yazılmaz).
BEGIN;
CREATE TEMP TABLE _ch(sku text, alan text, eski text, yeni text, grup text) ON COMMIT DROP;
INSERT INTO _ch VALUES
('21037294719','sourceCostRmb',NULL,'130','ITHAL'),
('21037294719','customsRatePct',NULL,'20.0','ITHAL'),
('21037294719','importPaymentFeePct',NULL,'5','ITHAL'),
('21037294719','shippingMethodPref','IC_PIYASA',NULL,'ITHAL'),
('21037294719','unitCostUsd','36','30.0882','ITHAL'),
('21037294719','unitCostTry','1746','1473.72','ITHAL'),
('5179816227750','sourceCostRmb',NULL,'310','ITHAL'),
('5179816227750','weightKg',NULL,'1','ITHAL'),
('5179816227750','customsRatePct',NULL,'48.4','ITHAL'),
('5179816227750','importPaymentFeePct',NULL,'5','ITHAL'),
('5179816227750','gtip1',NULL,'8543.70.90.00.11','ITHAL'),
('5179816227750','source1688Url1',NULL,'https://qr.1688.com/s/s55mwWiN','ITHAL'),
('5179816227750','unitCostUsd',NULL,'72.5196','ITHAL'),
('5179816227750','unitCostTry',NULL,'3552.01','ITHAL'),
('4140404044444','sourceCostRmb',NULL,'250','ITHAL'),
('4140404044444','weightKg',NULL,'1','ITHAL'),
('4140404044444','customsRatePct',NULL,'51.1','ITHAL'),
('4140404044444','importPaymentFeePct',NULL,'5','ITHAL'),
('4140404044444','gtip1',NULL,'8525.89.00.00.00','ITHAL'),
('4140404044444','unitCostUsd',NULL,'70.4170','ITHAL'),
('4140404044444','unitCostTry',NULL,'3449.02','ITHAL'),
('MUS-XR7872BATARYA','sourceCostRmb',NULL,'75','ITHAL'),
('MUS-XR7872BATARYA','weightKg',NULL,'0.6','ITHAL'),
('MUS-XR7872BATARYA','customsRatePct',NULL,'52.6','ITHAL'),
('MUS-XR7872BATARYA','importPaymentFeePct',NULL,'5','ITHAL'),
('MUS-XR7872BATARYA','source1688Url1',NULL,'https://qr.1688.com/s/D9wkbvUr','ITHAL'),
('MUS-XR7872BATARYA','unitCostUsd','40','18.5880','ITHAL'),
('MUS-XR7872BATARYA','unitCostTry','1940','910.44','ITHAL'),
('236980001','sourceCostRmb',NULL,'1.9','ITHAL'),
('236980001','weightKg',NULL,'0.04','ITHAL'),
('236980001','customsRatePct',NULL,'24.4','ITHAL'),
('236980001','importPaymentFeePct',NULL,'5','ITHAL'),
('236980001','gtip1',NULL,'8543.70.90.00.19','ITHAL'),
('236980001','source1688Url1',NULL,'https://qr.1688.com/s/nnROnp1h','ITHAL'),
('236980001','unitCostUsd',NULL,'0.4147','ITHAL'),
('236980001','unitCostTry',NULL,'20.31','ITHAL'),
('TTLOCKSILVERKAPISILINDIR','sourceCostRmb',NULL,'275','ITHAL'),
('TTLOCKSILVERKAPISILINDIR','weightKg',NULL,'0.6','ITHAL'),
('TTLOCKSILVERKAPISILINDIR','customsRatePct',NULL,'47.2','ITHAL'),
('TTLOCKSILVERKAPISILINDIR','importPaymentFeePct',NULL,'5','ITHAL'),
('TTLOCKSILVERKAPISILINDIR','gtip1','85.36.50.19.00','8301.40.19.00.19','ITHAL'),
('TTLOCKSILVERKAPISILINDIR','unitCostUsd',NULL,'63.3891','ITHAL'),
('TTLOCKSILVERKAPISILINDIR','unitCostTry',NULL,'3104.80','ITHAL'),
('TTLOCKSIYAHKAPISILINDIR','sourceCostRmb',NULL,'275','ITHAL'),
('TTLOCKSIYAHKAPISILINDIR','weightKg',NULL,'0.6','ITHAL'),
('TTLOCKSIYAHKAPISILINDIR','customsRatePct',NULL,'47.2','ITHAL'),
('TTLOCKSIYAHKAPISILINDIR','importPaymentFeePct',NULL,'5','ITHAL'),
('TTLOCKSIYAHKAPISILINDIR','unitCostUsd','59','63.3891','ITHAL'),
('TTLOCKSIYAHKAPISILINDIR','unitCostTry','2861.5','3104.80','ITHAL'),
('TYPEC1M','sourceCostRmb',NULL,'2.1','ITHAL'),
('TYPEC1M','weightKg',NULL,'0.04','ITHAL'),
('TYPEC1M','customsRatePct',NULL,'42.0','ITHAL'),
('TYPEC1M','importPaymentFeePct',NULL,'5','ITHAL'),
('TYPEC1M','gtip1',NULL,'8544.42.90.00.19','ITHAL'),
('TYPEC1M','unitCostUsd',NULL,'0.5173','ITHAL'),
('TYPEC1M','unitCostTry',NULL,'25.34','ITHAL'),
('4224333434117','unitCostUsd',NULL,'15.6','YURTICI'),
('4224333434117','unitCostTry',NULL,'764.09','YURTICI'),
('4224333434117','supplier',NULL,'Euromix Armatür (ic piyasa)','YURTICI'),
('4224333434117','shippingMethodPref',NULL,'IC_PIYASA','YURTICI'),
('422433343411','unitCostTry','58.2','58.78','YURTICI'),
('422433343411','supplier','Istoc (ic piyasa)','Istoc — Birkay Armatür (ic piyasa)','YURTICI'),
('422433343411','shippingMethodPref',NULL,'IC_PIYASA','YURTICI'),
('MIXMUTFAKMUSLUK','unitCostUsd','9.6','8.4','YURTICI'),
('MIXMUTFAKMUSLUK','unitCostTry','465.6','411.43','YURTICI'),
('MIXMUTFAKMUSLUK','supplier',NULL,'Istoc — Beyazsu Armatür (ic piyasa)','YURTICI'),
('MIXMUTFAKMUSLUK','shippingMethodPref',NULL,'IC_PIYASA','YURTICI'),
('QUA-1001','unitCostUsd','14','13.2','YURTICI'),
('QUA-1001','unitCostTry','679','646.54','YURTICI'),
('QUA-1001','supplier',NULL,'Istoc — Beyazsu Armatür (ic piyasa)','YURTICI'),
('QUA-1001','shippingMethodPref',NULL,'IC_PIYASA','YURTICI'),
('422433343414','unitCostUsd',NULL,'0.3','YURTICI'),
('422433343414','unitCostTry',NULL,'14.69','YURTICI'),
('422433343414','supplier',NULL,'Istoc — Diclemix Armatür (ic piyasa)','YURTICI'),
('422433343414','shippingMethodPref',NULL,'IC_PIYASA','YURTICI'),
('4153390000102','unitCostUsd',NULL,'13.2','YURTICI'),
('4153390000102','unitCostTry',NULL,'646.54','YURTICI'),
('4153390000102','supplier',NULL,'Istoc — Beyazsu Armatür (ic piyasa)','YURTICI'),
('4153390000102','shippingMethodPref',NULL,'IC_PIYASA','YURTICI'),
('52710373520','privateNote','2e13870ab5d71d6c761dae6b925b2ae2','CFO_POLICY:NO_REORDER — 2026-10-10 Alperen (maliyet eksik listesi): başarısız ürün, tekrar getirilmeyecek; ölü stok olduğu için zararına satıldı.','NO_REORDER'),
('2102039373730SIYAH','privateNote','d41d8cd98f00b204e9800998ecf8427e','CFO_POLICY:NO_REORDER — 2026-10-10 Alperen (maliyet eksik listesi): başarısız ürün, tekrar getirilmeyecek; ölü stok olduğu için zararına satıldı.','NO_REORDER'),
('543600000','privateNote','d41d8cd98f00b204e9800998ecf8427e','CFO_POLICY:NO_REORDER — 2026-10-10 Alperen (maliyet eksik listesi): başarısız ürün, tekrar getirilmeyecek; ölü stok olduğu için zararına satıldı.','NO_REORDER'),
('4140404044444','privateNote','d41d8cd98f00b204e9800998ecf8427e','CFO_POLICY:NO_REORDER — 2026-10-10 Alperen (maliyet eksik listesi): başarısız ürün, tekrar getirilmeyecek; ölü stok olduğu için zararına satıldı.','NO_REORDER'),
('4Q0055916','privateNote','d41d8cd98f00b204e9800998ecf8427e','CFO_POLICY:NO_REORDER — 2026-10-10 Alperen (maliyet eksik listesi): başarısız ürün, tekrar getirilmeyecek; ölü stok olduğu için zararına satıldı.','NO_REORDER'),
('4921447644875','privateNote','d41d8cd98f00b204e9800998ecf8427e','CFO_POLICY:NO_REORDER — 2026-10-10 Alperen (maliyet eksik listesi): başarısız ürün, tekrar getirilmeyecek; ölü stok olduğu için zararına satıldı.','NO_REORDER'),
('21173887234122','privateNote','d41d8cd98f00b204e9800998ecf8427e','CFO_POLICY:NO_REORDER — 2026-10-10 Alperen (maliyet eksik listesi): başarısız ürün, tekrar getirilmeyecek; ölü stok olduğu için zararına satıldı.','NO_REORDER');
DO $$ DECLARE n int; m int; BEGIN
  SELECT count(*) INTO n FROM _ch c JOIN public."Product" p ON p.sku = c.sku WHERE CASE c.alan WHEN 'sourceCostRmb' THEN p."sourceCostRmb" IS DISTINCT FROM c.eski::numeric WHEN 'weightKg' THEN p."weightKg" IS DISTINCT FROM c.eski::numeric WHEN 'customsRatePct' THEN p."customsRatePct" IS DISTINCT FROM c.eski::numeric WHEN 'importPaymentFeePct' THEN p."importPaymentFeePct" IS DISTINCT FROM c.eski::numeric WHEN 'unitCostUsd' THEN p."unitCostUsd" IS DISTINCT FROM c.eski::numeric WHEN 'unitCostTry' THEN p."unitCostTry" IS DISTINCT FROM c.eski::numeric WHEN 'shippingMethodPref' THEN p."shippingMethodPref" IS DISTINCT FROM c.eski WHEN 'gtip1' THEN p."gtip1" IS DISTINCT FROM c.eski WHEN 'source1688Url1' THEN p."source1688Url1" IS DISTINCT FROM c.eski WHEN 'supplier' THEN p."supplier" IS DISTINCT FROM c.eski WHEN 'privateNote' THEN md5(coalesce(p."privateNote",'')) <> c.eski ELSE true END;
  SELECT count(DISTINCT c.sku) INTO m FROM _ch c JOIN public."Product" p ON p.sku = c.sku;
  IF n > 0 OR m <> 20 THEN RAISE EXCEPTION 'koruma: % alan değişmiş, % ürün bulundu', n, m; END IF;
END $$;
UPDATE public."Product" p SET "sourceCostRmb" = c.yeni::numeric, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'sourceCostRmb';
UPDATE public."Product" p SET "weightKg" = c.yeni::numeric, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'weightKg';
UPDATE public."Product" p SET "customsRatePct" = c.yeni::numeric, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'customsRatePct';
UPDATE public."Product" p SET "importPaymentFeePct" = c.yeni::numeric, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'importPaymentFeePct';
UPDATE public."Product" p SET "unitCostUsd" = c.yeni::numeric, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'unitCostUsd';
UPDATE public."Product" p SET "unitCostTry" = c.yeni::numeric, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'unitCostTry';
UPDATE public."Product" p SET "shippingMethodPref" = c.yeni, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'shippingMethodPref';
UPDATE public."Product" p SET "gtip1" = c.yeni, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'gtip1';
UPDATE public."Product" p SET "source1688Url1" = c.yeni, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'source1688Url1';
UPDATE public."Product" p SET "supplier" = c.yeni, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'supplier';
UPDATE public."Product" p SET "privateNote" = CASE WHEN p."privateNote" IS NULL OR p."privateNote" = '' THEN c.yeni ELSE p."privateNote" || E'\n' || c.yeni END, "updatedAt" = now() FROM _ch c WHERE c.sku = p.sku AND c.alan = 'privateNote';
INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
SELECT gen_random_uuid()::text, 'maliyet', sku || ' ' || alan,
       CASE WHEN alan = 'privateNote' THEN 'md5 ' || eski ELSE eski END,
       CASE WHEN alan = 'privateNote' THEN '+ CFO_POLICY:NO_REORDER' ELSE yeni END,
       'Alperen (tam yetki) + Claude Code', 'duzeltme',
       CASE grup WHEN 'ITHAL' THEN 'Maliyeti eksik 20 ürün listesi: Alperen RMB/kg; GTİP gümrüğü cfo_gtip_tarife; maliyet ithalat motoru (calcImportCost, RMB/6,8, USD/TRY 48,98)'
                 WHEN 'YURTICI' THEN 'Maliyeti eksik 20 ürün listesi: iç piyasa alışı USD + KDV (Alperen) × 1,2 (D-P06 KDV dahil) × 48,98'
                 ELSE 'Maliyeti eksik 20 ürün listesi: Alperen — başarısız ürün, tekrar getirilmeyecek' END
       || '. Kayıt: docs/maliyet/2026-10-10-maliyet-eksik-20-urun.md' FROM _ch;
COMMIT;
