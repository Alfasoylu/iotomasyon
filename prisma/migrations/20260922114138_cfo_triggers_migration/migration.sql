-- CFO Stok Sıçrama & XML Ürün Değişim Triggers
-- Veritabanı: Supabase Postgres
-- Amacı: Stok değişimlerini ve XML feed değişimlerini otomatik olarak yakalamak
-- ⚠️  Bu migration yalnız trigger ve fonksiyonları dokümante eder.
-- Veritabanında zaten mevcut olan cfo_* nesnelerini PROTECT eder.

-- ============================================================================
-- 1. Helper Function: cfo_stok_sicrama_kaydet(p_log_id)
-- Stok değişimlerini cfo_stok_sicrama tablosuna kaydeder (medyan-tabanlı eşik)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cfo_stok_sicrama_kaydet(p_log_id text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE r record; v_med numeric; v_neden text;
BEGIN
  SELECT l.id, l."productId", l."previousQty", l."newQty", l.delta, l."syncedAt", p.sku, p.name
    INTO r
  FROM "XmlStockChangeLog" l JOIN "Product" p ON p.id = l."productId"
  WHERE l.id = p_log_id;

  IF r.id IS NULL OR r.delta > -5 THEN
    RETURN;
  END IF;

  -- Son 90 günün medyan günlük stok kaybını hesapla
  SELECT GREATEST(COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY -x.delta), 1), 1)
    INTO v_med
  FROM "XmlStockChangeLog" x
  WHERE x."productId" = r."productId" AND x.delta < 0 AND x.delta >= -100 AND x.id <> r.id
    AND x."syncedAt" BETWEEN r."syncedAt" - INTERVAL '90 days' AND r."syncedAt";

  -- Eşik nedeni: normalin katı, stokun yüzdesi, toplu değişim
  v_neden := CONCAT_WS(' + ',
    CASE WHEN -r.delta >= 3 * v_med THEN 'normalin ' || ROUND(-r.delta / v_med, 1) || ' kati' END,
    CASE WHEN r."previousQty" > 0 AND -r.delta >= 0.5 * r."previousQty" THEN 'stogun %' || ROUND(100.0 * -r.delta / r."previousQty") || 'i' END,
    CASE WHEN r.delta < -100 THEN 'TOPLU (>100)' END);

  IF v_neden IS NULL OR v_neden = '' THEN
    RETURN;
  END IF;

  -- Sıçrama kaydını oluştur
  INSERT INTO cfo_stok_sicrama(
    xml_log_id, product_id, sku, urun, synced_at, onceki, yeni, delta,
    esik_nedeni, medyan_dusus, entegra_degisim_zamani
  )
  SELECT r.id, r."productId", r.sku, r.name, r."syncedAt", r."previousQty", r."newQty", r.delta,
         v_neden, v_med,
         (SELECT d."xmlDateChange" FROM "XmlProductData" d WHERE d."productId" = r."productId" LIMIT 1)
  ON CONFLICT (xml_log_id) DO NOTHING;
END;
$function$;

