-- CatalogProfile — sektör → katalog kategorileri eşleştirmesi
CREATE TABLE "CatalogProfile" (
  "id"               TEXT NOT NULL,
  "slug"             TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "subtitle"         TEXT NOT NULL,
  "categorySlugs"    TEXT[] NOT NULL,
  "defaultPriceMode" TEXT NOT NULL,
  "enabled"          BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"        INTEGER NOT NULL DEFAULT 100,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CatalogProfile_slug_key" UNIQUE ("slug")
);
CREATE INDEX "CatalogProfile_enabled_idx" ON "CatalogProfile"("enabled");

-- Seed — mevcut hard-coded mapping (lib/catalog-mapping.ts) DÜZELTİLMİŞ versiyon.
-- Önemli düzeltmeler:
--   * Nalbur: CCTV yerine banyo bataryası + el aleti + LED + güç kaynağı
--   * Elektrikçi: CCTV kaldırıldı, aydınlatma + el aleti + ölçüm odaklı
--   * Elektronik mağaza: CCTV küçültüldü, kişisel/aksesuar ürünler eklendi

INSERT INTO "CatalogProfile" ("id", "slug", "title", "subtitle", "categorySlugs", "defaultPriceMode", "sortOrder") VALUES
  ('general', 'general',
   'Ürün Kataloğu', 'Güvenlik · Elektronik · Akıllı Sistemler',
   ARRAY['cctv-kamera-sistemleri', 'akilli-ev-iot-otomasyon', 'telsiz-haberlesme', 'metal-dedektoru'],
   'hidden', 999),

  -- ── GÜVENLİK GRUBU (CCTV ağırlıklı, doğru kalır) ───────────────────
  ('cp-guvenlik-bayisi', 'guvenlik-sistemi-tedarikcisi',
   'Güvenlik Bayileri için Toptan Katalog', 'CCTV · Telsiz · Akıllı Ev · Metal Dedektör',
   ARRAY['cctv-kamera-sistemleri', 'telsiz-haberlesme', 'metal-dedektoru', 'akilli-ev-iot-otomasyon'],
   'wholesale', 10),

  ('cp-guvenlik-kurulum', 'guvenlik-sistemi-kurulum',
   'Kurulum Hizmeti Sağlayıcılar Kataloğu', 'Kameralar · Aksesuar · Akıllı Ev',
   ARRAY['cctv-kamera-sistemleri', 'akilli-ev-iot-otomasyon', 'guc-kaynagi-donusturucu', 'telsiz-haberlesme'],
   'wholesale', 11),

  ('cp-guvenlik-sirketi', 'guvenlik-sirketi',
   'Kurumsal Güvenlik Sistemleri', 'IP Kameralar · NVR · Erişim Kontrol',
   ARRAY['cctv-kamera-sistemleri', 'telsiz-haberlesme', 'metal-dedektoru', 'akilli-ev-iot-otomasyon'],
   'wholesale', 12),

  ('cp-bilgisayar-guvenlik', 'bilgisayar-guvenlik',
   'Bilişim & Güvenlik Hizmet Kataloğu', 'CCTV + Bilgisayar Çevre Birimi + Akıllı Ev',
   ARRAY['cctv-kamera-sistemleri', 'bilgisayar-cevre-baglanti', 'bilgisayar-donanim-sogutucu', 'akilli-ev-iot-otomasyon'],
   'wholesale', 13),

  -- ── YAN BAYİ — DÜZELTİLMİŞ kategoriler ─────────────────────────────
  -- Nalbur: gerçek nalbur ürünleri (musluk, el aleti, aydınlatma, güç, su)
  ('cp-nalbur', 'nalbur',
   'Nalbur & Yapı Marketi Kataloğu', 'Musluk · El Aleti · Aydınlatma · Güç Kaynağı',
   ARRAY['banyo-mutfak-bataryasi', 'el-aleti-lehim', 'aydinlatma-led', 'guc-kaynagi-donusturucu', 'su-aritma-pompa-akvaryum', 'pil-aku'],
   'wholesale', 20),

  ('cp-elektronik-magaza', 'elektronik-magaza',
   'Mağaza Tezgah Ürünleri Kataloğu', 'Hazır setler · Perakende kit',
   ARRAY['cctv-kamera-sistemleri', 'akilli-ev-iot-otomasyon', 'guc-kaynagi-donusturucu', 'telefon-tablet-aksesuar', 'gaming-konsol-aksesuar', 'audio-amfi-hoparlor'],
   'retail', 21),

  ('cp-bilgisayar-servisi', 'bilgisayar-servisi',
   'IT Servisi Çözümleri', 'Starter setler + Çevre birim',
   ARRAY['bilgisayar-cevre-baglanti', 'bilgisayar-donanim-sogutucu', 'cctv-kamera-sistemleri', 'akilli-ev-iot-otomasyon'],
   'wholesale', 22),

  -- Elektrikçi: CCTV kaldırıldı, aydınlatma + el aleti + ölçüm odaklı
  ('cp-elektrikci', 'elektrikci',
   'Elektrikçi Aksesuar Kataloğu', 'Aydınlatma · El Aleti · Güç Kaynağı · Ölçüm',
   ARRAY['aydinlatma-led', 'el-aleti-lehim', 'guc-kaynagi-donusturucu', 'elektronik-modul-gelistirme', 'olcum-test-cihazlari', 'motor-rc-surucu'],
   'wholesale', 23),

  -- ── MONTAJ MÜŞTERİSİ (retail mode, end-user) ───────────────────────
  ('cp-restoran-cafe', 'restoran-cafe',
   'Restoran & Cafe Güvenlik Paketi', '4-8 Kamera Mini Set · Alarm',
   ARRAY['cctv-kamera-sistemleri', 'akilli-ev-iot-otomasyon', 'audio-amfi-hoparlor'],
   'retail', 30),

  ('cp-site-yonetimi', 'site-yonetimi',
   'Site Güvenlik Çözümleri', 'IP/PTZ + NVR + Erişim Kontrol',
   ARRAY['cctv-kamera-sistemleri', 'akilli-ev-iot-otomasyon', 'audio-amfi-hoparlor'],
   'retail', 31),

  ('cp-otel-pansiyon', 'otel-pansiyon',
   'Otel & Pansiyon Güvenlik Çözümü', 'IP Backbone + NVR',
   ARRAY['cctv-kamera-sistemleri', 'akilli-ev-iot-otomasyon', 'audio-amfi-hoparlor'],
   'retail', 32),

  ('cp-ofis-isyeri', 'ofis-isyeri',
   'Ofis & İşyeri Güvenlik Paketi', 'Mini IP Set + Alarm',
   ARRAY['cctv-kamera-sistemleri', 'akilli-ev-iot-otomasyon', 'audio-amfi-hoparlor'],
   'retail', 33);
