-- Phase 5 data migration: seed ProductCategory from existing Product.category strings
-- then link Product.categoryId to the new records.
-- Safe to re-run: INSERT uses ON CONFLICT DO NOTHING, UPDATE is idempotent.

-- Helper: Turkish-aware slug generation
-- Replaces Turkish chars → ASCII, lowercases, replaces non-alnum runs with hyphens, trims hyphens.

WITH distinct_categories AS (
  SELECT DISTINCT
    TRIM(category) AS raw_name
  FROM "Product"
  WHERE category IS NOT NULL
    AND TRIM(category) <> ''
),
slugged AS (
  SELECT
    raw_name,
    TRIM(
      BOTH '-' FROM
      regexp_replace(
        lower(
          translate(
            raw_name,
            'ÇçĞğİıÖöŞşÜü',
            'ccggiioosSuu'
          )
        ),
        '[^a-z0-9]+', '-', 'g'
      )
    ) AS slug
  FROM distinct_categories
)
INSERT INTO "ProductCategory" ("id", "name", "slug", "updatedAt")
SELECT
  -- deterministic id: use gen_random_uuid() cast to text
  gen_random_uuid()::text,
  raw_name,
  slug,
  CURRENT_TIMESTAMP
FROM slugged
ON CONFLICT ("slug") DO NOTHING;

-- Link Product.categoryId to matched ProductCategory row
UPDATE "Product" p
SET "categoryId" = pc."id"
FROM "ProductCategory" pc
WHERE pc."slug" = TRIM(
  BOTH '-' FROM
  regexp_replace(
    lower(
      translate(
        TRIM(p.category),
        'ÇçĞğİıÖöŞşÜü',
        'ccggiioosSuu'
      )
    ),
    '[^a-z0-9]+', '-', 'g'
  )
)
AND p.category IS NOT NULL
AND TRIM(p.category) <> ''
AND p."categoryId" IS NULL;
