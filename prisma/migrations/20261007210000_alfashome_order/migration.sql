-- alfashome.com siparişleri (2026-10-07 panel taraması; kullanıcı: "alfashome siparişleri Entegra Excel'ine düşmüyor,
-- stok XML'den elle düşülüyor"). Panel siparişleri Medusa /crm uçlarından CANLI okuyordu ama hiçbir yere yazmıyordu →
-- CFO ciroda görmüyordu. Bu tablo günlük senkronla doldurulur (lib/alfashome/sync.ts); CFO ayrı ALFASHOME kanalı olarak okur.
-- Kişisel veri YOK: e-posta, ad, telefon, şehir, müşteri kimliği saklanmaz — yalnız sipariş tutarı/tarihi/durumu/adedi.
-- Sipariş kalemlerinde SKU/fiyat gelmediği için ürün bazlı değil, sipariş toplamı bazlıdır.
CREATE TABLE IF NOT EXISTS public.alfashome_order (
  id             text PRIMARY KEY,
  order_no       integer,
  ordered_at     timestamptz,
  amount         numeric(14,2) NOT NULL,
  currency       text NOT NULL DEFAULT 'try',
  status         text,
  payment_status text,
  item_qty       integer NOT NULL DEFAULT 0,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  synced_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alfashome_order_ordered_at_idx ON public.alfashome_order (ordered_at);
ALTER TABLE public.alfashome_order ENABLE ROW LEVEL SECURITY;
-- Data API kapalı (defense-in-depth ile aynı): yalnız postgres (uygulama) ve service_role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.alfashome_order FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.alfashome_order FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN GRANT SELECT ON public.alfashome_order TO cfo_acceptance_reader; END IF;
END $$;
