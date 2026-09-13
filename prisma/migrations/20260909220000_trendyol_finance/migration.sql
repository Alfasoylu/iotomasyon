-- Faz 91 — Trendyol Finans (fatura, kesinti detayı, hakediş)
-- Additive migration. Mevcut tablolara dokunmaz, veri silmez.
-- RLS: docs/MIGRATION-SAFETY.md gereği her yeni public tabloda açılır (deny-all,
-- politika yok — uygulama Prisma/postgres rolüyle bağlanır ve RLS'i bypass eder).
-- Rollback: dosyanın sonundaki ROLLBACK bloğuna bakınız.

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "TrendyolCostGroup" AS ENUM (
    'KOMISYON','KARGO','HIZMET','REKLAM','CEZA','KAMPANYA','ERKEN_ODEME','IADE_ALACAK','DIGER'
);

CREATE TYPE "TrendyolInvoiceLineKind" AS ENUM (
    'KARGO','ISLEM_BEDELI','KESINTI','CEZA','MIKRO_IHRACAT','IADE_BEDELI'
);

-- ── trendyol_invoice ─────────────────────────────────────────────────────────
-- Fatura başlığı. Kaynak: Faturalar_*.xlsx listesi; tekil PDF yüklenirse aynı
-- satır KDV kırılımıyla (netTry/vatTry/grossTry) zenginleşir.
CREATE TABLE "trendyol_invoice" (
    "id"            TEXT NOT NULL,
    "invoiceNo"     TEXT NOT NULL,
    "invoiceDate"   TIMESTAMP(3) NOT NULL,
    "invoiceType"   TEXT NOT NULL,
    "category"      TEXT,
    "costGroup"     "TrendyolCostGroup" NOT NULL DEFAULT 'DIGER',
    "country"       TEXT,
    "status"        TEXT,
    "amountTry"     DECIMAL(15,2) NOT NULL,
    "expenseTry"    DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netTry"        DECIMAL(15,2),
    "vatTry"        DECIMAL(15,2),
    "grossTry"      DECIMAL(15,2),
    "vatRatePct"    DECIMAL(5,2),
    "ettn"          TEXT,
    "description"   TEXT,
    "pdfParsed"     BOOLEAN NOT NULL DEFAULT false,
    "sourceRef"     TEXT,
    "firstSeenFile" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "trendyol_invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trendyol_invoice_invoiceNo_key" ON "trendyol_invoice"("invoiceNo");
CREATE INDEX "trendyol_invoice_invoiceDate_idx"      ON "trendyol_invoice"("invoiceDate");
CREATE INDEX "trendyol_invoice_costGroup_idx"        ON "trendyol_invoice"("costGroup");
CREATE INDEX "trendyol_invoice_invoiceType_idx"      ON "trendyol_invoice"("invoiceType");
CREATE INDEX "trendyol_invoice_country_idx"          ON "trendyol_invoice"("country");
CREATE INDEX "trendyol_invoice_costGroup_invoiceDate_idx" ON "trendyol_invoice"("costGroup", "invoiceDate");
-- Detay dosyası eşleştirmesi toplam tutar üzerinden yapılıyor (lib/trendyol-finance/import.ts).
CREATE INDEX "trendyol_invoice_expenseTry_idx"       ON "trendyol_invoice"("expenseTry");

-- ── trendyol_invoice_line ────────────────────────────────────────────────────
-- Kesinti/kargo/işlem bedeli detay satırı — sipariş bazında maliyet.
CREATE TABLE "trendyol_invoice_line" (
    "id"             TEXT NOT NULL,
    "lineKind"       "TrendyolInvoiceLineKind" NOT NULL,
    "sourceRef"      TEXT NOT NULL,
    "rowHash"        TEXT NOT NULL,
    "invoiceId"      TEXT,
    "orderNumber"    TEXT,
    "shipmentType"   TEXT,
    "shipmentCode"   TEXT,
    "cargoCompany"   TEXT,
    "orderDate"      TIMESTAMP(3),
    "shipDate"       TIMESTAMP(3),
    "amountTry"      DECIMAL(15,2) NOT NULL,
    "orderAmountTry" DECIMAL(15,2),
    "desi"           DECIMAL(8,2),
    "quantity"       INTEGER,
    "description"    TEXT,
    "sourceFile"     TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trendyol_invoice_line_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trendyol_invoice_line_sourceRef_rowHash_key" ON "trendyol_invoice_line"("sourceRef", "rowHash");
CREATE INDEX "trendyol_invoice_line_orderNumber_idx" ON "trendyol_invoice_line"("orderNumber");
CREATE INDEX "trendyol_invoice_line_lineKind_idx"    ON "trendyol_invoice_line"("lineKind");
CREATE INDEX "trendyol_invoice_line_orderDate_idx"   ON "trendyol_invoice_line"("orderDate");
CREATE INDEX "trendyol_invoice_line_invoiceId_idx"   ON "trendyol_invoice_line"("invoiceId");

ALTER TABLE "trendyol_invoice_line"
    ADD CONSTRAINT "trendyol_invoice_line_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "trendyol_invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── trendyol_settlement_line ─────────────────────────────────────────────────
-- Hakediş satırı — SaticiFatura_<id>_*.xlsx "Settlements" sayfası.
CREATE TABLE "trendyol_settlement_line" (
    "id"               TEXT NOT NULL,
    "recordNo"         TEXT NOT NULL,
    "settlementRef"    TEXT,
    "transactionType"  TEXT NOT NULL,
    "orderNumber"      TEXT NOT NULL,
    "orderDate"        TIMESTAMP(3),
    "transactionDate"  TIMESTAMP(3),
    "country"          TEXT,
    "productName"      TEXT,
    "barcode"          TEXT,
    "commissionPct"    DECIMAL(6,2),
    "trendyolShareTry" DECIMAL(15,2),
    "sellerShareTry"   DECIMAL(15,2),
    "totalTry"         DECIMAL(15,2),
    "termDays"         INTEGER,
    "deliveryDate"     TIMESTAMP(3),
    "dueDate"          TIMESTAMP(3),
    "sourceFile"       TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trendyol_settlement_line_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trendyol_settlement_line_recordNo_key"      ON "trendyol_settlement_line"("recordNo");
CREATE INDEX "trendyol_settlement_line_orderNumber_idx"          ON "trendyol_settlement_line"("orderNumber");
CREATE INDEX "trendyol_settlement_line_transactionDate_idx"      ON "trendyol_settlement_line"("transactionDate");
CREATE INDEX "trendyol_settlement_line_dueDate_idx"              ON "trendyol_settlement_line"("dueDate");
CREATE INDEX "trendyol_settlement_line_settlementRef_idx"        ON "trendyol_settlement_line"("settlementRef");

-- ── trendyol_finance_import ──────────────────────────────────────────────────
-- Yükleme günlüğü — "bu dosyayı atmış mıydım" sorusunun yanıtı.
CREATE TABLE "trendyol_finance_import" (
    "id"              TEXT NOT NULL,
    "fileName"        TEXT NOT NULL,
    "fileKind"        TEXT NOT NULL,
    "fileSize"        INTEGER NOT NULL,
    "rowsTotal"       INTEGER NOT NULL DEFAULT 0,
    "rowsNew"         INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated"     INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped"     INTEGER NOT NULL DEFAULT 0,
    "amountTotalTry"  DECIMAL(15,2),
    "periodStart"     TIMESTAMP(3),
    "periodEnd"       TIMESTAMP(3),
    "ok"              BOOLEAN NOT NULL DEFAULT true,
    "error"           TEXT,
    "importedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedByEmail" TEXT,
    CONSTRAINT "trendyol_finance_import_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trendyol_finance_import_importedAt_idx" ON "trendyol_finance_import"("importedAt");
CREATE INDEX "trendyol_finance_import_fileKind_idx"   ON "trendyol_finance_import"("fileKind");

-- ── RLS (deny-all; politika eklenmez) ────────────────────────────────────────
ALTER TABLE "trendyol_invoice"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trendyol_invoice_line"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trendyol_settlement_line"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trendyol_finance_import"   ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS "trendyol_finance_import";
-- DROP TABLE IF EXISTS "trendyol_settlement_line";
-- DROP TABLE IF EXISTS "trendyol_invoice_line";
-- DROP TABLE IF EXISTS "trendyol_invoice";
-- DROP TYPE  IF EXISTS "TrendyolInvoiceLineKind";
-- DROP TYPE  IF EXISTS "TrendyolCostGroup";
