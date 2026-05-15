-- Phase 6: Customer Intelligence Expansion
-- Adds CustomerType enum, converts customerType column, and adds new analytics fields.

-- 1. Create CustomerType enum
CREATE TYPE "CustomerType" AS ENUM (
  'TOPTAN',
  'PERAKENDE',
  'SITE_YONETICISI',
  'GUVENLIK_SIRKETI',
  'MAGAZA',
  'ONLINE_SATICI',
  'CUSTOM'
);

-- 2. Convert customerType column from text to enum
--    All existing rows have NULL, so no data loss.
ALTER TABLE "Customer"
  ALTER COLUMN "customerType" TYPE "CustomerType"
  USING "customerType"::"CustomerType";

-- 3. Add monthlySalesPotential (nullable Decimal)
ALTER TABLE "Customer"
  ADD COLUMN "monthlySalesPotential" DECIMAL;

-- 4. Add platformNotes (nullable Text)
ALTER TABLE "Customer"
  ADD COLUMN "platformNotes" TEXT;
