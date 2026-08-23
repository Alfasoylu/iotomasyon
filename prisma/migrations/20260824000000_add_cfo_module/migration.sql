-- Faz 90 — CFO Modülü
-- Additive migration. Mevcut tablolara dokunmaz, veri silmez.
-- Rollback: bu dosyanın sonundaki "ROLLBACK" bloğuna bakınız.

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "CfoDataTag"       AS ENUM ('KESIN','TAHMINI','ESKI','GUNCELLEME_GEREKLI','TEYIT_EDILMELI');
CREATE TYPE "CfoCertainty"     AS ENUM ('KESIN','TAHMINI');
CREATE TYPE "CfoLoanStatus"    AS ENUM ('AKTIF','KAPANDI','BEKLEMEDE');
CREATE TYPE "CfoPaymentStatus" AS ENUM ('ODENDI','ODENMEDI','TEYIT_EDILMELI','KISMI_ODENDI');
CREATE TYPE "CfoEventKind"     AS ENUM ('TAHSILAT','KREDI_TAKSITI','KART_ODEMESI','SABIT_GIDER','KMH','VERGI_GUMRUK','DIGER');
CREATE TYPE "CfoImportStatus"  AS ENUM ('PLANLANDI','YOLDA','GUMRUKTE','TESLIM_ALINDI','IPTAL');

-- ── cfo_settings ─────────────────────────────────────────────────────────────
CREATE TABLE "cfo_settings" (
    "id"                    TEXT NOT NULL,
    "usdTryRate"            DECIMAL(10,4) NOT NULL DEFAULT 45,
    "usdRmbRate"            DECIMAL(10,4) NOT NULL DEFAULT 7,
    "kmhMonthlyRatePct"     DECIMAL(6,3)  NOT NULL DEFAULT 4.5,
    "cardMinPct"            DECIMAL(6,3)  NOT NULL DEFAULT 20,
    "marketplaceTermDays"   INTEGER       NOT NULL DEFAULT 30,
    "cashConversionPct"     DECIMAL(6,3)  NOT NULL DEFAULT 70,
    "customsReserveTarget"  DECIMAL(14,2),
    "customsReserveDate"    TIMESTAMP(3),
    "customsReserveSaved"   DECIMAL(14,2) NOT NULL DEFAULT 0,
    "usdWealthTarget"       DECIMAL(14,2),
    "wealthTargetDate"      TIMESTAMP(3),
    "last14dRevenueTry"     DECIMAL(14,2),
    "last14dRevenueDate"    TIMESTAMP(3),
    "monthlyRevenueTarget1" DECIMAL(14,2),
    "monthlyRevenueTarget2" DECIMAL(14,2),
    "stockCostUsd"          DECIMAL(14,2),
    "blockedStockUsd"       DECIMAL(14,2),
    "stockCoverMonths"      DECIMAL(6,2),
    "updatedAt"             TIMESTAMP(3) NOT NULL,
    "updatedByEmail"        TEXT,
    CONSTRAINT "cfo_settings_pkey" PRIMARY KEY ("id")
);

-- ── cfo_bank_account ─────────────────────────────────────────────────────────
CREATE TABLE "cfo_bank_account" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "accountType"    TEXT NOT NULL DEFAULT 'Vadesiz + KMH',
    "balanceTry"     DECIMAL(14,2),
    "kmhLimitTry"    DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monthlyRatePct" DECIMAL(6,3),
    "dataTag"        "CfoDataTag" NOT NULL DEFAULT 'KESIN',
    "sortOrder"      INTEGER NOT NULL DEFAULT 0,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "note"           TEXT,
    "lastUpdatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cfo_bank_account_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cfo_bank_account_isActive_idx" ON "cfo_bank_account"("isActive");

