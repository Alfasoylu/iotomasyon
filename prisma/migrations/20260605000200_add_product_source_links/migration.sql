CREATE TABLE "ProductSourceLink" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL DEFAULT '1688',
    "label" TEXT,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSourceLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductSourceLink"
    ADD CONSTRAINT "ProductSourceLink_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProductSourceLink_productId_idx" ON "ProductSourceLink"("productId");
CREATE INDEX "ProductSourceLink_sourceName_idx" ON "ProductSourceLink"("sourceName");
CREATE INDEX "ProductSourceLink_sortOrder_idx" ON "ProductSourceLink"("sortOrder");

INSERT INTO "ProductSourceLink" ("id", "productId", "sourceName", "label", "url", "sortOrder", "createdAt", "updatedAt")
SELECT
    CONCAT('psl_', SUBSTRING(md5("id" || ':1') FROM 1 FOR 21)),
    "id",
    '1688',
    '1688 Link1',
    "source1688Url1",
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Product"
WHERE "source1688Url1" IS NOT NULL
  AND BTRIM("source1688Url1") <> '';

INSERT INTO "ProductSourceLink" ("id", "productId", "sourceName", "label", "url", "sortOrder", "createdAt", "updatedAt")
SELECT
    CONCAT('psl_', SUBSTRING(md5("id" || ':2') FROM 1 FOR 21)),
    "id",
    '1688',
    '1688 Link2',
    "source1688Url2",
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Product"
WHERE "source1688Url2" IS NOT NULL
  AND BTRIM("source1688Url2") <> '';
