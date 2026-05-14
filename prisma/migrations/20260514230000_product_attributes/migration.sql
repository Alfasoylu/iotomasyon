-- Product attribute intelligence: global reusable attribute tags,
-- product↔attribute assignments, customer attribute interests.

CREATE TABLE "ProductAttribute" (
  "id"        TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductAttribute_name_key" ON "ProductAttribute"("name");
CREATE INDEX         "ProductAttribute_name_idx" ON "ProductAttribute"("name");

-- ----------------------------------------------------------------
-- product ↔ attribute  (composite PK, cascade on delete)
-- ----------------------------------------------------------------
CREATE TABLE "ProductAttributeAssignment" (
  "productId"   TEXT         NOT NULL,
  "attributeId" TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAttributeAssignment_pkey" PRIMARY KEY ("productId", "attributeId")
);

CREATE INDEX "ProductAttributeAssignment_productId_idx"   ON "ProductAttributeAssignment"("productId");
CREATE INDEX "ProductAttributeAssignment_attributeId_idx" ON "ProductAttributeAssignment"("attributeId");

ALTER TABLE "ProductAttributeAssignment"
  ADD CONSTRAINT "ProductAttributeAssignment_productId_fkey"
  FOREIGN KEY ("productId")   REFERENCES "Product"("id")          ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductAttributeAssignment"
  ADD CONSTRAINT "ProductAttributeAssignment_attributeId_fkey"
  FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- customer ↔ attribute interest  (composite PK, cascade on delete)
-- ----------------------------------------------------------------
CREATE TABLE "CustomerAttributeInterest" (
  "customerId"  TEXT         NOT NULL,
  "attributeId" TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAttributeInterest_pkey" PRIMARY KEY ("customerId", "attributeId")
);

CREATE INDEX "CustomerAttributeInterest_customerId_idx"   ON "CustomerAttributeInterest"("customerId");
CREATE INDEX "CustomerAttributeInterest_attributeId_idx"  ON "CustomerAttributeInterest"("attributeId");

ALTER TABLE "CustomerAttributeInterest"
  ADD CONSTRAINT "CustomerAttributeInterest_customerId_fkey"
  FOREIGN KEY ("customerId")  REFERENCES "Customer"("id")         ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerAttributeInterest"
  ADD CONSTRAINT "CustomerAttributeInterest_attributeId_fkey"
  FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
