-- Cowork tek dosya — migration 20261009210000_cfo_gtip_tarife (CFO-026, Alperen onayı 2026-10-09: "Tam yetkilisin, onaylıyorum")
-- GTİP bazında yasal gümrük yükü tablosu (Çin, 2026: GV / İGV / KDV / ÖTV muhtemel) + cfo_gtip_yuk görünümü (ürün bazında yasal yük,
-- kayıtlı gümrük % farkı, eksik stok maliyeti). Yeni tablo + görünüm; ham veri değişmez. Bağımsız; en iyi sonuç için önce
-- 2026-10-09-gtip-duzeltme.sql (Product.gtip1 12 haneli kodlar) uygulanmalı — eski 10 haneli kodlar tabloyla eşleşmez.
-- Kod tarafı: CFO alarmlarına "duty_gap" eklendi (stoklu ve kayıtlı gümrük % yasal yükün 5+ puan altında). Bugünkü veriyle: 3 ürün, ~5.869 TL.
-- Tek transaction, tekrar çalıştırılabilir. migration checksum (sha256): f813857c88dbc112e6a1e630832297758091cbd32dad2e92dd92a7c01d7f50dc
BEGIN;
-- CFO-026 (Alperen 2026-10-09: "GTİP'leri belirle, mevzuatı araştır"; "tam yetkilisin, onaylıyorum"): GTİP bazında yasal gümrük yükü.
-- cfo_gtip_tarife: Çin menşei ("7 = diğer ülkeler" sütunu) GV / İGV / KDV / ÖTV (IV sayılı liste, muhtemel) — 2026 İthalat Rejimi Kararı
-- (RG 31.12.2025 CB 10790), İGV Kararı (CB 10791, 11508 ile güncel), KDV Kanunu md. 21. Kaynak/araştırma: docs/gtip/ithalat-vergi-rejimi-2026.md,
-- docs/gtip/gtip-oranlar-2026.json. Anahtar = GTİP rakamları (12 hane) ya da 6 haneli başlık (yalnız araştırmada ≥2 alt pozisyon aynı oranı verdiyse: 8473.30, 8481.80, 8301.40).
-- cfo_gtip_yuk: maliyetli her ürün için en uzun önek eşleşmesiyle oran; yasal yük % = (1 + GV + İGV) × (1 + KDV) − 1 (masrafsız, ÖTV hariç;
-- ÖTV'li hali ayrı sütun) ve kayıtlı gümrük % ile fark; stok etkisi (stok 0 < adet < 1000, dropship yer tutucu hariç).
-- Hesap zinciri: CIF → GV = CIF×GV → İGV = CIF×İGV → (ÖTV) → KDV matrahı = CIF + GV + İGV (+ÖTV) → KDV. Ticari ithalatta hızlı kargo
-- tek-maktu oranı yok (CB 10813, 06.02.2026). Oranlar beyan öncesi müşavir/BTB ile teyit edilmelidir (dogrulandi bayrağı).
-- Ham veri değişmez; yalnız yeni tablo + görünüm. Geri alma: DROP VIEW cfo_gtip_yuk; DROP TABLE cfo_gtip_tarife.
CREATE TABLE IF NOT EXISTS public.cfo_gtip_tarife (
  gtip            text PRIMARY KEY CHECK (gtip ~ '^[0-9]{6}([0-9]{6})?$'),
  gv_pct          numeric(6,2) NOT NULL,
  igv_pct         numeric(6,2) NOT NULL,
  kdv_pct         numeric(6,2) NOT NULL DEFAULT 20,
  otv_pct         numeric(6,2),
  tanim           text,
  kaynak          text,
  dogrulandi      boolean NOT NULL DEFAULT false,
  gecerlilik      date NOT NULL DEFAULT DATE '2026-07-11',
  guncellendi     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cfo_gtip_tarife ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.cfo_gtip_tarife FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.cfo_gtip_tarife FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
    GRANT SELECT ON public.cfo_gtip_tarife TO cfo_acceptance_reader;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cfo_gtip_tarife' AND policyname = 'cfo_acceptance_reader_select') THEN
      CREATE POLICY cfo_acceptance_reader_select ON public.cfo_gtip_tarife FOR SELECT TO cfo_acceptance_reader USING (true);
    END IF;
  END IF;
END $$;

INSERT INTO public.cfo_gtip_tarife (gtip, gv_pct, igv_pct, kdv_pct, otv_pct, tanim, kaynak, dogrulandi) VALUES
  ('392690979029', 6.5, 10, 20, NULL, 'Plastikten diğer eşya — ''Diğerleri'' (plastik telefon/tablet arka kapak-kılıf olası)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('420232100000', 9.7, 39, 20, NULL, 'Cep/çanta eşyası — dış yüzü plastik yapraktan (telefon/tablet kılıfı olası)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('820320000019', 1.7, 25, 20, NULL, 'Pense, kerpeten, cımbız vb. — diğerleri', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('820559800019', 2.7, 25, 20, NULL, 'Başka yerde belirtilmeyen el aletleri — diğerleri', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('830140', 2.7, 20, 20, NULL, 'Kapı kilitleri — diğerleri (akıllı/elektronik kapı kilidi olası sınıflandırma) (başlık geneli: alt pozisyonlar aynı oran)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('830140110000', 2.7, 20, 20, NULL, 'Silindirli kapı kilitleri', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', false),
  ('830140190019', 2.7, 20, 20, NULL, 'Kapı kilitleri — diğerleri (akıllı/elektronik kapı kilidi olası sınıflandırma)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('830210000019', 2.7, 15, 20, NULL, 'Menteşeler — diğerleri', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('830242000019', 2.7, 15, 20, NULL, 'Mobilya için diğer donanım (soft-close amortisör/damper vb. olası)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('830250000000', 2.7, 15, 20, NULL, 'Sabit askılıklar, şapka askıları, dirsekler vb.', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('847170989000', 0, 0, 20, NULL, 'Bellek birimleri — diğerleri (harici SSD/HDD birimleri vb.)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('847180000000', 0, 0, 20, NULL, 'Otomatik bilgi işlem makinelerinin diğer birimleri', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('847190000000', 0, 0, 20, NULL, '8471 — diğerleri (kart okuyucular vb.)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('847330', 0, 0, 20, NULL, '84.71 makinelerinin aksam/parça/aksesuarı (boş harici disk kutusu vb.) (başlık geneli: alt pozisyonlar aynı oran)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('847330800000', 0, 0, 20, NULL, '84.71 makinelerinin aksam/parça/aksesuarı (boş harici disk kutusu vb.)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('848180', 2.2, 25, 20, NULL, 'Sıhhi tesisat — karıştırıcı valfler (lavabo/evye/banyo bataryası, termostatik bataryalar dahil) (başlık geneli: alt pozisyonlar aynı oran)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('848180110000', 2.2, 25, 20, NULL, 'Sıhhi tesisat — karıştırıcı valfler (lavabo/evye/banyo bataryası, termostatik bataryalar dahil)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('848180190001', 2.2, 25, 20, NULL, 'Sıhhi tesisat — musluklar (sensörlü .01, diğer .09), valfler (.12)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('848180190009', 2.2, 25, 20, NULL, 'Sıhhi tesisat — musluklar (sensörlü .01, diğer .09), valfler (.12)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('848180190012', 2.2, 25, 20, NULL, 'Sıhhi tesisat — musluklar (sensörlü .01, diğer .09), valfler (.12)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('848180610000', 2.2, 25, 20, NULL, 'Sürgülü valfler — demir dökümden', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('848180810012', 2.2, 25, 20, NULL, 'Küresel/konik valfler — bakır/pirinç (11.07.2026''dan itibaren yeni alt kod)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('850440609019', 3.3, 0, 20, NULL, 'Akümülatör şarj ediciler — diğer', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('850440839019', 3.3, 11, 20, NULL, 'Redresörler — diğer (AC/DC adaptör, USB şarj adaptörü, SMPS güç kaynağı olası)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('850440879011', 3.3, 0, 20, NULL, 'İnvertörler <50 kVA (MPPT''siz)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('850440959019', 3.3, 5, 20, NULL, 'Statik konvertörler — diğer (DC-DC konvertör vb.)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('851629990013', 2.7, 30, 20, 6.7, 'Elektrikli ortam ısıtıcıları — diğer ısıtıcı ve sobalar', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('851762009019', 0, 0, 20, NULL, 'Ağ cihazları: switch, router, PoE switch, ağ kartı, WiFi AP (11.07.2026''dan itibaren .90.19 ''Diğerleri''; .90.11 akıllı saatler)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('851771000000', 5, 0, 20, NULL, 'Her türlü anten ve anten yansıtıcıları; aksam-parçaları', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('851779000000', 5, 0, 20, NULL, '8517 cihazlarının diğer aksam-parçaları', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('851822000000', 4.5, 0, 20, 20.0, 'Aynı kabine monte birden fazla hoparlör', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('851830009011', 2, 0, 20, 20.0, 'Kulaklıklar — kablosuz (.11) / diğer (.19) (11.07.2026''dan bölündü)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('851830009019', 2, 0, 20, 20.0, 'Kulaklıklar — kablosuz (.11) / diğer (.19) (11.07.2026''dan bölündü)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('851840000000', 4.5, 0, 20, 20.0, 'Elektrikli ses frekans yükselteçleri (amplifikatörler)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('852351100000', 0, 0, 20, NULL, 'Katı hal kalıcı depolama (microSD, USB flash) — kayıt yapılmamış', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('852351900000', 3.5, 0, 20, NULL, 'Katı hal depolama — diğerleri (kayıtlı)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('852560000029', 0, 0, 20, NULL, 'Alıcısı bulunan verici diğer cihazlar (el telsizi/walkie-talkie olası sınıflandırma)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('852581000000', 4.9, 0, 20, NULL, 'Yüksek hızlı kameralar (8525.81)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('852583000000', 4.9, 0, 20, NULL, 'Gece görüş kameraları (8525.83)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('852589000000', 4.9, 0, 20, 20.0, 'Diğer TV/dijital kameralar (IP/WiFi güvenlik kamerası tipik sınıflandırması)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('853650190019', 2.3, 0, 20, NULL, 'Diğer anahtarlar (≤60 V ve diğer)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('853650800018', 2.3, 0, 20, NULL, 'Diğer anahtarlar (≤60 V ve diğer)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('853669900011', 2.3, 5, 20, NULL, 'Ev tipi fiş ve soketler', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('853669900018', 2.3, 0, 20, NULL, 'Diğer fiş/soket/konnektörler', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('853670001000', 3, 0, 20, NULL, 'Optik lif konnektörleri — plastikten (seramik .20, bakır .30, çelik .50)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('854370900011', 3.7, 20, 20, NULL, 'Maden (metal) dedektörleri', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('854370900015', 3.7, 0, 20, 20.0, 'Kızılötesi uzaktan kumandalar', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('854370900019', 3.7, 0, 20, NULL, 'Diğer elektrikli cihazlar (aktif çevirici/converter, sinyal cihazları vb. ''Diğerleri'')', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('854442100000', 0, 0, 20, NULL, 'Konnektörlü kablolar — telekomünikasyonda kullanılan türde (ör. RJ45 patch kablo olabilir)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('854442900011', 3.3, 15, 20, NULL, 'Güneş paneli bağlantı kutuları (junction box)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', false),
  ('854442900019', 3.3, 15, 20, NULL, 'Konnektörlü kablolar ≤1000 V (HDMI, USB, güç kabloları vb.) — Diğerleri', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('854470000000', 0, 0, 20, NULL, 'Fiber optik kablolar', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('901580800000', 3.7, 0, 20, NULL, 'Diğer (jeofizik vb.) alet ve cihazlar — metal dedektörü karşılaştırması için', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('903020009000', 4.2, 0, 20, NULL, 'Osiloskoplar ve osilograflar', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('903031009000', 4.2, 5.8, 20, NULL, 'Multimetreler (kaydedicisiz)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('903033209000', 4.2, 5.8, 20, NULL, 'Direnç ölçerler / diğer kaydedicisiz ölçü aletleri (pens ampermetre vb.)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('903033709000', 4.2, 5.8, 20, NULL, 'Direnç ölçerler / diğer kaydedicisiz ölçü aletleri (pens ampermetre vb.)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('903089009000', 2.1, 0, 20, NULL, 'Diğer elektrik ölçü/kontrol aletleri', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('903180809019', 4, 0, 20, NULL, 'Diğer ölçme/kontrol alet ve cihazları', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('940542390000', 2.7, 30, 20, NULL, 'LED aydınlatma cihazları — diğer maddelerden (metal armatür vb.)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('950450000000', 0, 20, 20, 20.0, 'Video oyun konsolları ve makineleri (oyun kolu/gamepad genelde burada)', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('950691100000', 2.7, 20, 20, NULL, 'Kültür-fizik/jimnastik/fitness eşyası', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('950691900000', 2.7, 20, 20, NULL, 'Kültür-fizik/jimnastik/fitness eşyası', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true),
  ('950699900000', 2.7, 20, 20, NULL, 'Diğer spor/açık hava oyun eşyası', 'https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip', true)
ON CONFLICT (gtip) DO NOTHING;

CREATE OR REPLACE VIEW public.cfo_gtip_yuk WITH (security_invoker = true) AS
WITH p AS (
  SELECT id, sku, name, gtip1, regexp_replace(coalesce(gtip1, ''), '[^0-9]', '', 'g') AS d, "customsRatePct"::numeric AS kayitli_pct,
         "unitCostTry"::numeric AS birim_tl, "stockQuantity" AS stok
    FROM public."Product" WHERE "unitCostTry" > 0
)
SELECT p.id, p.sku, p.name, p.gtip1, t.gtip AS tarife_gtip, t.gv_pct, t.igv_pct, t.kdv_pct, t.otv_pct, t.dogrulandi,
       round(((1 + (t.gv_pct + t.igv_pct) / 100) * (1 + t.kdv_pct / 100) - 1) * 100, 1) AS yasal_yuk_pct,
       round(((1 + (t.gv_pct + t.igv_pct) / 100) * (1 + coalesce(t.otv_pct, 0) / 100) * (1 + t.kdv_pct / 100) - 1) * 100, 1) AS yasal_yuk_otv_pct,
       p.kayitli_pct,
       round(p.kayitli_pct - ((1 + (t.gv_pct + t.igv_pct) / 100) * (1 + t.kdv_pct / 100) - 1) * 100, 1) AS fark_puan,
       CASE WHEN p.stok > 0 AND p.stok < 1000 THEN p.stok ELSE 0 END AS stok,
       round(CASE WHEN p.stok > 0 AND p.stok < 1000 THEN p.stok * p.birim_tl ELSE 0 END, 2) AS stok_maliyet_tl,
       -- Kayıtlı % yasal yükün altındaysa stok maliyetinin eksik kalan kısmı (aynı CIF varsayımıyla): maliyet × ((1+yasal)/(1+kayıtlı) − 1)
       CASE WHEN p.kayitli_pct IS NOT NULL AND t.gtip IS NOT NULL AND p.stok > 0 AND p.stok < 1000
                 AND p.kayitli_pct < ((1 + (t.gv_pct + t.igv_pct) / 100) * (1 + t.kdv_pct / 100) - 1) * 100
            THEN round(p.stok * p.birim_tl * (((1 + (t.gv_pct + t.igv_pct) / 100) * (1 + t.kdv_pct / 100)) / (1 + p.kayitli_pct / 100) - 1), 2)
            ELSE 0 END AS eksik_maliyet_tl
  FROM p
  LEFT JOIN LATERAL (
    SELECT * FROM public.cfo_gtip_tarife t WHERE p.d <> '' AND p.d LIKE t.gtip || '%' ORDER BY length(t.gtip) DESC LIMIT 1
  ) t ON true;
DO $$
BEGIN
  REVOKE ALL ON public.cfo_gtip_yuk FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.cfo_gtip_yuk FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.cfo_gtip_yuk FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN GRANT SELECT ON public.cfo_gtip_yuk TO cfo_acceptance_reader; END IF;
END $$;

INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, 'f813857c88dbc112e6a1e630832297758091cbd32dad2e92dd92a7c01d7f50dc', now(), '20261009210000_cfo_gtip_tarife', NULL, NULL, now(), 1
 WHERE NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009210000_cfo_gtip_tarife');
COMMIT;

-- Doğrulama (salt-okuma)
SELECT count(*) AS oran_satiri FROM public.cfo_gtip_tarife;
SELECT count(*) FILTER (WHERE tarife_gtip IS NOT NULL) AS oranli, count(*) AS maliyetli FROM public.cfo_gtip_yuk;
SELECT sku, kayitli_pct, yasal_yuk_pct, fark_puan, eksik_maliyet_tl FROM public.cfo_gtip_yuk
 WHERE kayitli_pct IS NOT NULL AND stok > 0 AND kayitli_pct < yasal_yuk_pct - 5 ORDER BY eksik_maliyet_tl DESC;
