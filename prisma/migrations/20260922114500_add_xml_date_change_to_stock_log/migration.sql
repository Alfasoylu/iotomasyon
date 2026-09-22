-- İş 3: XML senkronunda değişim anını yakala
-- XmlStockChangeLog tablosuna XML feed'deki değişim zamanı ve SKU bilgisi ekle

ALTER TABLE "XmlStockChangeLog" ADD COLUMN "xmlDateChange" TEXT;
ALTER TABLE "XmlStockChangeLog" ADD COLUMN "xmlSku" TEXT;

-- Comment'ler
COMMENT ON COLUMN "XmlStockChangeLog"."xmlDateChange" IS 'XML feed''de kaydedilen değişim tarihi/zamanı (Entegra xmlDateChange alanından)';
COMMENT ON COLUMN "XmlStockChangeLog"."xmlSku" IS 'XML feed''deki SKU (product.sku ile eşleşmiyor ise)';
