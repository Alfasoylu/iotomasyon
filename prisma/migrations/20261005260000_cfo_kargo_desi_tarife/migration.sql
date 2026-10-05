-- Kargo maliyeti: Trendyol anlaşmalı desi tarifeleri (KDV HARİÇ) + küçük sipariş baremleri + kanal varsayımı.
-- Kaynak: kullanıcının paylaştığı Trendyol fiyat listeleri (3 Ocak 2025, 13 Temmuz 2026). Yalnız additive (yeni tablolar/fonksiyon).
-- Kullanıcı kararı: diğer pazaryerlerinde de aynı kargo maliyeti varsayılır (cfo_kargo_kanal_varsayim '*').
-- Not: 2025 tablosu 2026-07-12'ye kadar "en son bilinen" olarak uygulanır; 2026 faturalarında (Nis-Tem) Aras/TEX bu tablodan farklı,
--      ara güncellemeler bilinmiyor → tahmin `verified=false` döner (docs/KARGO-TARIFE.md).
-- Geri alma: DROP FUNCTION cfo_kargo_tahmin; DROP TABLE cfo_kargo_kanal_varsayim, cfo_kargo_barem, cfo_kargo_desi_tarife;

CREATE TABLE IF NOT EXISTS public.cfo_kargo_desi_tarife (
  carrier text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  desi integer NOT NULL CHECK (desi >= 0),
  price_ex_vat numeric(10, 2) NOT NULL CHECK (price_ex_vat > 0),
  source text NOT NULL,
  PRIMARY KEY (carrier, valid_from, desi)
);
CREATE TABLE IF NOT EXISTS public.cfo_kargo_barem (
  id serial PRIMARY KEY,
  valid_from date,
  valid_to date,
  order_min_try numeric(10, 2) NOT NULL DEFAULT 0,
  order_below_try numeric(10, 2) NOT NULL,
  carrier_group text NOT NULL DEFAULT '*',
  flat_price_ex_vat numeric(10, 2) NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  source text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.cfo_kargo_kanal_varsayim (
  channel text PRIMARY KEY,
  cost_basis text NOT NULL,
  note text NOT NULL
);

INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Aras', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[66.49,66.49,71.50,80.10,87.30,95.92,104.50,110.83,118.24,125.03,131.86,137.57,143.36,149.09,154.86,160.56,169.55,178.51,187.51,196.48,205.47,213.66,221.88,230.02,238.25,246.43,254.33,262.22,270.13,278.04,285.94,294.50,303.07,311.64,320.20,328.77,337.34,345.90,354.47,363.04,371.60,380.17,388.74,397.30,405.87,414.44,423.00,431.57,440.14,448.70,457.27,465.84,474.40,482.97,491.54,500.10,508.67]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Kolay Gelsin', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[69.91,69.91,71.90,79.40,84.90,92.40,99.90,107.50,115.19,122.90,129.00,134.90,140.00,146.00,152.00,157.00,171.90,181.90,190.90,199.90,208.90,217.90,226.90,235.90,244.90,253.90,262.90,271.90,280.90,289.90,298.90,325.18,341.45,357.71,373.99,390.26,406.53,422.81,439.08,455.36,471.63,487.90,507.90,527.90,547.90,567.90,587.90,607.90,627.90,647.90,667.90,687.89,707.89,727.89,747.89,767.89,787.89]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'MNG', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[71.99,71.99,71.99,79.99,89.99,99.99,108.99,114.99,122.99,129.99,135.99,141.99,149.99,157.99,166.99,174.99,187.99,199.99,212.99,224.99,237.99,254.99,271.99,288.99,305.99,322.99,339.99,356.99,373.99,390.99,407.99,432.98,457.97,482.96,507.95,532.94,557.93,582.92,607.91,632.90,657.89,682.88,707.87,732.86,757.85,782.84,807.83,832.82,857.81,882.80,907.79,932.78,957.77,982.76,1007.75,1032.74,1057.73]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'PTT', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[62.03,62.03,62.03,76.80,76.80,80.44,85.47,90.53,100.59,110.68,125.81,132.01,138.64,145.31,151.95,158.58,165.22,171.86,178.50,185.17,191.81,198.44,205.08,211.73,218.36,225.02,231.66,238.30,244.94,251.58,258.23,533.54,546.41,559.28,572.14,585.00,597.87,610.73,623.60,636.46,649.33,662.19,675.06,687.92,700.78,713.65,726.52,739.38,752.24,765.11,777.98,790.83,803.70,816.57,829.43,842.29,855.16]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Sürat', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[67.96,67.96,67.96,75.86,82.77,87.39,101.01,107.84,114.66,121.49,128.31,137.46,145.24,151.07,154.71,160.41,165.81,174.57,183.37,192.15,200.91,209.97,218.06,226.06,234.14,242.19,249.94,257.71,265.47,273.24,281.01,336.17,345.94,355.75,365.51,375.31,385.08,394.85,404.65,414.42,428.81,438.68,448.56,458.47,468.34,478.24,488.12,497.99,507.90,517.78,527.68,537.55,547.43,557.34,567.21,577.11,586.99]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'TEX', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[61.04,61.04,62.85,71.20,76.46,81.08,91.69,98.34,105.22,112.02,118.36,125.07,129.95,135.38,140.79,146.57,153.82,161.94,170.10,178.22,186.23,194.23,201.63,208.97,216.36,223.74,230.86,237.99,245.12,252.27,259.36,303.69,316.76,329.01,339.38,349.77,360.14,370.51,380.90,390.43,402.44,411.64,420.84,430.06,439.26,448.48,457.68,466.88,476.10,485.30,494.51,503.72,512.92,522.14,531.34,540.55,549.75]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Yurtiçi', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[86.74,86.74,86.74,92.73,94.72,109.92,113.50,128.36,133.30,141.56,147.81,157.38,167.27,172.56,186.07,196.00,201.61,212.82,223.37,228.01,232.92,246.12,253.72,263.30,268.57,286.68,313.43,328.26,343.12,355.00,358.63,368.93,379.23,389.52,399.82,410.12,420.41,430.71,441.01,451.30,461.60,471.89,482.19,492.49,502.78,513.08,523.38,533.67,543.97,554.27,564.56,574.86,585.16,595.45,605.75,616.04,626.34]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Borusan', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,352.42,357.89,369.44,380.99,392.53,404.07,415.62,427.17,438.71,450.25,461.80,473.34,484.89,496.43,507.98,519.52,531.07,542.61,554.16,565.70,577.25,588.79,600.34,611.88,623.43,634.97,646.52]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'CEVA', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,465.49,470.56,475.75,480.95,486.29,491.59,497.06,502.47,507.97,513.62,519.29,524.41,529.75,535.07,540.34,545.82,551.20,556.79,562.31,567.96,573.64,606.78,612.83,618.94,625.13,631.06,634.14]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Horoz', DATE '2025-01-03', DATE '2026-07-12', (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (3 Ocak 2025, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-56'
FROM unnest(ARRAY[431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,431.15,433.93,443.80,453.66,463.52,473.38,483.24,493.10,502.96,512.83,522.69,532.55,542.42,552.28]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Aras', DATE '2026-07-13', NULL, (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (13 Temmuz 2026, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-92'
FROM unnest(ARRAY[88.96,88.96,88.96,100.84,109.90,117.85,128.39,136.17,145.27,153.60,164.23,173.09,179.47,187.61,194.84,202.03,213.36,224.62,235.95,247.24,252.09,264.80,276.40,287.97,298.26,308.50,322.85,335.94,347.66,361.09,371.34,383.12,394.90,406.68,418.46,430.24,442.02,453.80,465.58,477.36,489.14,500.92,512.70,524.48,536.26,548.04,559.82,571.60,583.38,595.17,606.95,618.73,630.51,642.29,654.07,665.85,677.63,689.41,701.19,712.97,724.75,736.53,748.31,760.09,771.87,783.65,795.43,807.21,818.99,830.77,842.56,854.34,866.12,877.90,889.68,901.46,913.24,925.02,936.80,948.58,960.36,972.14,983.92,995.70,1007.48,1019.26,1031.04,1042.82,1054.60,1066.38,1078.17,1089.95,1101.73]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'DHL eCommerce', DATE '2026-07-13', NULL, (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (13 Temmuz 2026, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-92'
FROM unnest(ARRAY[97.99,97.99,97.99,110.99,124.99,137.99,150.99,159.99,169.99,179.99,189.99,199.99,209.99,219.99,229.99,244.98,264.99,280.99,299.99,315.99,334.99,361.99,383.99,410.99,437.99,464.99,491.99,518.99,545.99,572.99,599.99,635.98,671.97,707.96,743.95,779.94,815.93,851.92,887.91,923.90,959.89,995.88,1031.87,1067.86,1103.85,1139.84,1175.83,1211.82,1247.81,1283.80,1319.79,1355.78,1391.77,1427.76,1463.75,1499.74,1535.73,1571.72,1607.71,1643.70,1679.69,1715.68,1751.67,1787.66,1823.65,1859.64,1895.63,1931.62,1967.61,2003.60,2039.59,2075.58,2111.57,2147.56,2183.55,2219.54,2255.53,2291.52,2327.51,2363.50,2399.49,2435.48,2471.47,2507.46,2543.45,2579.44,2615.43,2651.42,2687.41,2723.40,2759.39,2795.38,2831.37]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Kolay Gelsin', DATE '2026-07-13', NULL, (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (13 Temmuz 2026, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-92'
FROM unnest(ARRAY[96.59,96.59,96.59,107.09,118.64,128.09,138.59,148.04,158.54,167.99,179.54,190.04,201.59,212.09,223.64,235.19,246.74,258.29,269.84,281.39,292.94,304.49,316.04,327.59,339.14,350.69,362.24,373.79,385.34,396.89,408.44,418.94,429.44,439.94,450.44,460.94,471.44,481.94,492.44,502.94,513.44,523.94,534.44,544.94,555.44,565.94,576.44,586.94,597.44,607.94,618.44,628.94,639.44,649.94,660.44,670.94,681.44,691.94,702.44,712.94,723.44,733.94,744.44,754.94,765.44,775.94,786.44,796.94,807.44,817.94,828.44,838.94,849.44,859.94,870.44,880.94,891.44,901.94,912.44,922.94,933.44,943.94,954.44,964.94,975.44,985.94,996.44,1006.94,1017.44,1027.94,1038.44,1048.94,1059.44]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'PTT', DATE '2026-07-13', NULL, (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (13 Temmuz 2026, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-92'
FROM unnest(ARRAY[77.54,77.54,77.54,96.00,96.00,100.55,106.83,113.15,125.73,138.34,157.26,165.01,173.31,181.63,189.94,198.22,206.52,214.83,223.13,231.45,239.76,248.06,256.36,264.66,272.95,281.27,289.58,297.88,306.18,314.48,322.78,666.93,683.01,699.09,715.18,731.25,747.34,763.41,779.50,795.57,811.66,827.73,843.82,859.90,875.98,892.06,908.14,924.22,940.31,956.38,972.47,988.54,1004.63,1020.70,1036.79,1052.86,1068.95,1085.03,1101.11,1117.19,1133.28,1149.35,1165.44,1181.51,1197.60,1213.67,1229.76,1245.83,1261.92,1277.99,1294.08,1310.16,1326.24,1342.32,1358.41,1374.48,1390.57,1406.64,1422.73,1438.80,1454.89,1470.96,1487.05,1503.13,1519.21,1535.29,1551.37,1567.45,1583.54,1599.61,1615.70,1631.77,1647.86]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Sürat', DATE '2026-07-13', NULL, (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (13 Temmuz 2026, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-92'
FROM unnest(ARRAY[95.54,95.54,95.54,106.45,116.40,122.41,134.48,143.61,152.60,161.73,170.86,182.99,193.34,201.11,206.02,213.51,220.73,232.45,244.17,255.75,267.46,279.46,290.36,300.98,311.75,322.37,332.73,343.09,353.45,363.79,374.15,447.60,460.53,473.61,486.56,499.64,512.59,525.67,538.75,551.69,570.90,583.98,597.20,610.28,623.50,636.71,649.79,663.01,676.09,689.31,702.52,715.60,728.82,741.90,755.12,768.33,781.41,794.64,807.72,820.93,834.14,847.22,860.44,873.52,886.74,899.95,913.03,926.25,939.33,952.55,965.76,978.84,992.06,1005.14,1018.36,1031.58,1044.66,1057.87,1070.95,1084.17,1097.39,1110.47,1123.68,1136.76,1149.98,1163.20,1176.28,1189.49,1202.57,1215.78,1229.01,1242.09,1255.30]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'TEX', DATE '2026-07-13', NULL, (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (13 Temmuz 2026, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-92'
FROM unnest(ARRAY[77.54,77.54,77.54,93.63,101.46,107.98,118.30,125.66,134.21,142.42,153.47,162.13,170.33,178.04,185.17,192.81,200.82,209.70,218.60,227.46,236.21,244.98,254.82,264.97,274.36,283.69,292.73,301.77,310.84,319.89,328.88,394.39,404.79,415.21,425.61,436.04,446.43,456.86,467.29,477.69,489.37,499.80,510.26,520.68,531.13,541.59,552.02,562.47,572.89,583.35,593.80,604.23,614.68,625.11,635.56,646.01,656.45,666.90,677.32,687.77,698.23,708.66,719.11,729.54,739.99,750.44,760.88,771.33,781.75,792.20,802.66,813.09,823.54,833.97,844.42,854.87,865.30,875.76,886.18,896.63,907.09,917.52,927.97,938.40,948.85,959.30,969.73,980.18,990.61,1001.06,1011.51,1021.95,1032.40]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;
INSERT INTO public.cfo_kargo_desi_tarife (carrier, valid_from, valid_to, desi, price_ex_vat, source)
SELECT 'Yurtiçi', DATE '2026-07-13', NULL, (u.ord - 1)::int, u.p, 'Trendyol anlaşmalı kargo fiyat listesi (13 Temmuz 2026, KDV hariç) — kullanıcı ekran görüntüsü; desi 0-92'
FROM unnest(ARRAY[121.75,121.75,121.75,132.56,135.41,157.16,164.75,186.34,193.50,205.50,214.59,228.48,242.84,250.52,270.13,284.54,292.69,308.96,324.29,331.02,338.15,357.33,368.35,382.26,389.91,416.23,455.06,476.59,498.16,515.42,520.70,535.65,550.60,565.55,580.50,595.45,610.40,625.35,640.30,655.25,670.20,685.15,700.10,715.05,730.00,744.95,759.90,774.85,789.80,804.75,819.70,834.65,849.60,864.55,879.50,894.45,909.40,924.35,939.30,954.25,969.20,984.15,999.10,1014.05,1029.00,1043.95,1058.90,1073.86,1088.81,1103.76,1118.71,1133.66,1148.61,1163.56,1178.51,1193.46,1208.41,1223.36,1238.31,1253.26,1268.21,1283.16,1298.11,1313.06,1328.01,1342.96,1357.91,1372.86,1387.81,1402.76,1417.71,1432.66,1447.61]::numeric[]) WITH ORDINALITY AS u(p, ord)
ON CONFLICT (carrier, valid_from, desi) DO NOTHING;

INSERT INTO public.cfo_kargo_barem (id, valid_from, valid_to, order_min_try, order_below_try, carrier_group, flat_price_ex_vat, verified, source) VALUES
 (1, DATE '2023-01-01', DATE '2023-12-31', 0, 70,  '*', 20, false, 'Kullanıcı hatırlaması (yaklaşık); belge yok'),
 (2, DATE '2024-01-01', DATE '2024-12-31', 0, 100, '*', 25, false, 'Kullanıcı hatırlaması; belge yok'),
 (3, DATE '2025-01-01', DATE '2025-12-31', 0, 100, '*', 30, false, 'Kullanıcı hatırlaması; belge yok'),
 (4, NULL, NULL, 0,   125, 'PTT-TEX',               19.58, true, 'Trendyol Barem Destek sayfası ekran görüntüsü (tarihsiz; MNG/Sendeo listesi ≈2024); KDV hariç'),
 (5, NULL, NULL, 0,   125, 'ARAS-MNG-SENDEO-SURAT', 25.83, true, 'Trendyol Barem Destek sayfası ekran görüntüsü (tarihsiz)'),
 (6, NULL, NULL, 0,   125, 'YK',                    43.33, true, 'Trendyol Barem Destek sayfası ekran görüntüsü (tarihsiz)'),
 (7, NULL, NULL, 125, 200, 'PTT-TEX',               37.49, true, 'Trendyol Barem Destek sayfası ekran görüntüsü (tarihsiz)'),
 (8, NULL, NULL, 125, 200, 'ARAS-MNG-SENDEO-SURAT', 44.99, true, 'Trendyol Barem Destek sayfası ekran görüntüsü (tarihsiz)'),
 (9, NULL, NULL, 125, 200, 'YK',                    59.58, true, 'Trendyol Barem Destek sayfası ekran görüntüsü (tarihsiz)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cfo_kargo_kanal_varsayim (channel, cost_basis, note) VALUES
 ('*', 'TRENDYOL_ANLASMALI', 'Kullanıcı kararı (2026-10-05): tüm pazaryerlerinde Trendyol anlaşmalı kargo maliyeti varsayılır.')
ON CONFLICT (channel) DO NOTHING;

-- Tahmin: KDV hariç/dahil kargo maliyeti. 2026'da sipariş-tutarı baremi bilinmiyor (ölçülü bantlar için cfo_kargo_tarife).
-- Tarife sürümü: carrier için valid_from <= gün olan en yeni sürüm; desi yukarı yuvarlanır; tablo dışı desi → NULL (bilinmiyor).
CREATE OR REPLACE FUNCTION public.cfo_kargo_tahmin(p_date date, p_desi numeric, p_carrier text DEFAULT 'TEX', p_order_try numeric DEFAULT NULL)
RETURNS TABLE (price_ex_vat numeric, price_incl_vat numeric, basis text, tariff_valid_from date, verified boolean)
LANGUAGE sql STABLE AS $$
  WITH barem AS (
    SELECT b.id, b.flat_price_ex_vat, b.verified FROM public.cfo_kargo_barem b
    WHERE p_order_try IS NOT NULL AND b.valid_from IS NOT NULL AND p_date BETWEEN b.valid_from AND b.valid_to
      AND p_order_try >= b.order_min_try AND p_order_try < b.order_below_try AND b.carrier_group = '*'
    ORDER BY b.id LIMIT 1),
  desi_row AS (
    SELECT t.price_ex_vat, t.valid_from, (t.valid_to IS NULL AND t.valid_from <= p_date) AS current_version
    FROM public.cfo_kargo_desi_tarife t
    WHERE lower(t.carrier) = lower(p_carrier) AND t.valid_from <= p_date AND (t.valid_to IS NULL OR t.valid_to >= p_date)
      AND t.desi = ceil(p_desi)::int
    ORDER BY t.valid_from DESC LIMIT 1)
  SELECT x.p, round(x.p * 1.20, 2), x.basis, x.vf, x.ver FROM (
    SELECT flat_price_ex_vat AS p, 'BAREM_' || id AS basis, NULL::date AS vf, verified AS ver FROM barem
    UNION ALL
    SELECT d.price_ex_vat, 'DESI_TARIFE', d.valid_from, false FROM desi_row d WHERE NOT EXISTS (SELECT 1 FROM barem)
  ) x
$$;

DO $$
DECLARE o text;
BEGIN
  FOREACH o IN ARRAY ARRAY['cfo_kargo_desi_tarife','cfo_kargo_barem','cfo_kargo_kanal_varsayim'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', o);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', o);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO cfo_acceptance_reader', o);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = o AND policyname = 'cfo_acceptance_reader_select') THEN
        EXECUTE format('CREATE POLICY cfo_acceptance_reader_select ON public.%I FOR SELECT TO cfo_acceptance_reader USING (true)', o);
      END IF;
    END IF;
  END LOOP;
END
$$;