-- ── cfo_credit_card ──────────────────────────────────────────────────────────
CREATE TABLE "cfo_credit_card" (
    "id"                TEXT NOT NULL,
    "bank"              TEXT NOT NULL,
    "holder"            TEXT,
    "statementDebtTry"  DECIMAL(14,2),
    "totalDebtTry"      DECIMAL(14,2),
    "fxDebtUsd"         DECIMAL(12,2),
    "statementDay"      INTEGER,
    "dueDay"            INTEGER,
    "minOverrideTry"    DECIMAL(14,2),
    "currentMonthState" "CfoPaymentStatus" NOT NULL DEFAULT 'TEYIT_EDILMELI',
    "nextDueDate"       TIMESTAMP(3),
    "dataTag"           "CfoDataTag" NOT NULL DEFAULT 'KESIN',
    "sortOrder"         INTEGER NOT NULL DEFAULT 0,
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "note"              TEXT,
    "lastUpdatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cfo_credit_card_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cfo_credit_card_isActive_idx" ON "cfo_credit_card"("isActive");

-- ── cfo_loan ─────────────────────────────────────────────────────────────────
CREATE TABLE "cfo_loan" (
    "id"                  TEXT NOT NULL,
    "bank"                TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "principalTry"        DECIMAL(14,2),
    "remainingTry"        DECIMAL(14,2),
    "earlyPayoffTry"      DECIMAL(14,2),
    "monthlyPaymentTry"   DECIMAL(14,2),
    "paymentDay"          INTEGER,
    "lastInstallmentDate" TIMESTAMP(3),
    "nextPaymentDate"     TIMESTAMP(3),
    "interestRatePct"     DECIMAL(6,3),
    "currentMonthState"   "CfoPaymentStatus" NOT NULL DEFAULT 'TEYIT_EDILMELI',
    "status"              "CfoLoanStatus" NOT NULL DEFAULT 'AKTIF',
    "priority"            TEXT,
    "strategy"            TEXT,
    "dataTag"             "CfoDataTag" NOT NULL DEFAULT 'KESIN',
    "sortOrder"           INTEGER NOT NULL DEFAULT 0,
    "note"                TEXT,
    "lastUpdatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cfo_loan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cfo_loan_status_idx" ON "cfo_loan"("status");

-- ── cfo_fixed_expense ────────────────────────────────────────────────────────
CREATE TABLE "cfo_fixed_expense" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "category"      TEXT,
    "monthlyTry"    DECIMAL(14,2) NOT NULL,
    "paymentDay"    INTEGER,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "dataTag"       "CfoDataTag" NOT NULL DEFAULT 'KESIN',
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    "note"          TEXT,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cfo_fixed_expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cfo_fixed_expense_isActive_idx" ON "cfo_fixed_expense"("isActive");

-- ── cfo_receivable ───────────────────────────────────────────────────────────
CREATE TABLE "cfo_receivable" (
    "id"          TEXT NOT NULL,
    "channel"     TEXT NOT NULL,
    "dueDate"     TIMESTAMP(3) NOT NULL,
    "amountTry"   DECIMAL(14,2) NOT NULL,
    "certainty"   "CfoCertainty" NOT NULL DEFAULT 'KESIN',
    "isCollected" BOOLEAN NOT NULL DEFAULT false,
    "source"      TEXT,
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cfo_receivable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cfo_receivable_dueDate_idx"     ON "cfo_receivable"("dueDate");
CREATE INDEX "cfo_receivable_channel_idx"     ON "cfo_receivable"("channel");
CREATE INDEX "cfo_receivable_isCollected_idx" ON "cfo_receivable"("isCollected");

-- ── cfo_cash_event ───────────────────────────────────────────────────────────
CREATE TABLE "cfo_cash_event" (
    "id"             TEXT NOT NULL,
    "eventDate"      TIMESTAMP(3) NOT NULL,
    "kind"           "CfoEventKind" NOT NULL,
    "description"    TEXT NOT NULL,
    "bank"           TEXT,
    "inflowTry"      DECIMAL(14,2),
    "outflowTry"     DECIMAL(14,2),
    "certainty"      "CfoCertainty" NOT NULL DEFAULT 'TAHMINI',
    "relatedDebt"    TEXT,
    "relatedImport"  TEXT,
    "relatedChannel" TEXT,
    "isSettled"      BOOLEAN NOT NULL DEFAULT false,
    "autoGenerated"  BOOLEAN NOT NULL DEFAULT false,
    "note"           TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cfo_cash_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cfo_cash_event_eventDate_idx" ON "cfo_cash_event"("eventDate");
CREATE INDEX "cfo_cash_event_kind_idx"      ON "cfo_cash_event"("kind");

-- ── cfo_import_project ───────────────────────────────────────────────────────
CREATE TABLE "cfo_import_project" (
    "id"                 TEXT NOT NULL,
    "code"               TEXT NOT NULL,
    "status"             "CfoImportStatus" NOT NULL DEFAULT 'YOLDA',
    "etaDate"            TIMESTAMP(3),
    "totalCostUsd"       DECIMAL(14,2),
    "paidUsd"            DECIMAL(14,2),
    "customsEstimateTry" DECIMAL(14,2),
    "expectedRevenueTry" DECIMAL(14,2),
    "expectedProfitTry"  DECIMAL(14,2),
    "salesMonths"        DECIMAL(6,2),
    "dataTag"            "CfoDataTag" NOT NULL DEFAULT 'TAHMINI',
    "note"               TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cfo_import_project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cfo_import_project_code_key" ON "cfo_import_project"("code");
CREATE INDEX "cfo_import_project_status_idx"      ON "cfo_import_project"("status");

-- ── cfo_snapshot ─────────────────────────────────────────────────────────────
CREATE TABLE "cfo_snapshot" (
    "id"             TEXT NOT NULL,
    "takenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "netWorthTry"    DECIMAL(14,2) NOT NULL,
    "netWorthUsd"    DECIMAL(14,2) NOT NULL,
    "wideWorthTry"   DECIMAL(14,2),
    "wideWorthUsd"   DECIMAL(14,2),
    "cashTry"        DECIMAL(14,2),
    "receivablesTry" DECIMAL(14,2),
    "stockTry"       DECIMAL(14,2),
    "debtTry"        DECIMAL(14,2),
    "usdTryRate"     DECIMAL(10,4),
    "note"           TEXT,
    CONSTRAINT "cfo_snapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cfo_snapshot_takenAt_idx" ON "cfo_snapshot"("takenAt");

-- ── cfo_change_log ───────────────────────────────────────────────────────────
CREATE TABLE "cfo_change_log" (
    "id"        TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "area"      TEXT NOT NULL,
    "item"      TEXT NOT NULL,
    "oldValue"  TEXT,
    "newValue"  TEXT,
    "source"    TEXT,
    "note"      TEXT,
    CONSTRAINT "cfo_change_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cfo_change_log_changedAt_idx" ON "cfo_change_log"("changedAt");
CREATE INDEX "cfo_change_log_area_idx"      ON "cfo_change_log"("area");

-- ── RLS invariant (docs/MIGRATION-SAFETY.md) ─────────────────────────────────
-- Politika eklenmez; deny-all kasıtlıdır. Erişim yalnız Prisma (service role) üzerinden.
ALTER TABLE "cfo_settings"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_bank_account"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_credit_card"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_loan"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_fixed_expense"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_receivable"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_cash_event"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_import_project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_snapshot"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_change_log"     ENABLE ROW LEVEL SECURITY;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS "cfo_change_log","cfo_snapshot","cfo_import_project",
--   "cfo_cash_event","cfo_receivable","cfo_fixed_expense","cfo_loan",
--   "cfo_credit_card","cfo_bank_account","cfo_settings" CASCADE;
-- DROP TYPE IF EXISTS "CfoImportStatus","CfoEventKind","CfoPaymentStatus",
--   "CfoLoanStatus","CfoCertainty","CfoDataTag";