-- ============================================================================
-- 2. Trigger Function: cfo_stok_sicrama_trg()
-- XmlStockChangeLog INSERT olayında tetiklenir
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cfo_stok_sicrama_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  BEGIN
    IF NEW.delta <= -5 THEN
      PERFORM cfo_stok_sicrama_kaydet(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- XML senkronunu ASLA bozma
  END;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 3. Trigger: trg_cfo_stok_sicrama
-- XmlStockChangeLog tablosunda INSERT olduğunda çalışır
-- ============================================================================
DROP TRIGGER IF EXISTS trg_cfo_stok_sicrama ON "XmlStockChangeLog";
CREATE TRIGGER trg_cfo_stok_sicrama
AFTER INSERT ON "XmlStockChangeLog"
FOR EACH ROW
EXECUTE FUNCTION cfo_stok_sicrama_trg();

-- ============================================================================
-- 4. Trigger Function: cfo_xml_urun_degisim_trg()
-- XmlProductData INSERT/UPDATE olaylarında tetiklenir
-- XML feed'de değişen alanları cfo_xml_urun_degisim tablosuna kaydeder
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cfo_xml_urun_degisim_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE v_sku text;
BEGIN
  BEGIN
    SELECT sku INTO v_sku FROM "Product" WHERE id = NEW."productId";

    -- INSERT: Yeni ürün feed'e eklendi
    IF TG_OP = 'INSERT' THEN
      INSERT INTO cfo_xml_urun_degisim(
        product_id, sku, alan, eski, yeni, entegra_degisim_zamani
      )
      VALUES (
        NEW."productId",
        COALESCE(v_sku, NEW."xmlSku"),
        'YENI_URUN_FEEDDE',
        NULL,
        NEW."xmlName",
        NEW."xmlDateChange"
      );
      RETURN NEW;
    END IF;

    -- UPDATE: Çeşitli alanlar değişmiş mi kontrol et ve kaydet

    IF NEW."xmlDateChange" IS DISTINCT FROM OLD."xmlDateChange" THEN
      INSERT INTO cfo_xml_urun_degisim(
        product_id, sku, alan, eski, yeni, entegra_degisim_zamani
      )
      VALUES (
        NEW."productId",
        COALESCE(v_sku, NEW."xmlSku"),
        'ENTEGRA_KAYIT_DEGISTI',
        OLD."xmlDateChange",
        NEW."xmlDateChange",
        NEW."xmlDateChange"
      );
    END IF;

    IF NEW."xmlTrendyolPrice" IS DISTINCT FROM OLD."xmlTrendyolPrice" THEN
      INSERT INTO cfo_xml_urun_degisim(
        product_id, sku, alan, eski, yeni, entegra_degisim_zamani
      )
      VALUES (
        NEW."productId",
        COALESCE(v_sku, NEW."xmlSku"),
        'FIYAT_TRENDYOL',
        OLD."xmlTrendyolPrice"::text,
        NEW."xmlTrendyolPrice"::text,
        NEW."xmlDateChange"
      );
    END IF;

    IF NEW."xmlHbPrice" IS DISTINCT FROM OLD."xmlHbPrice" THEN
      INSERT INTO cfo_xml_urun_degisim(
        product_id, sku, alan, eski, yeni, entegra_degisim_zamani
      )
      VALUES (
        NEW."productId",
        COALESCE(v_sku, NEW."xmlSku"),
        'FIYAT_HB',
        OLD."xmlHbPrice"::text,
        NEW."xmlHbPrice"::text,
        NEW."xmlDateChange"
      );
    END IF;

    IF NEW."xmlAmazonPrice" IS DISTINCT FROM OLD."xmlAmazonPrice" THEN
      INSERT INTO cfo_xml_urun_degisim(
        product_id, sku, alan, eski, yeni, entegra_degisim_zamani
      )
      VALUES (
        NEW."productId",
        COALESCE(v_sku, NEW."xmlSku"),
        'FIYAT_AMAZON',
        OLD."xmlAmazonPrice"::text,
        NEW."xmlAmazonPrice"::text,
        NEW."xmlDateChange"
      );
    END IF;

    IF NEW."xmlPrice4" IS DISTINCT FROM OLD."xmlPrice4" THEN
      INSERT INTO cfo_xml_urun_degisim(
        product_id, sku, alan, eski, yeni, entegra_degisim_zamani
      )
      VALUES (
        NEW."productId",
        COALESCE(v_sku, NEW."xmlSku"),
        'FIYAT_4',
        OLD."xmlPrice4"::text,
        NEW."xmlPrice4"::text,
        NEW."xmlDateChange"
      );
    END IF;

    IF NEW."xmlName" IS DISTINCT FROM OLD."xmlName" THEN
      INSERT INTO cfo_xml_urun_degisim(
        product_id, sku, alan, eski, yeni, entegra_degisim_zamani
      )
      VALUES (
        NEW."productId",
        COALESCE(v_sku, NEW."xmlSku"),
        'URUN_ADI',
        OLD."xmlName",
        NEW."xmlName",
        NEW."xmlDateChange"
      );
    END IF;

    IF NEW."missingFromLatestFeed" IS DISTINCT FROM OLD."missingFromLatestFeed" THEN
      INSERT INTO cfo_xml_urun_degisim(
        product_id, sku, alan, eski, yeni, entegra_degisim_zamani
      )
      VALUES (
        NEW."productId",
        COALESCE(v_sku, NEW."xmlSku"),
        CASE
          WHEN NEW."missingFromLatestFeed" THEN 'FEEDDEN_DUSTU'
          ELSE 'FEEDE_GERI_DONDU'
        END,
        OLD."missingFromLatestFeed"::text,
        NEW."missingFromLatestFeed"::text,
        NEW."xmlDateChange"
      );
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- XML senkronunu ASLA bozma
    NULL;
  END;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 5. Triggers: trg_cfo_xml_urun_degisim
-- XmlProductData tablosunda INSERT ve UPDATE olduğunda çalışır
-- ============================================================================
DROP TRIGGER IF EXISTS trg_cfo_xml_urun_degisim ON "XmlProductData";
CREATE TRIGGER trg_cfo_xml_urun_degisim
AFTER INSERT OR UPDATE ON "XmlProductData"
FOR EACH ROW
EXECUTE FUNCTION cfo_xml_urun_degisim_trg();

-- ============================================================================
-- 6. Close/Update Function: cfo_sicrama_kapat()
-- Açık stok sıçramaları kapatmak ve açıklamalarını kaydetmek için
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cfo_sicrama_kapat(
  p_id bigint,
  p_durum text,
  p_aciklama text
)
RETURNS text
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Stok sıçrama kaydını güncelle
  UPDATE cfo_stok_sicrama
  SET
    durum = p_durum,
    aciklama = p_aciklama,
    kapandi_at = now()
  WHERE id = p_id;

  -- Değişimi cfo_change_log'a kaydet (eğer tablo varsa)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cfo_change_log') THEN
    INSERT INTO cfo_change_log(
      id, area, kind, item, "oldValue", "newValue", note, "changedAt"
    )
    SELECT
      gen_random_uuid()::text,
      'stok',
      'teyit',
      'Stok sicramasi kapandi: ' || sku || ' ' || delta,
      'ACIK',
      p_durum,
      p_aciklama,
      now()
    FROM cfo_stok_sicrama
    WHERE id = p_id;
  END IF;

  RETURN 'ok';
END;
$function$;
